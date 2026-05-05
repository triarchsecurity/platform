---
phase: 04-promote-branch-workflow
plan: 01
subsystem: database
tags: [drizzle, cockroachdb, schema, migration, promote_attempts, jsonb]

# Dependency graph
requires:
  - phase: 03-schema-github-app-permissions
    provides: "slackActionAudit table pattern (index() DESC, no relations block) used as template for promoteAttempts"
provides:
  - "promoteAttempts Drizzle pgTable export in src/db/schema.ts — all 8 D-13 columns + 2 indexes"
  - "Migration 0012_promote_attempts.sql — CREATE TABLE + two CREATE INDEX statements"
affects: [04-02-admin-callback-endpoint, 04-03-promote-branch-workflow, 04-04-e2e-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New table follows standalone audit-log pattern: no FK references, no relations() block, two non-unique indexes"
    - "Migration SQL written manually (drizzle-kit hung on CockroachDB per Phase 3 precedent)"

key-files:
  created:
    - src/db/migrations/0012_promote_attempts.sql
  modified:
    - src/db/schema.ts

key-decisions:
  - "No CHECK constraint on result column — runtime validation in route handler is the chosen pattern (consistent with Phase 3 slack_action_audit decision)"
  - "No relations() block — promote_attempts is an immutable audit log with no FK references (mirrors slackActionAudit decision from Phase 3)"
  - "meta/_journal.json not manually updated — direct SQL migration pattern established in Phase 3 (drizzle-kit hung on CockroachDB); acceptable per STATE.md precedent"
  - "db:push to production CockroachDB is an advisory human-action step — DATABASE_URL is a Firebase App Hosting secret; Plan 04-02 can be implemented and unit-tested without the push"

patterns-established:
  - "Pattern: promoteAttempts uses index() helper (already imported from Phase 3) for (project, branch) and createdAt.desc() indexes"
  - "Pattern: jsonb column default([]) — empty array default for conflict_files so callers omitting it on merged/ci_failed rows see a valid array"

requirements-completed: [WORKFLOW-05]

# Metrics
duration: 8min
completed: 2026-05-05
---

# Phase 4 Plan 1: promote_attempts Schema + Migration 0012 Summary

**Drizzle `promoteAttempts` pgTable with 8 D-13 columns and 2 indexes, plus matching SQL migration `0012_promote_attempts.sql` following Phase 3's CockroachDB-compatible pattern**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-05T14:16:00Z
- **Completed:** 2026-05-05T14:24:27Z
- **Tasks:** 2 auto (+ 1 advisory human-action checkpoint deferred)
- **Files modified:** 2

## Accomplishments

- Added `promoteAttempts` Drizzle table to `src/db/schema.ts` with all 8 columns from D-13 schema (id, project, branch, result, merge_sha, conflict_files, rebase_error, ci_run_url, created_at) and both required indexes
- Created `src/db/migrations/0012_promote_attempts.sql` following `0011_thick_wallow.sql` formatting conventions: tab indentation, quoted identifiers, `-->statement-breakpoint` separators, `USING btree (...) DESC NULLS LAST`
- TypeScript typecheck passes clean — no new type errors introduced by schema addition

## Task Commits

Each task was committed atomically:

1. **Task 1: Add promoteAttempts table to Drizzle schema** — `8c69c86` (feat)
2. **Task 2: Create migration 0012_promote_attempts.sql** — `329ea10` (chore)

**Plan metadata:** (docs commit below — created with SUMMARY)

## Files Created/Modified

- `src/db/schema.ts` — Added `promoteAttempts` pgTable block after `slackActionAudit`, before `// ── Relations ──` divider; uses already-imported `index` helper
- `src/db/migrations/0012_promote_attempts.sql` — New migration; CREATE TABLE + 2 CREATE INDEX; follows 0011 format exactly

## Decisions Made

- **No CHECK constraint on `result`** — validation lives in the route handler (matches Phase 3 `slackActionAudit` / Phase 2 decision pattern for evolving enums)
- **No `relations()` block** — `promote_attempts` is an immutable audit log with no FK references; mirrors `slackActionAudit` decision from Phase 3 (captured in STATE.md)
- **`meta/_journal.json` not edited** — Phase 3 established that `drizzle-kit` hangs on CockroachDB; direct SQL + manual migration file is the reliable alternative; journal is a Drizzle internal that would only be updated by a successful `drizzle-kit generate` run
- **`conflict_files` default is `[]`** — `jsonb DEFAULT '[]'::jsonb` uses the CockroachDB-compatible syntax (CRDB is PostgreSQL-compatible; verified in RESEARCH.md); callers omitting the field on merged/ci_failed rows see a valid empty array
- **Advisory db:push deferred** — `DATABASE_URL` is a Firebase App Hosting secret; same precedent as Phase 03-01; Plan 04-02 can be unit-tested with mocked DB; actual push required before Plan 04-04 UAT

## Deviations from Plan

None — plan executed exactly as written. Schema code from D-13 and RESEARCH.md Pattern 4 was implemented verbatim.

## Issues Encountered

None.

## Advisory db:push Checkpoint Status

**Status: DEFERRED** — Task 3 is `gate="advisory"` and `type="checkpoint:human-action"`. The `promote_attempts` table does not yet exist in production CockroachDB. This is the same pattern used in Phase 03-01 ("DB push deferred to Mike post-merge — DATABASE_URL is Firebase App Hosting secret").

**Action required (before Plan 04-04 UAT):**

```bash
cd ~/claude/triarch/development/admin
npm run db:push
# OR if drizzle-kit hangs (per STATE.md Phase 02-03 entry):
psql "$DATABASE_URL" -f src/db/migrations/0012_promote_attempts.sql
```

**Verify:**

```bash
psql "$DATABASE_URL" -c "\d promote_attempts"
```

Expected: 9 columns (id, project, branch, result, merge_sha, conflict_files, rebase_error, ci_run_url, created_at) and both indexes (`promote_attempts_project_branch_idx`, `promote_attempts_created_at_idx`).

## Known Stubs

None — this plan delivers schema and migration only; no UI or data-fetching components.

## Next Phase Readiness

- `promoteAttempts` is importable from `@/db/schema` — Plan 04-02 admin callback endpoint can proceed
- Migration file exists and is git-tracked — operator can run `db:push` at any time before Plan 04-04 UAT
- No blocking dependencies: Plan 04-02 (route handler) and Plan 04-03 (shared-workflows YAML) can both proceed in parallel before the physical db:push is needed

---
*Phase: 04-promote-branch-workflow*
*Completed: 2026-05-05*
