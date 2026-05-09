---
phase: 01-central-secrets-vault
plan: 04
subsystem: api

requires:
  - phase: 01-central-secrets-vault
    provides: "@myalterlego/secrets@0.1.0 published (Plan 01-02), 7 secrets in vault (Plan 01-01), 7 IAM grants for admin SA (Plan 01-03)"
provides:
  - "Admin app reads SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_PAYLOAD_SECRET, GITHUB_APP_*, SLACK_USER_MAP from @myalterlego/secrets"
  - "Async boundary propagated through resolveSlackUserEmail, signAppJwt, signPayload, verifyPayload, verifySlackSignature"
  - "GET /api/platform/health/secrets staff-only health endpoint"
  - "Admin app version bumped 2.0.0 → 2.1.0"
affects: [01-05, 01-06]

tech-stack:
  added:
    - "@myalterlego/secrets@^0.1.0"
  patterns:
    - "Per-call vault read via getSecret (cached upstream by package)"
    - "Async crypto helpers (signPayload/verifyPayload/verifySlackSignature)"
    - "Promise.allSettled fan-out for health endpoint per-key status"

key-files:
  created:
    - src/lib/__tests__/slack-identity.test.ts
    - src/app/api/platform/health/secrets/route.ts
    - src/app/api/platform/health/secrets/route.test.ts
  modified:
    - package.json (2.0.0 → 2.1.0, +@myalterlego/secrets dep)
    - src/lib/slack.ts (getBotToken helper, await per-call)
    - src/lib/slack-crypto.ts (3 sync exports → async)
    - src/lib/github-app.ts (readEnv → readVaultEnv async, signAppJwt async)
    - src/lib/github-app.test.ts (mocks getSecret instead of process.env)
    - src/lib/__tests__/slack-crypto.test.ts (mocks getSecret, all tests async)
    - src/lib/slack-identity.ts (rewritten — async resolveSlackUserEmail, no hardcoded map)
    - src/lib/__tests__/slack-interact.test.ts (mock now async)
    - src/app/api/slack/interact/route.ts (awaits async helpers + slack-identity)

key-decisions:
  - "Channel envs (SLACK_BUG_CHANNEL etc.) stay as plain process.env — they are not secrets"
  - "Existing Firebase secrets in apphosting.yaml NOT removed (transition fallback per CONTEXT.md D-10)"
  - "github-app readVaultEnv collects missing-key errors before throwing (preserves original UX)"

patterns-established:
  - "Sync→async migration: identify sync functions, mark async, await callers, mock @myalterlego/secrets in tests"
  - "vi.mocked(getSecret) test pattern: vi.mock at top, vi.mocked typed alias, mockReset/mockImplementation per test"

requirements-completed: [VAULT-05]

duration: ~30min
completed: 2026-05-04
---

# Phase 01 Plan 01-04 Summary

**Admin app fully migrated to read 7 shared secrets from `@myalterlego/secrets` (vault-first with `process.env` fallback). New staff-only health endpoint at `/api/platform/health/secrets`. 69/69 tests pass, tsc clean, version bumped to 2.1.0.**

## Performance

- **Tasks:** 3 (all auto/tdd, executed inline)
- **Files modified:** 11 (5 source + 4 test + package.json + lockfile)
- **Tests:** 69 total (was 50; +19 new — slack-identity 6, route 4, slack-crypto rewrite 11, github-app +2 PEM/bubble-up, etc.)
- **Build:** tsc --noEmit clean
- **Completed:** 2026-05-04

## Accomplishments

- All 6 string secrets migrated: `process.env.SLACK_BOT_TOKEN/SIGNING_SECRET/PAYLOAD_SECRET/GITHUB_APP_ID/PRIVATE_KEY/INSTALLATION_ID` → `await getSecret(...)`
- SLACK_USER_MAP migrated from hardcoded const to vault JSON blob; `resolveSlackUserEmail` now async
- 9 callers updated for the async boundary (slack.ts × 4, route.ts × 3, slack.ts signPayload × 2)
- Async crypto helpers (signPayload, verifyPayload, verifySlackSignature) — all callers awaited
- GitHub App: readEnv → readVaultEnv (async), signAppJwt → async, exchangeForInstallationToken updated
- PEM newline normalization preserved (still strips literal `\n` from vault payload)
- New `GET /api/platform/health/secrets` returns `{ ok, secrets: [{key, ok, length|error}] }` with status 200/207
- Package version 2.0.0 → 2.1.0 per workspace CLAUDE.md

