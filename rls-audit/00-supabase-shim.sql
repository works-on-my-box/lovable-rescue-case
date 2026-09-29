-- Stand-in for the parts of Supabase that the policies below depend on.
-- Run it on plain PostgreSQL only; on a real Supabase project all of this already exists.
-- Tested on PostgreSQL 16.

-- The three roles PostgREST switches between per request. service_role bypasses RLS, as on Supabase.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;

-- Supabase puts the claims of the request's JWT into the request.jwt.claims setting.
-- auth.uid() reads the "sub" claim out of it. That is the only thing the policies need.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

-- Stand-in for auth.users, which profiles references.
create table if not exists auth.users (
  id    uuid primary key,
  email text unique not null
);

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Supabase grants the API roles full access to every table in public by default.
-- Row Level Security is the only thing between those roles and the rows.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
