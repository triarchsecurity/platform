---
phase: 24-cicd-deploy-safety
plan: 02
subsystem: infra
tags: [nextjs-16, instrumentation, env-validation, vitest, yaml, ci-cd]

requires:
  - phase: 23.1-portal-ui-polish
    provides: portal v0.5.0 baseline + clean main branches in both repos
provides:
  - Boot-time env-var validation in BOTH admin and portal via Next.js 16 instrumentation.ts register() hook
  - Per-repo REQUIRED_ENV constant (admin = 18 entries; portal = 12 entries) — single source of truth shared with the upcoming validate-apphosting.ts CI lint (Plan 24-03)
  - assertEnv() throws on missing env vars at process start, BEFORE any HTTP handler binds — FAH treats this as a failed rollout (keeps prior version serving) instead of healthy-but-broken 500-on-every-request
  - apphosting.yaml drift-guard at unit-test time (env-schema.test.ts asserts every REQUIRED_ENV name is bound in apphosting.yaml)
affects:
  - 24-03-validate-apphosting (consumes env-schema.ts as input to CI lint)
  - 24-04-human-verify-runbook (skipped per scope; Phase 24-02 + 24-03 are the only shipping plans this round)
  - 25-cutover (CI-03 boot guard is a hard prerequisite for safe cutover)

tech-stack:
  added: [yaml@^2.8.4 (devDep, both repos)]
  patterns:
    - "Next.js 16 register() boot hook with NEXT_RUNTIME='nodejs' guard + dynamic import (Pitfall 4 + Pitfall 9)"
    - "Per-repo env-name schema as TS const, NOT shared package — each app owns its required set"
    - "Log NAMES not VALUES — sentinel-string Vitest test proves no secret-value leakage in console.error output"

key-files:
  created:
    - admin/src/instrumentation.ts
    - admin/src/lib/assertEnv.ts
    - admin/src/lib/assertEnv.test.ts
    - admin/src/lib/env-schema.ts
    - admin/src/lib/env-schema.test.ts
    - portal/src/instrumentation.ts
    - portal/src/lib/assertEnv.ts
    - portal/src/lib/assertEnv.test.ts
    - portal/src/lib/env-schema.ts
    - portal/src/lib/env-schema.test.ts
  modified:
    - admin/package.json (2.10.10 → 2.11.0; +yaml devDep)
    - admin/package-lock.json
    - portal/package.json (0.5.0 → 0.5.1; +yaml devDep)
    - portal/package-lock.json

key-decisions:
  - "instrumentation.ts (not app/layout.tsx server-throw) — Next.js 16's documented boot hook fires once before any request handler binds; FAH sees a thrown register() as a failed rollout. layout.tsx server-throw fails healthy: container appears running, every request 500s."
  - "Throw vs process.exit(1) — register() must complete before server handles requests. Throwing is the documented contract; process.exit() interaction with Next.js worker management is undocumented."
  - "Dynamic import inside register() — keeps assertEnv (and env-schema) out of the static module graph so Vitest can import ./lib/assertEnv from a test file without instrumentation.ts side-effects on test bootstrap (Pitfall 9)."
  - "NEXT_RUNTIME='nodejs' guard — register() fires on both Node.js AND Edge runtimes; Edge can't import Node modules and has a different env surface (Pitfall 4)."
  - "Per-repo schema (not shared package) — lean toward 'no' on extracting shared validators per CONTEXT D-discretion; admin and portal have different required sets so a shared package adds coupling without saving code."
  - "Schema lives at src/lib/env-schema.ts (NOT src/env-schema.ts) — co-located with assertEnv.ts so both files can be reasoned about as one boot-guard unit."
  - "Drift guard at Vitest time, not just CI lint — Plan 24-03 will add scripts/validate-apphosting.ts as a CI step but the env-schema.test.ts unit-time check catches drift the moment a developer runs `npx vitest`, before they even push."

patterns-established:
  - "Pattern: Next.js 16 boot hook — src/instrumentation.ts exports async register() with NEXT_RUNTIME guard + dynamic import. Reuse for any future boot-time invariant (vault reachability, schema sanity, feature-flag cache warm)."
  - "Pattern: Schema-as-code, not env-as-data — REQUIRED_ENV is a static `as const` array. Reading process.env happens at call time (assertEnv()), not module load."
  - "Pattern: Sentinel-string test for log-leakage — set a known sentinel value, delete a different var to trigger error, spy on console.error and assert sentinel is ABSENT. Reusable for any log-sanitization guarantee."

requirements-completed: [CI-03]

duration: 21min
completed: 2026-05-10
---

# Phase 24 Plan 02: instrumentation.ts + assertEnv() Boot Guard Summary

