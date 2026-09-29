-- The same tables with policies that say whose row it is.
-- Three rules: every policy names its role; membership decides what you see, and membership
-- lives in one table; every write has a WITH CHECK, so ownership columns cannot be spoofed.

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

-- Which projects is the current user a member of?
-- SECURITY DEFINER: the function reads project_members as its owner, so the table's own
-- policies do not apply inside it. Without that, a project_members policy that asks
-- "am I a member?" by reading project_members recurses (error 42P17).
-- search_path pinned and names schema-qualified, so a caller cannot swap in their own objects.
create or replace function public.my_project_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select project_id from public.project_members where user_id = (select auth.uid())
$$;
revoke execute on function public.my_project_ids() from public;
grant  execute on function public.my_project_ids() to authenticated;

-- profiles: your own row plus the people you share a project with. Only your own row is
-- editable, and is_admin is not a column users get to edit at all (column privileges below).
create policy "profiles: read own and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid())
         or id in (select m.user_id from public.project_members m
                   where m.project_id in (select public.my_project_ids())));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;

-- projects: members read; anyone signed in may create a project they own; only the owner edits,
-- and cannot hand it to somebody else through this policy.
create policy "projects: members read" on public.projects
  for select to authenticated
  using (id in (select public.my_project_ids()));
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
  using (project_id in (select public.my_project_ids()));
create policy "members: owner adds" on public.project_members
  for insert to authenticated
  with check (exists (select 1 from public.projects p
                      where p.id = project_id and p.owner_id = (select auth.uid())));

-- tasks: membership decides. The EXISTS form joins to project_members, which the planner
-- can turn into an index lookup; see 07-index.sql for what that is worth.
create policy "tasks: members read" on public.tasks
  for select to authenticated
  using (exists (select 1 from public.project_members m
                 where m.project_id = tasks.project_id and m.user_id = (select auth.uid())));
create policy "tasks: members insert as themselves" on public.tasks
  for insert to authenticated
  with check (created_by = (select auth.uid())
              and project_id in (select public.my_project_ids()));
create policy "tasks: members update, task stays in a project of theirs" on public.tasks
  for update to authenticated
  using (project_id in (select public.my_project_ids()))
  with check (project_id in (select public.my_project_ids()));
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
              and exists (select 1 from public.tasks t where t.id = task_id));
create policy "comments: author deletes" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()));
