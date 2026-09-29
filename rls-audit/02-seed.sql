-- Three people, two projects. Alice owns Alpha and works on it with Bob. Carol owns Gamma alone.
-- Fixed ids so the psql sessions below are readable: ...0001 alice, ...0002 bob, ...0003 carol,
-- ...00a1 project Alpha, ...00c3 project Gamma.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'bob@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'carol@example.com');

insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-000000000001', 'Alice'),
  ('00000000-0000-0000-0000-000000000002', 'Bob'),
  ('00000000-0000-0000-0000-000000000003', 'Carol');

insert into public.projects (id, name, owner_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Alpha', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000c3', 'Gamma', '00000000-0000-0000-0000-000000000003');

insert into public.project_members (project_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 'member'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000003', 'owner');

insert into public.tasks (project_id, title, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'Rotate the leaked service key', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a1', 'Write RLS policies for comments', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000c3', 'Pick a domain name',            '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-0000000000c3', 'Set up billing',                '00000000-0000-0000-0000-000000000003');

insert into public.comments (task_id, author_id, body)
select t.id, t.created_by, 'First comment on ' || t.title from public.tasks t;
