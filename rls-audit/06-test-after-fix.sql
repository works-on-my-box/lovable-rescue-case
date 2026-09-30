-- Same probes as 04, after the fix. Errors below are the point.
-- A statement with WHERE or RETURNING is also checked against the SELECT policy, so a probe
-- that reads a column proves the read policy, not the write policy. Each write is therefore
-- tried twice: the way the app sends it, and bare, where only the write policy stands.

select id as alpha_task from public.tasks where title = 'Rotate the leaked service key' \gset

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
\echo '--- the same update, no WHERE, no RETURNING: her own two tasks'
update public.tasks set done = true;

\echo '--- make herself an owner of Alpha'
insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'owner')
returning *;
\echo '--- the same insert without RETURNING'
insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'owner');

\echo '--- and an admin'
update public.profiles set is_admin = true where id = auth.uid()
returning full_name, is_admin;

\echo '--- her own task, still fine'
update public.tasks set done = true where title = 'Set up billing'
returning title, done;

\echo '--- a comment on a task in Alpha, by its id, without RETURNING'
insert into public.comments (task_id, author_id, body)
values (:'alpha_task', '00000000-0000-0000-0000-000000000003', 'hello from carol');

\echo '--- profiles: her own row only, she shares no project with anyone'
select 'carol reads ' || count(*) || ' profile(s)' as profiles from public.profiles;

\echo '--- TRUNCATE is not subject to row security: the grant has to be gone'
truncate public.comments;
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

\echo '--- a teammate''s task: he cannot make himself its author'
update public.tasks set created_by = auth.uid()
where title = 'Rotate the leaked service key'
returning title;

\echo '--- the app still works: bob starts a project of his own and adds himself to it'
insert into public.projects (id, name, owner_id)
values ('00000000-0000-0000-0000-0000000000b2', 'Beta', '00000000-0000-0000-0000-000000000002')
returning name;
insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000002', 'owner')
returning role;

\echo '--- and he cannot move the teammate''s task into it'
update public.tasks set project_id = '00000000-0000-0000-0000-0000000000b2'
where title = 'Rotate the leaked service key'
returning title;
select name from public.projects order by 1;

\echo '--- the rest of what a member who is not the owner or the author may not do, one probe each'
insert into public.tasks (project_id, title, created_by)
values ('00000000-0000-0000-0000-0000000000a1', 'Filed under her name', '00000000-0000-0000-0000-000000000001');
insert into public.comments (task_id, author_id, body)
values (:'alpha_task', '00000000-0000-0000-0000-000000000001', 'Signed as alice');
delete from public.tasks where title = 'Rotate the leaked service key';
delete from public.comments where body = 'First comment on Rotate the leaked service key';
update public.projects set name = 'Alpha, renamed' where name = 'Alpha';
insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'member');
update public.profiles set full_name = 'Renamed by bob' where full_name = 'Alice';
reset role;

\echo
\echo '=== carol again: what is left of the read policies, and her own project'
set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', false);
select 'carol reads ' || (select count(*) from public.projects) || ' project(s), '
       || (select count(*) from public.project_members) || ' membership row(s), '
       || (select count(*) from public.comments) || ' comment(s)' as reads;
\echo '--- a task of her own in Alpha, a project in somebody else''s name, and her own project handed to alice'
insert into public.tasks (project_id, title, created_by)
values ('00000000-0000-0000-0000-0000000000a1', 'Planted by carol', '00000000-0000-0000-0000-000000000003');
insert into public.projects (name, owner_id) values ('Planted', '00000000-0000-0000-0000-000000000001');
update public.projects set owner_id = '00000000-0000-0000-0000-000000000001' where name = 'Gamma';
reset role;

-- The API has no way to remove a member (there is no delete policy on project_members), so
-- the removal is done here as the table owner and rolled back.
\echo
\echo '=== bob after he is taken off Alpha (as the table owner; rolled back)'
begin;
delete from public.project_members
where project_id = '00000000-0000-0000-0000-0000000000a1'
  and user_id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
\echo '--- a bare DELETE: his old task in Alpha stays, and so does his old comment'
delete from public.tasks;
delete from public.comments;
rollback;

-- Not a probe: what the two API roles still hold on the tables. A table left out of the
-- revoke in 05-fix.sql shows up here even when no probe above happens to touch it.
\echo
\echo '=== table privileges left to the API roles (as the table owner)'
select 'anon holds ' || count(*) filter (where grantee = 'anon')
       || ' table privilege(s); authenticated holds '
       || count(*) filter (where grantee = 'authenticated'
                           and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
       || ' beyond select, insert, update, delete' as grants
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');
