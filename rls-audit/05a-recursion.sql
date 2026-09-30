-- The obvious membership policy: "you see the membership rows of your own projects", written
-- as a subquery on project_members inside a policy on project_members. PostgreSQL refuses to
-- run it. Shown for the record and rolled back; 05-fix.sql does the same lookup in a function.

begin;
create policy "members: read own projects" on public.project_members
  for select to authenticated
  using (project_id in (select m.project_id from public.project_members m
                        where m.user_id = (select auth.uid())));
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
select * from public.project_members;
rollback;
