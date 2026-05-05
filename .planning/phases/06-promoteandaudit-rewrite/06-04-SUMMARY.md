---
phase: 06-promoteandaudit-rewrite
plan: "04"
subsystem: testing + documentation
tags: [rc-08, concurrency, integration-test, onboarding]
dependency_graph:
  requires: ["06-01"]
  provides: [RC-08-verification, onboarding-step-9]
  affects: []
tech_stack:
  added: []
  patterns: [vitest-mock-transaction-capture, per-call-isolated-closure-mock]
key_files:
  created:
    - src/lib/__tests__/release-concurrent.test.ts
  modified:
    - docs/onboarding-projects.md
decisions:
  - Per-transaction closure mock: each db.transaction() invocation gets its own localInsertValues array; avoids shared state across parallel Promise.all calls
  - txUpdateCalls typed as Array<{ id: unknown; status: string }> to accommodate id capture from insert closure
  - Thenable + orderBy dual shape: select().from().where() returns Promise extended with .orderBy().limit() to serve both approveRelease idempotency check and promoteAndAudit project lookup
metrics:
  duration: "151s"
  completed_date: "2026-05-05"
  tasks_completed: 2
  files_changed: 2
---

# Phase 06 Plan 04: Concurrent Approval Integration Test + Onboarding Step 9 Summary

## One-liner

RC-08 concurrent multi-branch approval safety proved with 3-test integration suite (Promise.all approveRelease + promoteAndAudit dispatch fan-out), plus Step 9 added to onboarding runbook documenting consumer-side promote-branch.yml stub YAML and ADMIN_API_TOKEN wiring.

## What Was Built

### Task 1: RC-08 Integration Test

`src/lib/__tests__/release-concurrent.test.ts` — 3 tests covering:

1. **Parallel approve success** — `Promise.all([approveRelease(rel1), approveRelease(rel2)])` on `feat/change-font` and `feat/add-audio`; both return `{ok:true, alreadyApproved:false}`; 2 distinct `releaseId` values in `txInsertValueCalls`.
2. **Per-call input isolation** — same setup with different `approverEmail`/`ipAddress`/`userAgent` per call; each insert has only its own inputs (no cross-contamination assertion included).
3. **Parallel dispatch fan-out** — `Promise.all([promoteAndAudit(in1), promoteAndAudit(in2)])` with mocked `dispatchWorkflow`; asserts exactly 2 calls, branches sorted to `['feat/add-audio', 'feat/change-font']`; 2 `promotionUpdateCalls` each with `promotionDispatchedAt instanceof Date`.

All 3 tests run in ~3ms (no real DB). Full suite: 105/105 GREEN.

### Task 2: Onboarding Step 9

`docs/onboarding-projects.md` — Step 9 appended before the Verification Checklist:

- **9a**: Stub YAML for `.github/workflows/promote-branch.yml` calling `MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml@v3` with `branch` input and `ADMIN_API_TOKEN` secret
- **9b**: `ADMIN_API_TOKEN` confirmation and `gh secret list` verification (same per-project token from Step 8)
- **9c**: `gh workflow list` to confirm stub is registered `active` on `main`
- **9d**: `gh api .../contents/...` sanity decode command
- **9e**: No-op dispatch test with `promote_attempts` DB query
- Two checklist entries added to Verification Checklist

Step number chosen: **9** (next available after existing Step 8).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error in txUpdateCalls type**
- **Found during:** TypeScript check post-Task 1
- **Issue:** `txUpdateCalls` typed as `Array<{ status: string }>` but push call included `id` field; TS2353
- **Fix:** Changed type to `Array<{ id: unknown; status: string }>`
- **Files modified:** `src/lib/__tests__/release-concurrent.test.ts`
- **Commit:** 608d9d2

### Mock Design Note

The plan's suggested mock used a complex wrapper approach that intercepted `tx.insert` post-construction. The actual implementation uses a simpler per-transaction closure (`localInsertValues`) that captures args directly in the `values()` call — more reliable and avoids the "wrap after bind" brittleness. Functionally equivalent.

## Verification Results

```
npx vitest run src/lib/__tests__/release-concurrent.test.ts
→ 3 passed, 0 failed

npx vitest run
→ 105 passed (15 test files)

npx tsc --noEmit
→ 0 errors

grep -c "Promise.all" src/lib/__tests__/release-concurrent.test.ts → 3
grep -c "feat/change-font" src/lib/__tests__/release-concurrent.test.ts → 2
grep -c "feat/add-audio" src/lib/__tests__/release-concurrent.test.ts → 2
grep -c "RC-08" src/lib/__tests__/release-concurrent.test.ts → 2
grep -c "promote-branch.yml" docs/onboarding-projects.md → 9
grep -c "promote-branch.yml@v3" docs/onboarding-projects.md → 2
grep -c "ADMIN_API_TOKEN" docs/onboarding-projects.md → 21
grep -c "workflow_dispatch" docs/onboarding-projects.md → 4
```

## Cross-references

- **RC-08**: Proved by this test — no admin code change needed (D-16); per-row idempotency of `approveRelease` guarantees isolation
- **PILOT-02** (Phase 8): End-to-end Truth+Treason multi-branch validation; noted in both the test file docblock and onboarding Step 9e
- **D-16**: No production code changes in this plan — confirmed by `git diff --stat HEAD~3 HEAD -- src/lib src/app` showing only `release-concurrent.test.ts`
- **D-17**: Integration test at `src/lib/__tests__/release-concurrent.test.ts` — delivered

## Self-Check: PASSED

- FOUND: `src/lib/__tests__/release-concurrent.test.ts`
- FOUND: `docs/onboarding-projects.md`
- FOUND: `06-04-SUMMARY.md`
- FOUND commit: 114d316 (Task 1 — test file)
- FOUND commit: 9cce1f1 (Task 2 — docs update)
- FOUND commit: 608d9d2 (TS fix deviation)
