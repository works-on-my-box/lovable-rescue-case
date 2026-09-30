-- The same tables with policies that say whose row it is.
-- Three rules: every policy names its role; membership decides what you see, and membership
-- lives in one table; every insert and update has a WITH CHECK, so ownership columns cannot
-- be spoofed.

-- Permissive policies are OR-ed together: one leftover using (true) keeps the table open.
drop policy "Enable read access for all users"           on public.profiles;
drop policy "Users can update own profile"               on public.profiles;
drop policy "Enable read access for all users"           on public.projects;
drop policy "Enable insert for authenticated users only" on public.projects;
drop policy "Owners can update projects"                 on public.projects;
drop policy "Enable read access for all users"           on public.project_members;
drop policy "Enable insert for authenticated users only" on public.project_members;
drop policy "Team can read tasks"                        on public.tasks;
drop policy "Team can insert own tasks"                  on public.tasks;
drop policy "Team can update tasks"                      on public.tasks;
drop policy "Team can delete own tasks"                  on public.tasks;
drop policy "Enable all for authenticated users"         on public.comments;

-- Nothing in this app is for signed-out visitors, so anon loses its table grants as well.
-- A policy written later without a TO clause cannot reopen that.
revoke all on all tables in schema public from anon;

-- Which projects is the current user a member of?
-- SECURITY DEFINER: the function runs as its owner. Here that is also the owner of the table,
-- and a table owner is not subject to its policies: no recursion (see 05a-recursion.sql).
-- The schema is not exposed by the API, so nobody can call it as /rpc/my_project_ids.
-- search_path is pinned and the names are schema-qualified, so a caller cannot swap objects in.
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.my_project_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select project_id from public.project_members where user_id = (select auth.uid())
$$;
revoke execute on function private.my_project_ids() from public;
grant  execute on function private.my_project_ids() to authenticated;

-- profiles: your own row plus the people you share a project with. Only your own row is
-- editable, and is_admin is not a column users get to edit at all (column privileges below).
create policy "profiles: read own and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid())
         or id in (select m.user_id from public.project_members m
                   where m.project_id in (select private.my_project_ids())));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;

-- projects: the owner and the members read. A new project has no membership rows yet,
-- and its owner has to see it to add the first one.
-- Anyone signed in may create a project they own; only the owner edits it, and cannot hand
-- it to somebody else.
create policy "projects: owner and members read" on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()) or id in (select private.my_project_ids()));
create policy "projects: create own" on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "projects: owner updates" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- project_members: members see the roster; only the project owner adds people.
create policy "members: read own projects" on public.project_members
  for select to authenticated
  using (project_id in (select private.my_project_ids()));
create policy "members: owner adds" on public.project_members
  for insert to authenticated
  with check (exists (select 1 from public.projects p
                      where p.id = project_members.project_id and p.owner_id = (select auth.uid())));

-- tasks: membership decides. The helper runs once per query and its result is hashed;
-- 07-index.sql measures this shape against a per-row function and a correlated EXISTS.
create policy "tasks: members read" on public.tasks
  for select to authenticated
  using (project_id in (select private.my_project_ids()));
create policy "tasks: members insert as themselves" on public.tasks
  for insert to authenticated
  with check (created_by = (select auth.uid())
              and project_id in (select private.my_project_ids()));
create policy "tasks: members update, task stays in a project of theirs" on public.tasks
  for update to authenticated
  using (project_id in (select private.my_project_ids()))
  with check (project_id in (select private.my_project_ids()));
create policy "tasks: author deletes" on public.tasks
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- comments: visible when the task is visible; the tasks policy does the work.
create policy "comments: read where task is readable" on public.comments
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = comments.task_id));
create policy "comments: write as yourself on a readable task" on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.tasks t where t.id = comments.task_id));
create policy "comments: author deletes" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()));
