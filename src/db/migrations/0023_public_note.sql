-- Phase: Public admin notes on bugs/features (TRI-16, AC2 of TRI-9)
--
-- Adds a nullable `public_note` text column to `bug_reports` and
-- `feature_requests`. This is the customer-visible counterpart to the
-- existing internal `triarch_notes` column: staff may attach a public note
-- when triaging, and that note (and only that note — never triarch_notes) is
-- surfaced to the requester on the interface they submitted from.
--
-- Background:
-- - bug_reports / feature_requests have only `triarch_notes` (internal,
--   never exposed to customers). TRI-9's customer read path
--   (PUBLIC_BUG_COLUMNS / PUBLIC_FEATURE_COLUMNS in the platform bug-reports /
--   feature-requests routes) intentionally excludes triarch_notes. This
--   migration introduces a field that path can safely project.
-- - The column is nullable with no default: existing rows have no public
--   note until staff add one. Purely additive; safe to deploy ahead of the
--   read/UI wiring (expand phase of expand/contract).
--
-- CRDB constraint (per ~/.claude/MEMORY/feedback_crdb_split_alter_backfill.md):
-- CockroachDB rejects UPDATE on a newly-added column in the same batch as
-- the ALTER. We don't UPDATE here, but each ALTER is its own statement so
-- this file stays safe to re-run via psql -f even if a future hand-edit adds
-- a backfill.
--
-- HOW TO APPLY (manual; SQL migrations don't auto-run in this app):
--   1. Read DATABASE_URL from .env.local (already populated for prod CRDB)
--   2. npx tsx scripts/run-migration-0023.ts
--   3. Verify in psql: \d bug_reports and \d feature_requests — confirm the
--      public_note column exists on both.

BEGIN;

-- ── public_note column (one ALTER per table, CRDB-safe, idempotent) ────────

ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS public_note TEXT;

ALTER TABLE feature_requests ADD COLUMN IF NOT EXISTS public_note TEXT;

COMMIT;

-- Verification (run separately):
-- SELECT table_name, column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE column_name = 'public_note'
--    AND table_name IN ('bug_reports', 'feature_requests')
--  ORDER BY table_name;
