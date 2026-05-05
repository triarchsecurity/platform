---
phase: 04-promote-branch-workflow
verified: 2026-05-05T15:30:00Z
status: human_needed
score: 8/10 must-haves verified (2 deferred to Phase 7.5 live UAT)
requirements_covered:
  WORKFLOW-04:
    status: partial
    reason: "Workflow artifact fully implemented and tagged v3; live dispatch UAT deferred to Phase 7.5"
  WORKFLOW-05:
    status: verified
    reason: "Callback endpoint deployed, 7 vitest tests green, schema live in prod CRDB"
human_verification:
  - test: "Scenario A — Clean rebase + CI + merge (Roadmap SC-1)"
    expected: "Dispatch promote-branch.yml@v3 on a clean branch: workflow runs to completion, result=merged row inserted in promote_attempts with merge_sha populated"
    why_human: "Requires a live GitHub Actions runner dispatching against a real consumer repo; cannot verify without a sandbox environment"
  - test: "Scenario B — Rebase conflict (Roadmap SC-2)"
    expected: "Dispatch on a conflicting branch: rebase job fails, conflict_files output is NON-EMPTY (critical — proves capture-before-abort), result=conflict row inserted with non-null rebase_error"
    why_human: "Requires real git conflict on a live repo; the capture-before-abort fix can only be proven correct via a real runner"
  - test: "Scenario C — CI failure"
    expected: "Dispatch on a branch with failing tests: rebase succeeds, ci fails, merge skipped, result=ci_failed row with ci_run_url populated"
    why_human: "Requires a GitHub Actions runner executing npx vitest run and reporting ci_run_url"
  - test: "Scenario D — Concurrency serialization"
    expected: "Two concurrent dispatches serialize via concurrency group promote-main; both branches land in main; two merged rows in promote_attempts"
    why_human: "Race condition / serialization behavior can only be observed on a live Actions runner"
---

# Phase 4: promote-branch Workflow — Verification Report

**Phase Goal:** A reusable `promote-branch.yml` workflow can take any feature branch, rebase it on main, run CI, and either merge to main or report conflicts — with the result posted back to admin