**Next.js 16 register() hook + per-repo REQUIRED_ENV schema + Vitest no-secret-value-leak proof — landed in BOTH admin (18 vars) and portal (12 vars).**

## Performance

- **Duration:** ~21 minutes
- **Started:** 2026-05-10T00:21:00Z (approx, plan-start)
- **Completed:** 2026-05-10T00:42:06Z
- **Tasks:** 2 (one per repo)
- **Files created:** 10
- **Files modified:** 4 (package.json + package-lock.json in each repo)
- **Test count delta:** admin +6 cases (2 new test files); portal +6 cases (2 new test files)

## Accomplishments

- BOTH admin and portal will now fail container start (FAH "failed rollout") if ANY required env var is missing at boot, BEFORE any HTTP handler binds — eliminates the half-broken-serve failure mode CI-03 was designed to prevent.
- Single source of truth for required env names per repo: `src/lib/env-schema.ts`. Plan 24-03's `scripts/validate-apphosting.ts` will consume the same constant to lint apphosting.yaml at CI time, so the schema and the YAML can never silently diverge.
- `assertEnv.ts` is byte-identical between admin and portal (only `env-schema.ts` content differs) — verified by `diff` in acceptance criteria. Future shared-package extraction (V2.3 candidate) will only need to relocate the function; the call sites will remain unchanged.
- No-secret-value-leakage proven by sentinel test: a value `super-secret-value-must-not-appear` set on `NEXTAUTH_SECRET` is asserted ABSENT from `console.error` output even when assertEnv throws. Names appear; values do not.

## Task Commits

Each task was committed atomically:

1. **Task 1 (admin): instrumentation + assertEnv + env-schema + Vitest** — `42e29b3` (feat) — `triarchsecurity/platform`
   - 7 files changed, +182/-3 lines
   - Vitest: 6/6 GREEN (4 assertEnv + 2 env-schema)
   - `npx next build` clean; `.next/server/instrumentation.js` artifact present (proof Next.js detected the hook)
   - Version bump: 2.10.10 → 2.11.0 (minor: new boot-time validation feature)

