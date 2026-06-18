-- Phase: Cross-tenant LLM usage/cost dashboard — receiver table
--
-- Adds the `tenant_llm_usage` table. This is the central platform store for
-- LLM usage/cost summaries pushed daily by each Atlas tenant. The platform
-- is the RECEIVER; the per-tenant push cron lives in the atlas repo
-- (branch feat/llm-usage-report). Both sides share a frozen wire contract:
--
--   POST /api/platform/ingest/llm-usage  (header x-ingest-secret)
--   { tenantSlug, generatedAt,
--     keyPosture: { reasoning, reasoningNoTrain, embedding },
--     windows: [ { period: 'last_24h' | 'mtd', rows: [ { provider, model,
--                  feature, project, costMicros, tokens, calls } ] } ] }
--
-- WINDOW -> period_kind MAPPING (also implemented in the ingest route):
--   the wire window period 'last_24h' is stored as period_kind = 'day'
--   the wire window period 'mtd'      is stored as period_kind = 'mtd'
-- The CHECK constraint below allows only 'day' | 'mtd'.
--
-- Idempotency: a re-push for a (tenant_slug, period_kind) fully REPLACES that
-- window's rows. The ingest route deletes the existing rows for that pair then
-- inserts the fresh set inside one transaction. The unique index below also
-- backstops accidental duplicate (tenant, period, provider, model, feature,
-- project) rows via the route's onConflictDoUpdate path.
--
-- key_posture is denormalized onto every row (it is identical for all rows in
-- a tenant+period push) so the dashboard can read posture per tenant from any
-- row without a separate table.
--
-- CRDB constraint (per ~/.claude/MEMORY/feedback_crdb_split_alter_backfill.md):
-- CREATE TABLE and CREATE INDEX are kept as separate statements; the file is
-- idempotent (IF NOT EXISTS) so it is safe to re-run via the runner.
--
-- HOW TO APPLY (manual; SQL migrations don't auto-run in this app):
--   1. Read DATABASE_URL from .env.local (already populated for prod CRDB)
--   2. npx tsx scripts/run-migration-0024.ts
--   3. Verify in psql: \d tenant_llm_usage — confirm the table and the
--      tenant_llm_usage_unique index exist.

BEGIN;

-- ── tenant_llm_usage table (CRDB-safe, idempotent) ─────────────────────────

CREATE TABLE IF NOT EXISTS tenant_llm_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug  TEXT NOT NULL,
  period_kind  TEXT NOT NULL CHECK (period_kind IN ('day', 'mtd')),
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  feature      TEXT NOT NULL,
  project      TEXT NOT NULL,
  cost_micros  BIGINT NOT NULL DEFAULT 0,
  tokens       BIGINT NOT NULL DEFAULT 0,
  calls        BIGINT NOT NULL DEFAULT 0,
  key_posture  JSONB,
  generated_at TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique on the natural key so a re-push UPSERTs/replaces a single row.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_llm_usage_unique
  ON tenant_llm_usage (tenant_slug, period_kind, provider, model, feature, project);

COMMIT;

-- Verification (run separately):
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'tenant_llm_usage'
--  ORDER BY ordinal_position;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'tenant_llm_usage';
