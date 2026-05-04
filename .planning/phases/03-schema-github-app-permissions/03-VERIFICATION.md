---
phase: 03-schema-github-app-permissions
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 2/3 must-haves verified (SCHEMA-01 + SCHEMA-02 code-verified; SCHEMA-03 requires human action)
human_verification:
  - test: "Apply migrations 0010 and 0011 to production CockroachDB"
    expected: "release_logs gains branch column (varchar 256, default 'main'); all legacy rows backfill to 'main'; slack_action_audit table and created_at DESC index created"
    why_human: "DATABASE_URL is a Firebase App Hosting secret not available in the dev shell. Mike runs `npm run db:push` post-merge per v1.14 precedent established in Phase 02-01 and 04-01."
  - test: "Execute 03-HUMAN-UAT.md Steps 1-4 to upgrade GitHub App Contents permission"
    expected: "Triarch Release Gate App shows Contents = Read and write; installation re-authorized; test workflow_dispatch (Option A, B, or C) succeeds without 403 on git push step"
    why_human: "GitHub App permission upgrades cannot be automated. Claude has no access to github.com/organizations/MyAlterLego/settings/apps. This is a blocking human gate for Phase 4 promote-branch.yml."
---

# Phase 3: Schema + GitHub App Permissions Verification Report

**Phase Goal:** The database has the branch column and audit table needed by subsequent phases, and the GitHub App has write permissions required for the merge step.
**Verified:** 2026-05-03
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `release_logs.branch varchar(256)` column exists in Drizzle schema with `.default('main')` | VERIFIED | `src/db/schema.ts` line 152: `branch: varchar('branch', { length: 256 }).default('main')` — between deployedAt and promotionDispatchedAt as planned |
| 2 | Migration 0010 has ADD COLUMN + backfill UPDATE; existing rows will get 'main' when pushed | VERIFIED | `src/db/migrations/0010_naive_havok.sql` contains both statements separated by `-> statement-breakpoint`; journal + snapshot confirmed |
| 3 | Ingest endpoint accepts optional `branch` and defaults to 'main' when absent | VERIFIED | `route.ts` destructures `branch`, normalizes via `branchValue` (empty/null -> 'main'), inserts `branch: branchValue` |
| 4 | `slack_action_audit` table declared in Drizzle with all 8 SCHEMA-02 columns and DESC index | VERIFIED | `src/db/schema.ts` lines 370-381: all 8 columns present, `actorEmail` nullable, `index('slack_action_audit_created_at_idx').on(table.createdAt.desc())` declared |
| 5 | Migration 0011 creates `slack_action_audit` table + DESC index | VERIFIED | `src/db/migrations/0011_thick_wallow.sql` contains `CREATE TABLE "slack_action_audit"` with all 8 columns + `CREATE INDEX "slack_action_audit_created_at_idx" ON "slack_action_audit" USING btree ("created_at" DESC NULLS LAST)` |
| 6 | DB migrations 0010 + 0011 applied to production CockroachDB | DEFERRED — HUMAN | `DATABASE_URL` is Firebase App Hosting secret; Mike applies post-merge via `npm run db:push` |
| 7 | GitHub App `Triarch Release Gate` has `contents:write`; installation re-authorized; test workflow_dispatch succeeds | DEFERRED — HUMAN | Intentional human-only gate per Plan 03-03 design; runbook delivered at `03-HUMAN-UAT.md` |

