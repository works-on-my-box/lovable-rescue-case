#!/usr/bin/env bash
# Runs the whole demo against a PostgreSQL you point it at. Creates and drops a database
# called rls_audit, and creates the roles anon / authenticated / service_role if missing.
#   DATABASE_URL=postgres://postgres:pg@127.0.0.1:5432/postgres ./run.sh
#   ./run.sh --with-index     # also the 200,000-row measurement (adds ~30 s)
# No PostgreSQL at hand:  docker run --rm -d -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
set -euo pipefail
cd "$(dirname "$0")"
url="${DATABASE_URL:-postgres://postgres:pg@127.0.0.1:5432/postgres}"
psql "$url" -q -c 'drop database if exists rls_audit' -c 'create database rls_audit'
db="${url%/*}/rls_audit"
for f in 00-supabase-shim.sql 01-schema-as-generated.sql 02-seed.sql; do
  psql "$db" -q -v ON_ERROR_STOP=1 -f "$f"
done
echo; echo '##### 03-audit.sql: the generated policies'; psql "$db" -f 03-audit.sql
echo; echo '##### 04-test-as-user.sql: what carol can do'; psql "$db" -f 04-test-as-user.sql
psql "$db" -q -v ON_ERROR_STOP=1 -f 05-fix.sql
echo; echo '##### 03-audit.sql again, after 05-fix.sql'; psql "$db" -f 03-audit.sql
echo; echo '##### 06-test-after-fix.sql: the same probes, errors expected'; psql "$db" -f 06-test-after-fix.sql
if [ "${1:-}" = "--with-index" ]; then
  echo; echo '##### 07-index.sql: 200,000 tasks, three policy shapes, two indexes'; psql "$db" -f 07-index.sql
fi