## Task Commits

1. **Task 1: Install + migrate slack/crypto/github-app** — `b9aa5ed` (feat)
2. **Task 2: Async slack-identity + interact route caller** — `bf4add6` (feat)
3. **Task 3: Health endpoint** — `1978d7f` (feat)

## Files Created/Modified

| File | Change |
|------|--------|
| `package.json` | 2.0.0 → 2.1.0, +`@myalterlego/secrets ^0.1.0` |
| `src/lib/slack.ts` | `getBotToken()` helper; per-call vault read; `await signPayload` |
| `src/lib/slack-crypto.ts` | 3 exports become async; getSecret reads |
| `src/lib/github-app.ts` | `readEnv` → async `readVaultEnv`; `signAppJwt` async |
| `src/lib/github-app.test.ts` | Mock getSecret; all signAppJwt callers awaited; +PEM/bubble-up tests |
| `src/lib/__tests__/slack-crypto.test.ts` | Rewritten: mock getSecret, all tests async |
| `src/lib/slack-identity.ts` | Rewritten: hardcoded map removed, async `resolveSlackUserEmail` |
| `src/lib/__tests__/slack-identity.test.ts` | NEW: 6 cases (resolves, unknown, null, undefined, vault failure, malformed JSON) |
| `src/lib/__tests__/slack-interact.test.ts` | mock returns `async (id) => ...` |
| `src/app/api/slack/interact/route.ts` | Awaits `verifySlackSignature`, `verifyPayload`, `resolveSlackUserEmail` |
| `src/app/api/platform/health/secrets/route.ts` | NEW: staff-only health endpoint |
| `src/app/api/platform/health/secrets/route.test.ts` | NEW: 4 cases |

## Decisions Made

- Migrated the existing `slack-crypto.test.ts` (originally not in the plan's `files_modified`) because its 11 tests called the now-async functions; rewrote with vi.mock pattern matching the plan's other test rewrites
- Preserved the `// no_secret` reason code by mapping vault failures to that branch (caller compatibility)

## Deviations from Plan

**Plan didn't list `slack-crypto.test.ts` in files_modified.** Migration of slack-crypto.ts to async forced its 11 existing tests to also become async. Rewrote the test file to mock `@myalterlego/secrets` and await all calls. Test count and coverage preserved; outcome is identical.

**Plan didn't enumerate the SLACK_USER_MAP comment fix.** First commit left a `U0AJM4MP2N6` reference in the docstring that tripped the acceptance grep. Edited the comment to use a placeholder `<slack_user_id>` form. Cosmetic only — no behavior change.

## Issues Encountered

- None substantive. tsc clean, vitest 69/69 green.

## User Setup Required

After deploy, hit the new health endpoint to confirm vault wiring:

```bash
curl -s -b "next-auth.session-token=<staff-session>" \
  https://admin.triarch.dev/api/platform/health/secrets | jq .
# Expected: { "ok": true, "secrets": [ { "key": "GITHUB_APP_ID", "ok": true, "length": 9 }, ... ×7 ] }
```

`apphosting.yaml` Firebase secret entries are intentionally NOT removed in this plan (transition fallback per CONTEXT.md D-10). Closeout — removing the redundant Firebase secrets and `process.env` fallback — is a deferred decision.

## Next Phase Readiness

- Plan 01-05 (CRM migration) can proceed
- Plan 01-06 (docs) can reference this endpoint and the established patterns
- Live deploy + health endpoint check is the verify step (HUMAN-UAT after push)

---
*Phase: 01-central-secrets-vault*
*Completed: 2026-05-04*
