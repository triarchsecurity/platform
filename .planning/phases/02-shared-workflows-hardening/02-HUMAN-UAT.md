---
status: partial
phase: 02-shared-workflows-hardening
source: [02-VERIFICATION.md]
started: 2026-05-05T03:00:00Z
updated: 2026-05-05T03:00:00Z
---

## Current Test

[awaiting Phase 8 T+T pilot for WORKFLOW-03 live E2E]

## Tests

### 1. WORKFLOW-03 branch preview E2E
expected: Trigger a CI run on a non-main branch with `git_branch: feat/something` (e.g. via `gh workflow run` or by pushing a feature branch in a Triarch repo with the workflow caller updated). Confirm:
  - `deploy-firebase.yml@v2` "Deploy via App Hosting (branch preview)" step fires (NOT the main-branch step)
  - `firebase apphosting:rollouts:create <backend> --git-branch feat/something` succeeds
  - A `release_logs` row appears with `branch=feat/something`
  - `metadata->>'previewUrl'` is populated with `https://feat-something--<backend>.us-central1.hosted.app`
  - The previewUrl is HTTP-accessible (200 or 401 for staff-gated routes — NOT 404)
result: [pending — deferred to Phase 8 T+T multi-branch RC pilot per CONTEXT.md D-05/D-06 deferral. Code path implemented and unit-verified via grep; awaiting live exercise.]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

None — the deferral to Phase 8 was a conscious scope decision in CONTEXT.md. The branch-preview code is shipped and verified structurally; only the live trigger awaits a future phase.
