---
phase: 04-promote-branch-workflow
plan: 02
subsystem: api
tags: [nextjs, api-route, bearer-auth, drizzle, vitest, tdd, promote-callback, workflow-05]

# Dependency graph
requires:
  - phase: 04-01
    provides: "promoteAttempts Drizzle pgTable export in src/db/schema.ts"
provides:
  - "POST /api/platform/promote-callback — Bearer auth, snake_case payload validation, db insert into promote_attempts"
  - "Vitest test suite (7 tests) colocated at route.test.ts — GREEN"
affects: [04-03-promote-branch-workflow, 04-04-e2e-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: test written in RED state, route written to GREEN — 7 tests, 0 failures"
    - "Mock style mirrors src/app/api/releases/promoted/route.test.ts: named vi.fn() variables captured in beforeEach, dynamic import of route inside each test"
    - "snake_case wire payload (D-12) destructured; camelCase Drizzle property names passed to db.insert().values()"
    - "No try/catch around db.insert — matches releases/promoted pattern; exceptions surface to Next.js default 500 handler"

key-files:
  created:
    - src/app/api/platform/promote-callback/route.ts
    - src/app/api/platform/promote-callback/route.test.ts
  modified:
    - package.json

key-decisions:
  - "result validation uses VALID_RESULTS array (no CHECK constraint) — consistent with Phase 3 slack_action_audit and Phase 4-01 no-CHECK-constraint decision"
  - "conflict_files defaults to [] (not null) when wire payload omits it — matches jsonb DEFAULT '[]' column default in schema"
  - "No try/catch in route — mirrors releases/promoted pattern; runtime DB errors surface as 500 (acceptable until db:push completes per Plan 04-01)"

# Metrics
duration: 2min
completed: 2026-05-05
---

# Phase 4 Plan 2: POST /api/platform/promote-callback Endpoint Summary

**POST /api/platform/promote-callback with Bearer auth + snake_case validation + promoteAttempts insert; 7-test vitest suite GREEN; version bumped 2.2.5 → 2.3.0**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-05T14:28:39Z
- **Completed:** 2026-05-05T14:30:32Z
- **Tasks:** 3 (TDD RED, TDD GREEN, version bump)
- **Files created/modified:** 3

## Accomplishments

- Created `src/app/api/platform/promote-callback/route.ts` — POST handler with Bearer auth, snake_case payload parsing, required-field validation, and `db.insert(promoteAttempts)` persistence
- Created `src/app/api/platform/promote-callback/route.test.ts` — 7 vitest tests (2 auth, 3 validation, 2 happy-path insert assertions); all GREEN
- Bumped `package.json` version `2.2.5` → `2.3.0` (minor: new feature endpoint)
- `npx next build` confirms route is registered at `/api/platform/promote-callback`
- `npx tsc --noEmit` clean

## Task Commits

Each task committed atomically:

1. **Task 1: Write vitest tests (RED)** — `778a03e` (test)
2. **Task 2: Implement route (GREEN)** — `77ae786` (feat)
3. **Task 3: Version bump** — `f6572a5` (v2.3.0)

## Endpoint Contract

| Property | Value |
|---|---|
| Path | `POST /api/platform/promote-callback` |
| Auth | Bearer token from `projects.apiKey` via `requireApiKey` |
| Required fields | `branch` (string), `result` (`merged\|conflict\|ci_failed`) |
| Optional fields | `merge_sha`, `conflict_files`, `rebase_error`, `ci_run_url` |
| Success response | 201 + inserted row JSON |
| Auth failure | 401 (missing header) / 403 (invalid token) |
| Validation failure | 400 + `{ error: "Missing required field(s): ..." }` |

## Snake_case → camelCase Wire Mapping

| Wire (snake_case) | Drizzle property (camelCase) | DB column |
|---|---|---|
| `branch` | `branch` | `branch` |
| `result` | `result` | `result` |
| `merge_sha` | `mergeSha` | `merge_sha` |
| `conflict_files` | `conflictFiles` | `conflict_files` |
| `rebase_error` | `rebaseError` | `rebase_error` |
| `ci_run_url` | `ciRunUrl` | `ci_run_url` |

## Test Coverage

| Test # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Missing Authorization header | 401 | PASS |
| 2 | Invalid Bearer token | 403 | PASS |
| 3 | Missing `branch` field | 400 with "branch" in error | PASS |
| 4 | Missing `result` field | 400 with "result" in error | PASS |
| 5 | `result` outside enum | 400 with "result" in error | PASS |
| 6 | Valid merged payload | 201, camelCase insert verified | PASS |
| 7 | Valid conflict payload | 201, conflictFiles/rebaseError verified | PASS |

## Mock Pattern Reference

`src/app/api/releases/promoted/route.test.ts` EXISTS and was used as the canonical mock pattern reference. The promote-callback test mirrors its style: named `vi.fn()` variables (`requireApiKeyMock`, `insertMock`, `insertValuesMock`), `vi.clearAllMocks()` + default setup in `beforeEach`, dynamic `import('./route')` inside each test body.

## Version Bump

- **From:** `2.2.5`
- **To:** `2.3.0`
- **Reason:** Minor bump for new feature (new API endpoint per workspace CLAUDE.md convention)

## Known Runtime Note

The endpoint will return 500 for DB errors until Plan 04-01 Task 3 (db:push of `0012_promote_attempts.sql`) completes — same advisory pattern as Phase 03-01 and Phase 04-01. Unit tests pass with mocked DB.

## Deviations from Plan

None — plan executed exactly as written. Route code from PLAN.md Task 2 `<action>` block and test code from Task 1 `<action>` block were implemented; existing `route.test.ts` mock pattern was adopted verbatim.

## Known Stubs

None — the endpoint is fully wired: real auth, real validation, real db.insert (mocked only in tests).

---
*Phase: 04-promote-branch-workflow*
*Completed: 2026-05-05*

## Self-Check: PASSED

- FOUND: `src/app/api/platform/promote-callback/route.ts`
- FOUND: `src/app/api/platform/promote-callback/route.test.ts`
- FOUND commit `778a03e` — test RED
- FOUND commit `77ae786` — feat GREEN
- FOUND commit `f6572a5` — v2.3.0 version bump
