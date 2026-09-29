-- What the fixed policies cost at 200,000 tasks, which shape of the membership check to
-- write, and which indexes matter. Run after 05-fix.sql. Everything is measured as an
-- ordinary signed-in user who is a member of 5 of the 500 projects, with
-- EXPLAIN (ANALYZE, BUFFERS) on the two queries the app runs most: the dashboard count
-- and one page of a project's tasks.

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

-- helper for shape A below: one membership lookup per candidate row
create or replace function public.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members m
                 where m.project_id = p_project and m.user_id = (select auth.uid()))
$$;
revoke execute on function public.is_project_member(uuid) from public;
grant  execute on function public.is_project_member(uuid) to authenticated;

\set me '''{"sub": "00000000-0000-0000-0001-000000000001", "role": "authenticated"}'''
\set page '''00000000-0000-0000-0002-000000000003'''

-- JIT is switched off for the measurements so that we measure the policies, not the
-- compiler; the section on shape C shows what happens with it on.
set jit = off;

\echo
\echo '=== A. using (public.is_project_member(project_id)) -- a function call per row'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (public.is_project_member(project_id));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

\echo
\echo '=== B. using (project_id in (select public.my_project_ids())) -- what 05-fix.sql installs'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (project_id in (select public.my_project_ids()));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

\echo
\echo '=== C. using (exists (select 1 from project_members m where ...)) -- correlated EXISTS'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (exists (select 1 from public.project_members m
                 where m.project_id = tasks.project_id and m.user_id = (select auth.uid())));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
\echo '--- C with the default jit = on: the cost estimate crosses jit_above_cost'
set jit = on;
explain (analyze, costs on, buffers off) select count(*) from public.tasks;
set jit = off;
\echo '--- for comparison, the cost estimates of A and B never reach the threshold'
reset role;
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (project_id in (select public.my_project_ids()));
set role authenticated;
explain (costs on) select count(*) from public.tasks;
show jit_above_cost;
reset role;

\echo
\echo '=== the two indexes, with shape B in place'
create index tasks_project_id_created_at_idx on public.tasks (project_id, created_at desc);
create index project_members_user_id_idx on public.project_members (user_id, project_id);
analyze public.tasks, public.project_members;
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, buffers, costs off) select count(*) from public.tasks;
explain (analyze, buffers, costs off)
  select * from public.tasks where project_id = :page order by created_at desc limit 10;
reset role;

\echo
\echo '=== LIKE is not leakproof: the policy runs first. Shape A vs shape B on a title search'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (public.is_project_member(project_id));
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, costs off) select count(*) from public.tasks where title like '%Task 1234%';
reset role;
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (project_id in (select public.my_project_ids()));
set role authenticated;
explain (analyze, costs off) select count(*) from public.tasks where title like '%Task 1234%';
reset role;

\echo
\echo '=== auth.uid() bare vs (select auth.uid()), in the policy itself (the generated "own rows" shape)'
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (created_by = auth.uid());
set role authenticated; select set_config('request.jwt.claims', :me, false);
\echo '--- using (created_by = auth.uid())'
explain (analyze, costs off) select count(*) from public.tasks;
reset role;
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (created_by = (select auth.uid()));
set role authenticated;
\echo '--- using (created_by = (select auth.uid()))'
explain (analyze, costs off) select count(*) from public.tasks;
reset role;
-- back to the shape 05-fix.sql installs
drop policy "tasks: members read" on public.tasks;
create policy "tasks: members read" on public.tasks for select to authenticated
  using (project_id in (select public.my_project_ids()));

\echo
\echo '=== the membership table at ~250,000 rows: the helper with and without its index'
insert into public.project_members (project_id, user_id, role)
select ('00000000-0000-0000-0002-' || lpad((1 + floor(random() * 500))::int::text, 12, '0'))::uuid,
       ('00000000-0000-0000-0001-' || lpad((1 + floor(random() * 2000))::int::text, 12, '0'))::uuid,
       'member'
from generate_series(1, 300000) g
on conflict do nothing;
analyze public.project_members;
select count(*) as memberships from public.project_members;
set role authenticated; select set_config('request.jwt.claims', :me, false);
explain (analyze, costs off) select count(*) from public.tasks;
reset role;
drop index public.project_members_user_id_idx;
set role authenticated;
explain (analyze, costs off) select count(*) from public.tasks;
reset role;
create index project_members_user_id_idx on public.project_members (user_id, project_id);
