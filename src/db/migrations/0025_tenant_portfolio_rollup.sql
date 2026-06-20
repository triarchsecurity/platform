-- Cross-tenant Foundry Situational-Awareness portfolio rollup — receiver table.
--
-- Each Atlas tenant pushes its OWN PII-free portfolio rollup here daily; the platform
-- is the RECEIVER and aggregates across tenants. The per-tenant push cron lives in the
-- atlas repo (/api/internal/portfolio-rollup-report). Frozen wire contract:
--
--   POST /api/platform/ingest/portfolio-rollup   (header x-ingest-secret)
--   { tenantSlug, generatedAt,
--     rollup: { categories: [ { category, count, maxSeverity,
--               severityCounts: { critical, warn, info, unknown }, totalAtRiskUsd } ] } }
--
-- PII-FREE by construction: per-category counts + max severity + an at-risk-$ SUM only —
-- never an entity id, contact, or per-record value. total_at_risk_micros stores the $ SUM
-- as integer micros (mirrors tenant_llm_usage.cost_micros); null when no signal carried a value.
--
-- Idempotency: a re-push for a tenant fully REPLACES that tenant's rows — the ingest route
-- DELETEs the tenant's rows then INSERTs the fresh per-category set inside one transaction;
-- the unique index below also backstops duplicate (tenant_slug, category) via onConflictDoUpdate.
--
-- CRDB constraint: CREATE TABLE and CREATE INDEX are kept as separate statements.

CREATE TABLE IF NOT EXISTS tenant_portfolio_rollup (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_slug          TEXT NOT NULL,
  category             TEXT NOT NULL,
  count                INT8 NOT NULL DEFAULT 0,
  max_severity         TEXT,
  severity_counts      JSONB NOT NULL,
  total_at_risk_micros INT8,
  generated_at         TIMESTAMPTZ NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_portfolio_rollup_category_check
    CHECK (category IN ('health', 'ingest', 'intelGaps', 'focus')),
  CONSTRAINT tenant_portfolio_rollup_max_severity_check
    CHECK (max_severity IS NULL OR max_severity IN ('critical', 'warn', 'info', 'unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_portfolio_rollup_unique
  ON tenant_portfolio_rollup (tenant_slug, category);