**Code-level score:** 5/5 automated truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `branch` column on `releaseLogs` + `slackActionAudit` table with 8 cols + DESC index | VERIFIED | Both additions present; `index` import added to drizzle-orm/pg-core imports |
| `src/db/migrations/0010_naive_havok.sql` | ADD COLUMN branch varchar(256) + UPDATE backfill | VERIFIED | Exact SQL confirmed: `ALTER TABLE "release_logs" ADD COLUMN "branch" varchar(256) DEFAULT 'main';` + backfill UPDATE |
| `src/db/migrations/0011_thick_wallow.sql` | CREATE TABLE slack_action_audit + CREATE INDEX on created_at DESC | VERIFIED | All 8 columns, correct nullability, DESC index with NULLS LAST |
| `src/db/migrations/meta/0010_snapshot.json` | Drizzle snapshot for migration 0010 | VERIFIED | File exists |
| `src/db/migrations/meta/0011_snapshot.json` | Drizzle snapshot for migration 0011 | VERIFIED | File exists |
| `src/db/migrations/meta/_journal.json` | Journal entries for 0010 and 0011 | VERIFIED | Both `0010_naive_havok` and `0011_thick_wallow` tags confirmed |
| `src/app/api/platform/ingest/release-logs/route.ts` | branch field destructured, normalized, inserted | VERIFIED | `branch` destructured; `branchValue` computed with 'main' fallback; `branch: branchValue` in `db.insert().values()` |
| `.planning/phases/03-schema-github-app-permissions/03-HUMAN-UAT.md` | Full runbook: 4 steps, verification checklist, rotation, troubleshooting | VERIFIED | 179-line runbook; all 4 steps present; checklist, rotation, troubleshooting sections confirmed; App settings URL and installations URL included; `actions/create-github-app-token@v1` documented in Option B |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/schema.ts` | `release_logs.branch` | `branch: varchar('branch', { length: 256 }).default('main')` | WIRED | Column declared at correct position (after deployedAt, before promotionDispatchedAt) |
| `src/db/migrations/0010_naive_havok.sql` | `release_logs.branch` | ADD COLUMN + UPDATE backfill | WIRED | Both statements present, separated by `-> statement-breakpoint` |
| `src/app/api/platform/ingest/release-logs/route.ts` | `releaseLogs.branch` | `branch: branchValue` in `db.insert().values()` | WIRED | branchValue normalization (`'main'` fallback) + insert confirmed |
| `src/db/schema.ts` | `slack_action_audit_created_at_idx` | `index('slack_action_audit_created_at_idx').on(table.createdAt.desc())` in third-arg builder | WIRED | Index declaration confirmed in schema |
| `src/db/migrations/0011_thick_wallow.sql` | `CREATE TABLE slack_action_audit` | drizzle-kit generated delta | WIRED | CREATE TABLE + CREATE INDEX both present in migration |
| `03-HUMAN-UAT.md` | GitHub App settings | `https://github.com/organizations/MyAlterLego/settings/apps` URL (Steps 1-2) | WIRED | URL appears twice in runbook; exact toggle steps documented |
| `03-HUMAN-UAT.md verification` | Phase 4 promote-branch.yml | test workflow_dispatch confirms contents:write | WIRED (runbook only) | Three verification options (A/B/C) documented; human must execute |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCHEMA-01 | 03-01-PLAN.md | `release_logs.branch varchar(256)` column; legacy rows backfill to 'main'; ingest endpoint accepts optional branch | SATISFIED | Column in schema.ts; migration 0010 has ADD COLUMN + UPDATE backfill; route.ts threads branchValue into insert |
| SCHEMA-02 | 03-02-PLAN.md | `slack_action_audit` table with 8 columns (id, action_id, actor_email, actor_slack_id, payload_hash, response_status, latency_ms, created_at) + created_at desc index | SATISFIED at code level | All 8 columns confirmed in schema.ts; 0011 migration confirmed; index confirmed |
| SCHEMA-03 | 03-03-PLAN.md | GitHub App `Triarch Release Gate` contents:write permission upgrade; installation re-authorized; test workflow_dispatch succeeds | HUMAN — runbook delivered | 03-HUMAN-UAT.md exists (179 lines, all required sections); human execution pending |

REQUIREMENTS.md traceability table marks SCHEMA-01, SCHEMA-02, SCHEMA-03 as `Complete` for Phase 3. SCHEMA-01 and SCHEMA-02 are verified at code level. SCHEMA-03 is deliverable-complete (runbook shipped) and execution-pending (human gate).

