-- v1.14.0 backfill: customer release gating
-- Apply manually after `npm run db:push` succeeds:
--     psql $DATABASE_URL -f src/db/migrations/v1.14.0-backfill.sql
-- All statements are idempotent — re-running is a no-op.

-- 1. Backfill release_logs: existing rows are dev deploys with status=dev,
--    deployed_at copied from created_at as best-available proxy.
UPDATE release_logs
SET env = 'dev',
    status = 'dev',
    deployed_at = created_at
WHERE env IS NULL OR status IS NULL OR deployed_at IS NULL;

-- 2. Backfill project_members: every project gets mike@triarchsecurity.com
--    as admin if no admin exists yet. (No createdBy column on projects;
--    Mike is de facto creator per PROJECT.md.)
INSERT INTO project_members (project_key, email, role)
SELECT projects.key, 'mike@triarchsecurity.com', 'admin'
FROM projects
WHERE NOT EXISTS (
  SELECT 1 FROM project_members pm
  WHERE pm.project_key = projects.key
    AND pm.role = 'admin'
    AND lower(pm.email) = 'mike@triarchsecurity.com'
);

-- 3. Seed staff role: wildcard project_members row identifies global staff.
--    Add additional staff via SQL after this file runs.
INSERT INTO project_members (project_key, email, role)
SELECT '*', 'mike@triarchsecurity.com', 'staff'
WHERE NOT EXISTS (
  SELECT 1 FROM project_members
  WHERE project_key = '*'
    AND role = 'staff'
    AND lower(email) = 'mike@triarchsecurity.com'
);
