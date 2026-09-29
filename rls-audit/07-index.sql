-- What the fixed policies cost at 200,000 tasks, and which index makes the difference.
-- Run after 05-fix.sql. Everything is measured as an ordinary signed-in user who is a
-- member of 5 of the 500 projects, with EXPLAIN (ANALYZE, BUFFERS) on the two queries
-- the app actually runs: the dashboard count and one page of a project's tasks.

\echo '=== seeding: 2,000 users, 500 projects, ~4 members each, 200,000 tasks'
select setseed(0.42);
insert into auth.users (id, email)
select ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, 'user' || g || '@example.com'
from generate_series(1, 2000) g;
insert into public.profiles (id, full_name)
select id, 'User ' || right(id::text, 4) from auth.users where id::text like '00000000-0000-0000-0001-%';
insert into public.projects (id, name, owner_id)
select ('00000000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid, 'Project ' || g,
       ('00000000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid
from generate_series(1, 500) g;
insert into public.project_members (project_id, user_id, role)
select id, owner_id, 'owner' from public.projects where id::text like '00000000-0000-0000-0002-%';
insert into public.project_members (project_id, user_id, role)
select p.id, ('00000000-0000-0000-0001-' || lpad(r.u::text, 12, '0'))::uuid, 'member'
from public.projects p
cross join lateral (select 1 + floor(random() * 2000)::int as u from generate_series(1, 3)) r
where p.id::text like '00000000-0000-0000-0002-%'
on conflict do nothing;
-- the user we measure as: owner of project 1, member of projects 2..5
insert into public.project_members (project_id, user_id, role)
select ('00000000-0000-0000-0002-' || lpad(g::text, 12, '0'))::uuid,
       '00000000-0000-0000-0001-000000000001', 'member'
from generate_series(2, 5) g
on conflict do nothing;
insert into public.tasks (project_id, title, done, created_by, created_at)
select p.id, 'Task ' || g, g % 3 = 0, p.owner_id, now() - g * interval '1 minute'
from generate_series(1, 200000) g
join public.projects p
  on p.id = ('00000000-0000-0000-0002-' || lpad((1 + g % 500)::text, 12, '0'))::uuid;
analyze;
select (select count(*) from public.tasks) as tasks,
       (select count(*) from public.project_members) as memberships,
       (select count(*) from public.project_members
        where user_id = '00000000-0000-0000-0001-000000000001') as my_projects;

-- helper used by variant A below: one membership lookup per candidate row
create or replace function public.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m
                 where m.project_id = p_project and m.user_id = (select auth.uid()))
$$;
revoke execute on function public.is_project_member(uuid) from public;
grant  execute on function public.is_project_member(uuid) to authenticated;

\set me '''{"sub": "00000000-0000-0000-0001-000000000001", "role": "authenticated"}'''
\set page '''00000000-0000-0000-0002-000000000003'''

-- A trap that hides behind policies with subqueries: the planner prices the policy's subplan
-- as if it ran once per row, the estimate crosses jit_above_cost (100000 by default), and the
-- query gets JIT-compiled on every execution. Compile time dwarfs the query. Shown once, then
-- switched off for the measurements so we measure the policies, not the compiler.
\echo
\echo '=== JIT: the fixed policy, count(*) with jit on (default) and off'
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, costs on, buffers off) select count(*) from public.tasks;
set jit = off;
explain (analyze, costs on, buffers off) select count(*) from public.tasks;
reset role;
set jit = off;

-- Variant A: a SECURITY DEFINER function called for every candidate row.
\echo
\echo '=== A. using (public.is_project_member(project_id)) -- one lookup per row'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (public.is_project_member(project_id));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

-- Variant B: one subquery, evaluated once, hashed; cannot use an index on tasks.
\echo
\echo '=== B. using (project_id in (select public.my_project_ids())) -- hashed subplan'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (project_id in (select public.my_project_ids()));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

-- Variant C: correlated EXISTS against project_members (what 05-fix.sql installs).
\echo
\echo '=== C. using (exists (select 1 from project_members m where ...)) -- joinable'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (exists (select 1 from public.project_members m
                 where m.project_id = tasks.project_id and m.user_id = (select auth.uid())));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

\echo
\echo '=== C + indexes on the policy columns'
create index tasks_project_id_created_at_idx on public.tasks (project_id, created_at desc);
create index project_members_user_id_idx on public.project_members (user_id, project_id);
analyze public.tasks, public.project_members;
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

\echo
\echo '=== A and B again, now that the indexes exist'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (public.is_project_member(project_id));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (project_id in (select public.my_project_ids()));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

-- leave the database in the state 05-fix.sql describes
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (exists (select 1 from public.project_members m
                 where m.project_id = tasks.project_id and m.user_id = (select auth.uid())));

\echo
\echo '=== bonus: auth.uid() per row vs (select auth.uid()) once, on the delete policy shape'
drop policy "tasks: author deletes" on public.tasks;
create policy "tasks: author deletes" on public.tasks for delete to authenticated
  using (created_by = auth.uid());
set role authenticated; select set_config('request.jwt.claims', :me, false);
\echo '--- created_by = auth.uid()'
explain (analyze, buffers, costs off) select count(*) from public.tasks where created_by = auth.uid();
\echo '--- created_by = (select auth.uid())'
explain (analyze, buffers, costs off) select count(*) from public.tasks where created_by = (select auth.uid());
reset role;
drop policy "tasks: author deletes" on public.tasks;
create policy "tasks: author deletes" on public.tasks for delete to authenticated
  using (created_by = (select auth.uid()));
