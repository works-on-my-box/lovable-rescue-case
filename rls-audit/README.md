# RLS audit: what AI app builders generate, how to check it in one pass, how to fix it

Companion scripts for the article on auditing Row Level Security in apps that come out of
Lovable, Bolt or v0 with Supabase behind them. The schema is TaskFlow from this repo
([`../after/supabase/schema.sql`](../after/supabase/schema.sql)) grown to many projects, with
the policies such apps ship with. Everything runs on plain PostgreSQL 16 from `psql`; no app,
no browser.

| File | What it does |
|---|---|
| `00-supabase-shim.sql` | roles `anon` / `authenticated` / `service_role`, `auth.uid()`, default grants: the parts of Supabase the policies depend on. Skip on a real Supabase project |
| `01-schema-as-generated.sql` | five tables, RLS on everywhere, policies the way the builders write them |
| `02-seed.sql` | three users, two projects |
| `03-audit.sql` | one query over `pg_class` and `pg_policy`: every table, every policy, a `findings` column |
| `04-test-as-user.sql` | `set role` + `request.jwt.claims`, the way PostgREST hits the database: what an anonymous key and a signed-in user can read and write |
| `05-fix.sql` | the same tables with policies that name the role, decide by membership and carry `WITH CHECK` |
| `06-test-after-fix.sql` | the same probes; the errors are the point |
| `07-index.sql` | 200,000 tasks: three shapes of the membership policy, the JIT trap, `LIKE` and leakproof ordering, `auth.uid()` bare vs wrapped, the membership index |
| `08-indexes.sql` | the two indexes the fixed policies need; the migration to ship with `05-fix.sql` |

## Run it

```bash
docker run --rm -d -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16   # if you have no PostgreSQL at hand
./run.sh                 # shim, schema, seed, audit, probes, fix, audit again, probes again
./run.sh --with-index    # plus the 200,000-row measurement (about 30 s more)
```

`run.sh` creates and drops a database called `rls_audit` on the server `DATABASE_URL` points at
(default `postgres://postgres:pg@127.0.0.1:5432/postgres`) and needs a superuser, because the
probes use `SET ROLE`. Roles are cluster-wide, so the shim creates the three API roles only if
they are missing and never drops them.

To audit your own database, `03-audit.sql` is the only file you need: it reads catalogs, changes
nothing, and works on any PostgreSQL from 9.5 up.
