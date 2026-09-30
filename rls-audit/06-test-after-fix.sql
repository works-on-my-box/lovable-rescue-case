-- Same probes as 04, after the fix. Errors below are the point.

\echo
\echo '=== anon: the key from the browser bundle, nobody signed in'
set role anon;
select (select count(*) from public.profiles)        as profiles,
       (select count(*) from public.projects)        as projects,
       (select count(*) from public.project_members) as members,
       (select count(*) from public.tasks)           as tasks;
reset role;

\echo
\echo '=== carol signed in (member of Gamma only)'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', false);

\echo '--- what she can read'
select p.name as project, t.title, t.done
from public.tasks t join public.projects p on p.id = t.project_id
order by p.name, t.title;

\echo '--- someone else''s task in Alpha: 0 rows, the row is not there for her'
update public.tasks set done = true
where title = 'Rotate the leaked service key'
returning title, done;

\echo '--- make herself an owner of Alpha'
insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'owner')
returning *;

\echo '--- and an admin'
update public.profiles set is_admin = true where id = auth.uid()
returning full_name, is_admin;

\echo '--- her own task, still fine'
update public.tasks set done = true where title = 'Set up billing'
returning title, done;
reset role;

\echo
\echo '=== bob signed in (member of Alpha, not its owner)'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', false);
select p.name as project, t.title, t.done
from public.tasks t join public.projects p on p.id = t.project_id
order by p.name, t.title;
select full_name from public.profiles order by 1;

\echo '--- the app still works: bob starts a project of his own and adds himself to it'
insert into public.projects (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000b2', 'Beta', '00000000-0000-0000-0000-000000000002')
returning name;
insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000002', 'owner');
select name from public.projects order by 1;
reset role;
