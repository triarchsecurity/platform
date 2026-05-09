---
phase: 03-schema-github-app-permissions
plan: 01
subsystem: database
tags: [drizzle, cockroachdb, migration, schema, release-logs, branch]

# Dependency graph
requires: []
provides:
  - "release_logs.branch varchar(256) DEFAULT 'main' column in Drizzle schema and DB migration"
  - "Migration 0010_naive_havok.sql: ADD COLUMN + UPDATE backfill for existing rows"
  - "Ingest endpoint accepts optional branch field, normalizes to 'main' when absent"
affects:
  - "05-rc-customer-page — Phase 5 groups releases by branch via this column"
  - "06-promote-branch-workflow — Phase 6 writes non-main branch values on dispatch"
  - "02-shared-workflows — Phase 2 will start passing branch context in CI payloads once shipped"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle nullable column with DEFAULT for backfill compatibility (matches v1.14 env/status pattern)"
    - "Two-statement migration: ADD COLUMN + UPDATE backfill in same file separated by statement-breakpoint"
    - "Endpoint-level default normalization (empty/null branch → 'main') complements schema-level DEFAULT"

key-files:
  created:
    - "src/db/migrations/0010_naive_havok.sql"
    - "src/db/migrations/meta/0010_snapshot.json"
  modified:
    - "src/db/schema.ts"
    - "src/db/migrations/meta/_journal.json"
    - "src/app/api/platform/ingest/release-logs/route.ts"

key-decisions:
  - "branch column left nullable (no .notNull()) — matches v1.14 env/status precedent; DEFAULT handles new inserts; backfill UPDATE handles legacy rows"
  - "DB push deferred to Mike post-merge — DATABASE_URL is Firebase App Hosting secret, not available in dev shell"
  - "Endpoint normalizes null/empty branch to 'main' in addition to schema DEFAULT — prevents NULL bucket in Phase 5 GROUP BY"

patterns-established:
  - "SCHEMA-01 column placement: v2.0 Phase 3 additions go between deployedAt and promotionDispatchedAt"
  - "Migration backfill: manually append UPDATE statement after drizzle-kit auto-generates ADD COLUMN"

requirements-completed: [SCHEMA-01]

# Metrics
duration: 2min
completed: 2026-05-04
---

# Phase 03 Plan 01: release_logs.branch Column + Migration 0010 Summary

**release_logs.branch varchar(256) DEFAULT 'main' added via Drizzle schema, migration 0010 with ADD COLUMN + backfill UPDATE generated, ingest endpoint accepts optional branch field**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-04T22:09:47Z
- **Completed:** 2026-05-04T22:11:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `branch: varchar('branch', { length: 256 }).default('main')` to `releaseLogs` table in schema.ts, inserted between `deployedAt` and Phase 4 promotion dispatch audit comment block
- Generated migration `0010_naive_havok.sql` via `npm run db:generate` (drizzle-kit), then manually appended backfill UPDATE statement so existing v1.14 rows get `branch = 'main'` when Mike applies the migration
- Extended `/api/platform/ingest/release-logs` POST handler to destructure `branch` from request body, normalize empty/missing values to `'main'`, and thread `branchValue` into the `db.insert(releaseLogs).values()` call

## Task Commits

1. **Task 1: Add branch column to releaseLogs schema + generate migration 0010** - `de01d4b` (feat)
2. **Task 2: Accept optional branch field in release-logs ingest endpoint** - `96423a3` (feat)

## Files Created/Modified

- `src/db/schema.ts` — Added `branch: varchar('branch', { length: 256 }).default('main')` after `deployedAt` column, before Phase 4 audit comment block
- `src/db/migrations/0010_naive_havok.sql` — Generated migration: `ALTER TABLE "release_logs" ADD COLUMN "branch" varchar(256) DEFAULT 'main';` + backfill `UPDATE "release_logs" SET "branch" = 'main' WHERE "branch" IS NULL;`
- `src/db/migrations/meta/0010_snapshot.json` — Auto-generated Drizzle snapshot for migration 0010
- `src/db/migrations/meta/_journal.json` — Updated by drizzle-kit with 0010 entry (idx 10, tag `0010_naive_havok`)
- `src/app/api/platform/ingest/release-logs/route.ts` — Added `branch` destructuring, `branchValue` normalization, and `branch: branchValue` in insert values

## Decisions Made

- **Column nullable, not notNull**: Keeps schema consistent with v1.14 `env`/`status` pattern. DEFAULT handles new inserts; backfill UPDATE handles the window of existing rows. No need to re-declare notNull after backfill.
- **DB push deferred to Mike**: `DATABASE_URL` is a Firebase App Hosting secret not present in dev shell. Mike applies via `npm run db:push` post-merge. This is the v1.14 Phase 02-01 / 04-01 precedent.
- **Endpoint default is 'main' not null**: Phase 5 groups releases by branch; NULL values would create a "(no branch)" bucket. Both schema DEFAULT and endpoint normalization defend against this.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**DB push deferred to Mike post-merge.**

After merging this branch, apply the migration:

```bash
npm run db:push
```

This requires `DATABASE_URL` (Firebase App Hosting secret). Migration `0010_naive_havok.sql` will:
1. `ALTER TABLE "release_logs" ADD COLUMN "branch" varchar(256) DEFAULT 'main';`
2. `UPDATE "release_logs" SET "branch" = 'main' WHERE "branch" IS NULL;` (backfills all v1.14 legacy rows)

## Next Phase Readiness

- SCHEMA-01 complete at code level — `release_logs.branch` column declared, migration 0010 committed, ingest endpoint wired
- Plan 03-02 can proceed immediately (generates migration 0011 for `slack_action_audit` table — sequential snapshot dependency satisfied)
- Phase 5 (customer RC page) can GROUP BY branch once Mike applies migration 0010 post-merge
- Phase 6 (promoteAndAudit) can write non-main branch values through the same ingest endpoint pattern

---
*Phase: 03-schema-github-app-permissions*
*Completed: 2026-05-04*