**Verified:** 2026-05-05T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | promote-branch.yml exists with four-job structure (rebase, ci, merge, callback) | VERIFIED | File at `~/claude/MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml`, 372 lines, 4 jobs confirmed via grep |
| 2 | Workflow accepts workflow_call + workflow_dispatch triggers with correct inputs | VERIFIED | `grep -c "workflow_call:"` = 1, `grep -c "workflow_dispatch:"` = 1; inputs: branch, target_branch, admin_callback_url |
| 3 | Conflict files captured BEFORE git rebase --abort (RESEARCH Critical Finding #1) | VERIFIED | awk order check: diff capture at line 155, abort at line 159 — diff precedes abort |
| 4 | CI is inlined (no nested workflow_call) with npm ci + build + vitest | VERIFIED | `grep -c "uses: ./.github/workflows/quality-gate.yml"` = 0; npm ci, npm run build, npx vitest run each present |
| 5 | Concurrency group declared inside workflow with cancel-in-progress: false | VERIFIED | `^concurrency:` = 1, `cancel-in-progress: false` = 1, group uses `inputs.target_branch` |
| 6 | v3 tag exists on shared-workflows; v1/v2 SHAs unchanged from Phase 2 | VERIFIED | `gh api` confirms v3 tag; v1 SHA `85b130b` and v2 SHA `b2c2e55` match Phase 2/3 SUMMARY records |
| 7 | POST /api/platform/promote-callback exists, authenticates via Bearer, validates payload | VERIFIED | Route file exists, exports POST, calls requireApiKey, validates branch + result enum; 401 returned on unauthenticated request to live endpoint |
| 8 | 7 vitest tests pass (auth, validation, insert) | VERIFIED | Test file has describe block with 7 `it()` blocks; SUMMARY confirms all green at commit 77ae786 |
| 9 | Dispatching promote-branch.yml on a clean branch results in merged row in promote_attempts | HUMAN NEEDED | Code path implemented; live dispatch deferred to Phase 7.5 (no sandbox consumer available) |
| 10 | Dispatching on a conflicting branch returns non-empty conflict_files and result=conflict | HUMAN NEEDED | capture-before-abort sequence grep-verified; live conflict run deferred to Phase 7.5 |

**Score:** 8/10 truths verified (2 deferred to Phase 7.5 live UAT per 04-HUMAN-UAT.md)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `~/claude/MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml` | Reusable 4-job promote workflow | VERIFIED | 372 lines; all 23 acceptance criteria from 04-03-PLAN pass per SUMMARY |
| `src/db/schema.ts` | `promoteAttempts` pgTable with 8 D-13 columns + 2 indexes | VERIFIED | Export at line 385; both indexes present; no CHECK constraint; no relations block |
| `src/db/migrations/0012_promote_attempts.sql` | SQL DDL matching schema, two indexes | VERIFIED | CREATE TABLE + 2 CREATE INDEX, `DESC NULLS LAST`, 2 statement-breakpoints, no CHECK |
| `src/app/api/platform/promote-callback/route.ts` | POST handler — Bearer auth, snake_case payload, db insert | VERIFIED | 54 lines; exports POST; imports requireApiKey (2x) and promoteAttempts (2x); VALID_RESULTS enum |
| `src/app/api/platform/promote-callback/route.test.ts` | 7-test vitest suite | VERIFIED | describe block present; 7 `it()` blocks covering all auth + validation + success paths |
| `.planning/phases/04-promote-branch-workflow/04-HUMAN-UAT.md` | UAT log with 4 deferred scenarios | VERIFIED | File exists, status=partial, 4 pending scenarios documented with full acceptance criteria |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `promote-branch.yml` callback job | `https://admin.triarch.dev/api/platform/promote-callback` | curl POST with Bearer token | WIRED (static) | Pattern `/api/platform/promote-callback` appears 3x in YAML; live endpoint returns HTTP 401 unauthenticated as expected |
| `promote-branch.yml` callback | `needs.<job>.result` | bash conditional determining merged/conflict/ci_failed | VERIFIED | Logic: merge.success → merged; rebase.failure → conflict; else → ci_failed |
| `route.ts` | `src/lib/api-key-auth.ts` | `requireApiKey` import + invocation | WIRED | Import present + called on first line of POST handler; error returned immediately if auth fails |
| `route.ts` | `src/db/schema.ts` | `promoteAttempts` import + `db.insert()` | WIRED | Import present; `db.insert(promoteAttempts).values({...}).returning()` chain in handler |
| `promote-branch.yml` callback job | `if: always()` | runs regardless of prior job failures | VERIFIED | `if: always()` = 1; `continue-on-error: true` on callback step per D-09 |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| WORKFLOW-04 | 04-03-PLAN.md, 04-04-PLAN.md | promote-branch.yml workflow with rebase/CI/merge + conflict output | PARTIAL | Workflow artifact complete and tagged v3; live dispatch UAT (Roadmap SC-1, SC-2) deferred to Phase 7.5. REQUIREMENTS.md still shows `[ ]` pending live UAT closure. |
| WORKFLOW-05 | 04-01-PLAN.md, 04-02-PLAN.md | Callback endpoint receives result, persists to promote_attempts | VERIFIED | Schema in prod CRDB; endpoint deployed (HTTP 401 unauthenticated confirms reachability); 7 vitest tests green. REQUIREMENTS.md shows `[x]` complete. |

**Note on WORKFLOW-04 checkbox:** REQUIREMENTS.md currently shows `- [ ] **WORKFLOW-04**` (unchecked). This is consistent with the deliberate scope decision — Plan 04-04 (live UAT) is the gating artifact for marking WORKFLOW-04 complete. The ROADMAP progress table correctly states "Complete (UAT deferred to 7.5)".

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | No TODOs, placeholders, empty handlers, or stub returns in the four Phase 4 source files |

The callback endpoint has no try/catch around `db.insert` — this is an intentional pattern decision (matches releases/promoted precedent; surfaces as 500 to Next.js default handler). Not a stub.

---

## Human Verification Required

These four scenarios are persisted in `.planning/phases/04-promote-branch-workflow/04-HUMAN-UAT.md` (status: partial, 4 pending). They are deferred to **Phase 7.5 (Dev Cluster + Admin Dev Backend)**, which creates the sandbox environment needed for live dispatch testing.

### 1. Scenario A — Clean rebase + CI + merge (Roadmap SC-1)

**Test:** Dispatch `promote-branch.yml@v3` against a clean feature branch. Wait for all four jobs to complete.
**Expected:** Run conclusion=success; all four jobs green; `promote_attempts` row with `result='merged'`, `merge_sha` populated, `conflict_files=[]`, `rebase_error=null`, `ci_run_url=null`
**Why human:** Requires a live GitHub Actions runner + a consumer repo with `ADMIN_API_TOKEN` secret + `main` branch not blocking `github-actions[bot]` push

### 2. Scenario B — Rebase conflict (Roadmap SC-2)

**Test:** Create a branch with a real merge conflict against main, dispatch `promote-branch.yml@v3`.
**Expected:** `rebase` job fails; `ci` + `merge` skipped; `callback` succeeds with `result=conflict`; `promote_attempts` row has `conflict_files` as a NON-EMPTY array (critical assertion — proves capture-before-abort). `rebase_error` non-null.
**Why human:** Only a live runner can prove the capture-before-abort ordering works correctly at runtime

### 3. Scenario C — CI failure

**Test:** Dispatch on a branch with a deliberately failing test (e.g. `expect(1).toBe(2)`).
**Expected:** `rebase` success, `ci` failure, `merge` skipped; `promote_attempts` row with `result='ci_failed'` and `ci_run_url` pointing to the run
**Why human:** Requires a GitHub Actions runner executing `npx vitest run` and reporting the run URL

### 4. Scenario D — Concurrency serialization

**Test:** Dispatch two simultaneous runs targeting `main` within ~5 seconds.
**Expected:** Second run queues (not cancelled) while first is in-progress; both eventually complete; two `promote_attempts` rows both `result='merged'`; no `non-fast-forward` errors
**Why human:** Race condition / serialization behavior requires a real Actions runtime to observe

---

## Gaps Summary

No code or artifact gaps. The implementation is complete:

- All four plans executed; Plans 01–03 have SUMMARY.md; Plan 04 was intentionally scoped as live UAT (deferred)
- The two must-haves marked HUMAN NEEDED are live dispatch scenarios, not missing code
- WORKFLOW-04 is partially satisfied (workflow exists, tagged, verified structurally); the live dispatch evidence that would satisfy it fully requires Phase 7.5 infrastructure
- WORKFLOW-05 is fully satisfied — the callback endpoint is deployed, unit-tested, and the schema is live in production

The deferral follows the same pattern as Phase 2 Plan 04-04 (branch-preview E2E deferred to Phase 8).

---

_Verified: 2026-05-05T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
