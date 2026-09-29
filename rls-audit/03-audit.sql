-- One pass over every table in the public schema: is RLS on, what policies exist,
-- and what is wrong with each of them. Read the "findings" column first.
-- Works on any PostgreSQL from 9.5 up; nothing here is Supabase-specific.
with t as (
  select c.oid, c.relname as tbl, c.relrowsecurity as rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
), p as (
  select polrelid, polname,
         case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                     when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as cmd,
         case when polroles = '{0}' then '{public}' else polroles::regrole[]::text end as roles,
         pg_get_expr(polqual, polrelid)      as using_expr,
         pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy
)
select t.tbl, t.rls_on, p.polname as policy, p.cmd, p.roles, p.using_expr, p.check_expr,
  concat_ws('; ',
    case when not t.rls_on
         then 'RLS OFF: every row open to any role with a grant' end,
    case when t.rls_on and p.polname is null
         then 'RLS on, no policies: the API roles see nothing (app breaks rather than leaks)' end,
    case when p.using_expr = 'true' and p.cmd in ('SELECT', 'ALL')
         then 'reads every row' end,
    case when p.using_expr = 'true' and p.cmd in ('UPDATE', 'DELETE', 'ALL')
         then 'writes or deletes every row' end,
    case when p.roles = '{public}'
         then 'no TO clause: applies to anon as well' end,
    case when p.check_expr = 'true'
         then 'WITH CHECK (true): ownership columns not enforced on write' end,
    case when p.cmd in ('UPDATE', 'ALL') and p.check_expr is null and p.using_expr <> 'true'
         then 'no WITH CHECK: USING is reused for the new row' end,
    case when coalesce(p.using_expr, '') || coalesce(p.check_expr, '') ~ 'auth\.(uid|jwt|role)\(\)'
          and coalesce(p.using_expr, '') || coalesce(p.check_expr, '') !~* '\(\s*select auth\.'
         then 'auth.*() not wrapped in (select ...): evaluated per row' end
  ) as findings
from t
left join p on p.polrelid = t.oid
order by t.tbl, p.cmd, p.polname;