2. **Task 2 (portal): instrumentation + assertEnv + env-schema + Vitest** — `cafeb44` (feat) — `triarchsecurity/dev-portal`
   - 7 files changed, +178/-5 lines
   - Vitest: 6/6 GREEN
   - `npx next build` clean; `.next/server/instrumentation.js` artifact present
   - Version bump: 0.5.0 → 0.5.1 (patch: same feature, smaller user-visible impact in portal's still-young 0.x line)
   - assertEnv.ts byte-identical to admin's (verified by `diff`)

**Plan metadata commit:** TBD (admin commit: docs(24-02): SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

### Admin (`/Users/mikegeehan/claude/triarch/development/admin/`)

- `src/instrumentation.ts` — Next.js 16 register() boot hook with NEXT_RUNTIME guard + dynamic `await import('./lib/assertEnv')`
- `src/lib/assertEnv.ts` — boot guard: iterates REQUIRED_ENV, collects missing names, throws Error with `[assertEnv] FATAL: missing required env vars: …` (names only, never values)
- `src/lib/assertEnv.test.ts` — 4 Vitest cases: passes-on-complete, throws-on-missing, lists-all-missing, no-secret-value-leak (sentinel)
- `src/lib/env-schema.ts` — REQUIRED_ENV (18 entries) `as const` + `RequiredEnvName` type
- `src/lib/env-schema.test.ts` — 2 Vitest cases: shape (length=18, unique, all strings) + drift-guard (every REQUIRED_ENV name bound in `apphosting.yaml`)
- `package.json` — 2.10.10 → 2.11.0; +yaml@^2.8.4 devDep
- `package-lock.json` — yaml dep tree

### Portal (`/Users/mikegeehan/claude/triarch/development/portal/`)

- `src/instrumentation.ts` — identical to admin's
- `src/lib/assertEnv.ts` — byte-identical to admin's
- `src/lib/assertEnv.test.ts` — 4 Vitest cases (same as admin; uses portal's 12-entry REQUIRED_ENV)
- `src/lib/env-schema.ts` — REQUIRED_ENV (12 entries; portal-specific names: PORTAL_SLACK_BOT_TOKEN, PORTAL_BUG_REPORTS_CHANNEL, PORTAL_FEATURE_REQUESTS_CHANNEL, ADMIN_INTERNAL_DISPATCH_URL)
- `src/lib/env-schema.test.ts` — 2 Vitest cases (length=12 + drift-guard against `portal/apphosting.yaml`)
- `package.json` — 0.5.0 → 0.5.1; +yaml@^2.8.4 devDep
- `package-lock.json` — yaml dep tree

### REQUIRED_ENV Final Content

**Admin (18 entries):**
```
NEXTAUTH_URL, ADMIN_EMAIL, DEPLOY_WEBHOOK_URL, PORTAL_BASE_URL, DATABASE_URL,
NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DEPLOY_WEBHOOK_SECRET,
SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_PAYLOAD_SECRET,
SLACK_RELEASE_APPROVAL_CHANNEL, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY,
GITHUB_APP_INSTALLATION_ID, FAH_PROMOTER_SA_KEY, INTERNAL_HMAC_SECRET
```

**Portal (12 entries):**
```
NEXTAUTH_URL, DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET, INTERNAL_HMAC_SECRET, ADMIN_INTERNAL_DISPATCH_URL,
FAH_PROMOTER_SA_KEY, PORTAL_SLACK_BOT_TOKEN, SLACK_RELEASE_APPROVAL_CHANNEL,
PORTAL_BUG_REPORTS_CHANNEL, PORTAL_FEATURE_REQUESTS_CHANNEL
```

**Excluded from REQUIRED_ENV (intentional):**
- `NODE_AUTH_TOKEN` — `availability: [BUILD]`, not a runtime requirement
- `NEXT_PUBLIC_*` — inlined at build time
- Script-only env vars (TRIARCH_API_KEY, GODADDY_*, etc.) — only used by ad-hoc scripts in `scripts/`
- GitHub Actions auto-injected vars (GITHUB_REPOSITORY, etc.)
- `NODE_ENV` — managed by Next.js

## Decisions Made

### Why dynamic import in instrumentation.ts (Pitfall 9)
Top-level static import would pull `assertEnv` (and transitively `env-schema`) into Vitest's module graph at test bootstrap. Vitest's eager module loading would then trigger module side-effects when any test indirectly imports `instrumentation.ts`. Dynamic `await import('./lib/assertEnv')` defers resolution to register() call time — Next.js production runtime calls register(); Vitest does not.

### Why NEXT_RUNTIME guard (Pitfall 4)
Per Next.js 16 docs, `register()` fires on BOTH Node.js and Edge runtimes. Edge runtime can't import Node modules and only guarantees `NEXT_PUBLIC_*` vars in `process.env`. Wrapping the body in `if (process.env.NEXT_RUNTIME === 'nodejs')` keeps Edge boots silent (Edge has nothing to validate at this layer).

### Why throw vs process.exit(1)
Per Next.js docs, register() "must complete before the server is ready to handle requests." A thrown error aborts boot — documented contract. `process.exit()` from register() is undocumented behavior and may interact poorly with Next.js's worker management. Throwing is the safer, documented path.

### Pitfall 5 acknowledgment (vault-only secrets coverage gap)
Admin loads many secrets via `getSecret('NAME')` from `@triarchsecurity/secrets@0.1.0`. Those secrets fall through to `process.env` when the vault is unreachable. `REQUIRED_ENV` reflects what runtime expects from `process.env` — i.e., everything bound in `apphosting.yaml` as `secret:` or `value:`. Currently zero vault-only secrets exist in either repo (clean — both repos bind every consumer-of-getSecret in apphosting.yaml). Future maintainers: if a vault-only secret is added, either bind it in apphosting.yaml (recommended) or document the exclusion in env-schema.ts.

## Deviations from Plan

**1. [Rule 3 - Blocking-adjacent] npm scope migration adjustment**

- **Found during:** Pre-execution context read.
- **Issue:** PLAN-24-02 references `@myalterlego/triarch-shared` and `@myalterlego/secrets` (the legacy GitHub Packages scope). The repos have since migrated to `@triarchsecurity/*` (npm registry, not GitHub Packages — visible in both `package.json` files reading `@triarchsecurity/secrets`, `@triarchsecurity/shared-ui`, `@triarchsecurity/triarch-shared`).
- **Fix:** No code change required. The plan's references to `@myalterlego/triarch-shared` were limited to (a) Pitfall 5 commentary about `@myalterlego/secrets` (now `@triarchsecurity/secrets` — same behavior) and (b) the "do NOT add to shared package" instruction (still valid, just under the new scope name). The 5 created files have NO imports from any shared package, so the migration is transparent to this plan's outputs.
- **Files modified:** None (documentation-only adjustment).
- **Verification:** `grep -rn "@myalterlego" admin/src/ portal/src/` returns 0 lines. The two scope-aware files (`assertEnv.ts`, `instrumentation.ts`) import only relative paths, no shared deps.

**2. [Rule 1 - Verify-spec correction] Build-output `instrumentation` log line**

- **Found during:** Task 1 verification step.
- **Issue:** Plan's automated verify line includes `npx next build 2>&1 | grep -qi "instrumentation"`. Next.js 16.2.6 does NOT echo the word "instrumentation" in build stdout. The check would fail despite a successful build.
- **Fix:** Used the actual proof of detection — Next.js compiles `src/instrumentation.ts` to `.next/server/instrumentation.js` (and `.js.nft.json` + `.js.map`). Confirmed presence in BOTH `admin/.next/server/` and `portal/.next/server/`.
- **Files modified:** None.
- **Verification:** `find $REPO/.next/server -name "instrumentation*"` returns 3 artifacts in each repo.

**3. [Rule 2 - Test robustness] Pre-test environment cleanup**

- **Found during:** Task 1 RED phase (before tests existed, designing the suite).
- **Issue:** The plan's test pattern (`beforeEach: process.env = { ...originalEnv }`) preserves the host shell's `NEXTAUTH_URL` etc. if those are set in the dev's local environment. Test 2 (delete one var, expect throw) would silently pass on the wrong var because OTHER vars from the host env would be missing too — a false-green.
- **Fix:** Added `for (const name of REQUIRED_ENV) delete process.env[name]` immediately after the `process.env = { ...originalEnv }` snapshot in beforeEach, plus `setAllRequired()` helper that explicitly sets each name to a deterministic test value. This guarantees the test only observes vars set by the test itself.
- **Files modified:** `admin/src/lib/assertEnv.test.ts`, `portal/src/lib/assertEnv.test.ts`.
- **Verification:** All 6 tests pass deterministically; the "lists ALL missing" test asserts a regex of two specific names rather than relying on count.

---

**Total deviations:** 3 (1 documentation-only scope adjustment, 1 verify-spec correction, 1 test robustness)
**Impact on plan:** No scope creep; all adjustments preserve the plan's intent and acceptance criteria. Files created match the plan's `<files>` list exactly.

## Issues Encountered

None.

## Schema vs apphosting.yaml drift status (snapshot at execution)

**Admin:**
- `apphosting.yaml` binds 18 production vars + `NODE_AUTH_TOKEN` (BUILD-only, excluded from REQUIRED_ENV). All 18 REQUIRED_ENV names are bound. **No drift.**
- `apphosting.dev.yaml` (dev overlay) — not validated in this plan; Plan 24-03 will lint dev overrides.

**Portal:**
- `apphosting.yaml` binds 12 production vars + `NODE_AUTH_TOKEN` (BUILD-only, excluded). All 12 REQUIRED_ENV names are bound. **No drift.**
- `apphosting.dev.yaml` (dev overlay) — not validated in this plan; Plan 24-03 will lint dev overrides.

## User Setup Required

None — no external service configuration changed in this plan. Existing FAH bindings remain. Once Plan 24-03 ships and a deploy runs, FAH will exercise the boot guard for the first time. If Mike wants to dry-run the guard locally before then, he can:

```bash
cd /Users/mikegeehan/claude/triarch/development/admin && \
  unset DATABASE_URL && \
  npm run dev   # boot should fail with [assertEnv] FATAL: missing required env vars: DATABASE_URL
```

## Next Phase Readiness

- **24-03 (validate-apphosting CI script)** — UNBLOCKED. The schema constant it consumes (`src/lib/env-schema.ts → REQUIRED_ENV`) now exists in both repos. Plan 24-03 will add `scripts/validate-apphosting.ts` + a CI step that imports REQUIRED_ENV and lints `apphosting.yaml` + `apphosting.dev.yaml` for drift.
- **24-01 (verify-deploy-target gate)** — SKIPPED per Mike's scope decision. Out of band of this plan; not blocking.
- **24-04 (HUMAN-VERIFY runbook for SA + IAM)** — SKIPPED per Mike's scope decision. The boot guard ships independently of the SA work.

## Self-Check: PASSED

**Files exist:**
- `/Users/mikegeehan/claude/triarch/development/admin/src/instrumentation.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/admin/src/lib/assertEnv.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/admin/src/lib/assertEnv.test.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/admin/src/lib/env-schema.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/admin/src/lib/env-schema.test.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/src/instrumentation.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/src/lib/assertEnv.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/src/lib/assertEnv.test.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/src/lib/env-schema.ts` — FOUND
- `/Users/mikegeehan/claude/triarch/development/portal/src/lib/env-schema.test.ts` — FOUND

**Commits exist:**
- admin `42e29b3` — FOUND on `feat/24-02-instrumentation-assertenv`
- portal `cafeb44` — FOUND on `feat/24-02-instrumentation-assertenv`

**Test counts:**
- admin: 6 new Vitest cases pass (4 assertEnv + 2 env-schema)
- portal: 6 new Vitest cases pass (4 assertEnv + 2 env-schema)

**Build status:**
- admin `npx next build` exit 0; `.next/server/instrumentation.js` artifact present
- portal `npx next build` exit 0; `.next/server/instrumentation.js` artifact present

---
*Phase: 24-cicd-deploy-safety*
*Plan: 02*
*Completed: 2026-05-10*
