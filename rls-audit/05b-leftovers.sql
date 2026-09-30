-- A live database is not reseeded. Here 05-fix.sql has been applied on top of the rows carol
-- wrote in 04-test-as-user.sql, while the generated policies were open. The new policies
-- refuse the same writes from now on; they do not take back what is already in the tables.

set role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', false);

\echo '--- what carol can read in Alpha'
select t.title, t.done
from public.tasks t join public.projects p on p.id = t.project_id
where p.name = 'Alpha'
order by t.title;
reset role;

-- As the table owner: the rows the old policies let anyone write. In this schema that is
-- an owner row that does not match projects.owner_id, and the admin flag. New policies
-- refuse new writes; these rows have to be found and reviewed by hand.
\echo '--- no policy takes back rows written under the old ones. to review on a live database:'
select p.name as project, pr.full_name as member, m.role
from public.project_members m
join public.projects p on p.id = m.project_id
join public.profiles pr on pr.id = m.user_id
where m.role = 'owner' and m.user_id <> p.owner_id;
select full_name, is_admin from public.profiles where is_admin;
