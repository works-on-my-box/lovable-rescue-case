-- Test the policies the way the API hits them: switch to the API role and set the JWT claims,
-- exactly what PostgREST does for every request. No app, no browser, no clicking.
-- Run as a superuser (or the table owner) so that SET ROLE works.

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

\echo '--- what she can write: someone else''s task in Alpha'
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

\echo '--- a policy with USING but no WITH CHECK: hand her own project to alice'
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', false);
update public.projects set owner_id = '00000000-0000-0000-0000-000000000001'
where name = 'Gamma'
returning name, owner_id;
reset role;
