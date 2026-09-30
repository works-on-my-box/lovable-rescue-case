-- The two indexes the fixed policies need. 07-index.sql measures the app's two main queries
-- before and after these; this file is the migration to ship together with 05-fix.sql.
-- On a busy table use CREATE INDEX CONCURRENTLY for both (not inside a transaction block).

-- one page of a project's tasks: index scan on the project, newest first, no filtering
create index if not exists tasks_project_id_created_at_idx
  on public.tasks (project_id, created_at desc);

-- the helper my_project_ids() looks up the current user's memberships on every query
create index if not exists project_members_user_id_idx
  on public.project_members (user_id, project_id);
