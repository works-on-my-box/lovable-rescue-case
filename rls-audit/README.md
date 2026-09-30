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
| `05a-recursion.sql` | the obvious membership policy and the `infinite recursion detected in policy` error it gets; rolled back |
| `05-fix.sql` | the same tables with policies that name the role, decide by membership and carry `WITH CHECK`; the membership lookup is a `SECURITY DEFINER` function in a schema the API does not expose; ownership columns (`created_by`, `project_id`, `is_admin`) are closed with column privileges; one transaction |
| `05b-leftovers.sql` | the fix applied on top of what the probes in `04` wrote: those rows are still there, and the query that lists them for review |
| `06-test-after-fix.sql` | the same probes on a fresh seed, each write tried with and without `RETURNING`, plus a member trying to take over a teammate's task, and the table privileges the API roles are left with; the errors are the point |
| `07-index.sql` | 200,000 tasks: three shapes of the membership policy, the JIT trap, `LIKE` and leakproof ordering, `auth.uid()` bare vs wrapped, the membership index, one task's comments |
| `08-indexes.sql` | the three indexes the fixed policies need; the migration to ship with `05-fix.sql` |

## Run it

```bash
docker run --rm -d -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16   # if you have no PostgreSQL at hand
./run.sh                 # shim, schema, seed, audit, probes, fix on top of the probes' rows, then on a fresh seed: fix, audit again, probes again
./run.sh --with-index    # plus the 200,000-row measurement (about 30 s more)
```

`run.sh` creates and drops a database called `rls_audit` on the server `DATABASE_URL` points at
(default `postgres://postgres:pg@127.0.0.1:5432/postgres`) and needs a superuser, because the
probes use `SET ROLE`. Roles are cluster-wide, so the shim creates the three API roles only if
they are missing and never drops them.

To audit your own database, `03-audit.sql` is the only file you need: it reads catalogs, changes
nothing, and works on any PostgreSQL from 9.5 up.

## What the fix costs the app, and what it does not cover

- After `05-fix.sql` a member can update `title` and `done` on a task and `full_name` on their
  own profile, column by column. An `update()` that sends the whole row back, and any `upsert()`
  on these two tables, gets `permission denied` until it sends only those columns. Supabase
  prefers a separate table for such columns over column privileges; this is the fix for a
  schema that is already in production, and one later table-level `GRANT UPDATE` undoes it.
- Comments cannot be edited (the generated policy allowed everything; the fix has no update
  policy), members cannot be removed through the API, and a user sees only the profiles of
  people they share a project with, so a member picker has nobody new to offer. A project
  owner can add any user id without that user's consent.
- The helper works because it runs as the owner of `project_members`, and a table owner is
  not subject to the table's policies. It returns nothing in two cases: the table has
  `FORCE ROW LEVEL SECURITY` and its owner is neither a superuser nor `BYPASSRLS`, or the
  function belongs to a role that is neither the table owner, a superuser nor `BYPASSRLS`.
- The revoke and the grants name the five tables. A table or a view created later gets the
  default grants again (until Supabase stops issuing them for the project), and a view runs
  with its owner's rights unless it is created with `security_invoker`.
- `03-audit.sql` reads policies only. It does not look at grants or column privileges, at
  views, at functions or at schemas other than `public`; it looks for a plain `true` and
  does not tell a `RESTRICTIVE` policy from a permissive one.