No orphaned requirements — all three Phase 3 requirements are claimed by plans and verified.

---

## Anti-Patterns Found

No blockers or warnings identified.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| No issues found | — | — | — | — |

Checked: `src/db/schema.ts`, `src/db/migrations/0010_naive_havok.sql`, `src/db/migrations/0011_thick_wallow.sql`, `src/app/api/platform/ingest/release-logs/route.ts`.

The `branchValue` normalization in route.ts is a correct guard pattern (empty/null branch -> 'main'), not a stub. The schema-level `.default('main')` without `.notNull()` is an intentional design decision matching the v1.14 env/status precedent.

---

## Human Verification Required

### 1. Apply Migrations 0010 + 0011 to Production

**Test:** After merging this branch, run `npm run db:push` with `DATABASE_URL` set (Firebase App Hosting secret).

**Expected:**
- `release_logs` gains `branch varchar(256) DEFAULT 'main'`
- All existing rows backfill to `branch = 'main'` (UPDATE in 0010)
- `slack_action_audit` table created with all 8 columns
- `slack_action_audit_created_at_idx` (btree DESC) created

**Why human:** `DATABASE_URL` is a Firebase App Hosting secret not present in the local dev shell. This is the established v1.14 precedent (Phase 02-01 migration 0006-0008, Phase 04-01 migration 0009). No programmatic alternative.

**Command:**
```bash
npm run db:push
```

---

### 2. Execute 03-HUMAN-UAT.md for GitHub App Contents Permission Upgrade (SCHEMA-03)

**Test:** Open `.planning/phases/03-schema-github-app-permissions/03-HUMAN-UAT.md` and execute Steps 1-4 end-to-end.

**Expected:**
- App settings page shows Contents = "Read and write"
- Installations page no longer shows the yellow "permissions update required" banner
- Test workflow_dispatch (Option A or B) runs green with a successful push step, OR direct `gh api PUT` (Option C) returns 201
- No other App permissions changed (Actions still Read and write, Metadata still Read-only)

**Why human:** GitHub App permission upgrades require org-admin access to github.com/organizations/MyAlterLego/settings/apps. This cannot be automated. Without this, Phase 4's `promote-branch.yml` will 403 on `git push origin main` after every successful rebase.

**Estimated time:** 5 minutes (Option A) / 10-15 minutes (Option B).

**Resume signal:** Reply "approved" once all items in the runbook's Verification checklist are ticked.

---

## Gaps Summary

No code gaps. Phase 3 has two intentional human deferrals, both by design:

1. **DB push (migrations 0010 + 0011):** `DATABASE_URL` is unavailable in the dev shell — this is the documented v1.14 pattern. Migrations are correct and ready to apply.

2. **GitHub App permission upgrade (SCHEMA-03):** The runbook is delivered and complete (179 lines, 4 steps, verification checklist, rotation, troubleshooting). Human execution is the only remaining step. Phase 4 is blocked until this is done.

Both deferrals were planned in advance and documented in the respective PLAN.md files. No rework is needed.

---

## Commit Evidence

| Commit | Description |
|--------|-------------|
| `de01d4b` | feat(03-01): add release_logs.branch column + migration 0010 |
| `96423a3` | feat(03-01): accept optional branch field in release-logs ingest endpoint |
| `ef5c9e5` | feat(03-02): add slackActionAudit table to schema.ts (SCHEMA-02) |
| `444e258` | feat(03-02): generate migration 0011 for slack_action_audit (SCHEMA-02) |
| `c25331a` | docs(03): SCHEMA-03 GitHub App contents:write upgrade runbook |

All 5 commits confirmed in `git log`. Build status: `tsc --noEmit` clean, `next build` clean (documented in 03-02-SUMMARY.md: "49 static pages, 0 errors").

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
