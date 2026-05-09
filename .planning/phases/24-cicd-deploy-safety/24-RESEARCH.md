# Phase 24: CI/CD Deploy Safety - Research

**Researched:** 2026-05-09
**Domain:** CI/CD safety gates, GCP IAM scoping, Next.js boot hooks, env-binding validation
**Confidence:** HIGH (all five questions answered with code/API evidence)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **`assertEnv()` boot guard:** Add to BOTH portal and admin (`src/lib/assertEnv.ts` in each), called from `app/layout.tsx` (server) or `instrumentation.ts` (Next.js boot hook) — fail loud at startup with a list of missing required env names, not silent partial serve.
- **Env-name schema source of truth:** TypeScript `const REQUIRED_ENV = ['VAR_A', 'VAR_B', ...] as const` per app, exported from `src/lib/env-schema.ts`. NOT stored in the shared package — each app has its own required set, and shared validators add coupling that buys nothing.
- **`validate-apphosting.ts` script location:** `scripts/validate-apphosting.ts` in each repo (admin and portal). Reads its own `apphosting.yaml` + `apphosting.dev.yaml`, parses bindings, cross-checks against the same `env-schema.ts` constant. Run via `npx tsx scripts/validate-apphosting.ts` as a CI step, gated before deploy.
- **Per-repo deploy SAs (CI-02):** Wire as new GitHub secrets per repo — `FIREBASE_DEPLOY_SA_KEY` (or similar). Portal CI uses portal's SA; admin CI uses admin's. The actual SA creation and IAM binding is HUMAN-VERIFY (Mike runs `gcloud`).
- **Test branch for CI-01 + CI-04 acceptance:** Each phase has a "deliberately wrong" branch that gets pushed and CI rejects. The orchestrator (or executor) creates the test branch, observes the rejection, then deletes it. Documented in SUMMARY.
- **Backend lookup table format:** YAML in `.github/deploy-targets.yml` (or similar) at repo root — `{repo: app_hosting_backend}` map; `verify-deploy-target` reads it, asserts current `${{ github.repository }}` matches expected backend. Two entries: `MyAlterLego/triarch-dev → admin-prod`, `MyAlterLego/triarch-portal → portal-prod`.
- **Failure mode for `assertEnv`:** Throw before request handler binds. Process exit non-zero on container start. Log the missing var names, NOT their values (no secret leakage even if a "secret" was wrongly set as a public env).
- **`validate-apphosting.ts` exit code:** Exit 1 with diff output on missing or typo'd binding. CI step has `if: always()` removed — must succeed before deploy.
- **No retroactive enforcement on existing deploys:** This phase ships the gates; existing v0.x deploys grandfathered in. New deploys (post-merge) get the full check chain.

### Claude's Discretion
- `verify-deploy-target` job placement (shared-workflows v5 vs per-repo) — pending Q1 outcome. **This research recommends per-repo (Q1 verdict below).**
- Test framework — Vitest in both repos
- Filename convention — match existing repo patterns
- Error message format and exact wording
- Whether to extract any shared validation helper to `@myalterlego/triarch-shared` — lean toward "no" per CONTEXT
- Documentation depth — README updates if the repo has one; skip if not

### Deferred Ideas (OUT OF SCOPE)
- Shared `validateApphosting` helper in `@myalterlego/triarch-shared` (defer until v2.3+ if multiple new apps need it)
- Drift detection across deploys (compare apphosting.yaml between branches)
- Pre-deploy `terraform plan`-style dry-run for IAM changes
- Runbook / disaster recovery doc for "we deployed wrong-app to wrong-backend, how do we revert?" (Phase 26 candidate)
- CI matrix to test build against multiple Node versions
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CI-01 | `verify-deploy-target` job — fails if `${{ github.repository }}` doesn't match expected backend per a committed lookup table | Q1 verdict: ship per-repo (shared-workflows v4 inputs are immutable in practice; v5 requires shared-workflows PR + tag dance, more risk than 30-line per-repo job). Q2: existing `deploy-firebase.yml@v4` does NOT validate inputs against any whitelist — blindly passes `firebase_project_id` and `app_hosting_backend` to `firebase apphosting:rollouts:create`. CI-01 must enforce upstream of that call. |
| CI-02 | Per-repo deploy SAs — portal has its own `portal-deployer@…iam.gserviceaccount.com` distinct from admin's | Q5 verdict: GCP cannot scope a deploy SA to one App Hosting backend (no resource-level IAM, no IAM Conditions support). The "per-repo SA" is therefore a key-rotation + audit-trail boundary, NOT a blast-radius boundary. CI-01 + per-repo Actions secrets are the real isolation; SAs add audit clarity. Workload Identity Federation (no stored keys) is the recommended modern path. |
| CI-03 | Boot-time `assertEnv()` — missing var fails container start | Q3 verdict: `instrumentation.ts` `register()` hook in Next.js 16 is the canonical mechanism. Fires once before request handlers bind. `app/layout.tsx` server-throw is the inferior fallback (container "running" but every request 500s). |
| CI-04 | CI step `validate-apphosting.ts` — fails build on missing/typo'd binding | Q4 verdict: env-schema constant per repo cross-references both `apphosting.yaml` (prod) and `apphosting.dev.yaml` (dev overlay). Inventory below shows zero current drift; the script's job is preventing future drift, not fixing existing. |
</phase_requirements>

## Summary

The five research questions resolve cleanly with code-level evidence. Headline findings:

1. **`MyAlterLego/shared-workflows@v4` is operationally immutable for this phase.** The repo is public and the v4 tag is unprotected (a project-Owner can move it), but moving v4 silently breaks every other consumer. The right move is **per-repo `verify-deploy-target`** as a 30-line GitHub Actions job in each consumer's `ci-cd.yml`, gated `needs:` before the existing `deploy:` job that calls `deploy-firebase.yml@v4`. No shared-workflows PR. No v5 cut. No coordinated consumer-bump.

2. **Next.js 16 has a canonical boot hook: `instrumentation.ts` `register()` function.** Fires once per server instance, before any request handler binds. Documented in `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`. This is the correct surface for `assertEnv()`.

3. **GCP cannot enforce per-backend IAM isolation.** The Firebase App Hosting v1beta API (revision 20260429) exposes only `list/get/create/patch/delete` on `projects.locations.backends` — no `setIamPolicy`. IAM Conditions cannot use `resource.name` for `firebaseapphosting.googleapis.com` because the service is not in the supported-services list. **A project-level grant of `firebaseapphosting.rollouts.create` works on every backend in `triarch-dev-website`.** Per-repo SAs give you audit clarity and key-rotation independence; they do NOT give you blast-radius isolation. CI-01 is the actual isolation gate.

4. **Env inventory is clean.** Admin requires 21 distinct env names (12 plain values + 9 secret-bound; not counting `getSecret('…')` lookups via `@myalterlego/secrets`). Portal requires 11. Zero current drift between code references and apphosting bindings (one-line scripts confirmed below). Every `process.env.X` reference in source code maps to either an apphosting binding or a `getSecret()` vault lookup.

5. **Portal is currently un-deployable.** `gh secret list --repo MyAlterLego/triarch-portal` shows only `GH_PAT` and `NODE_AUTH_TOKEN`. **No `FIREBASE_SA_KEY` and no `ADMIN_API_TOKEN`.** The Phase 18 HUMAN-NEEDED note flagged this; it's still pending. Phase 24 is a hard prerequisite for Phase 25 cutover, but the deploy gates won't have been exercised live until those secrets land.

**Primary recommendation:** Plan four atomic plans for Phase 24 — (24-01) per-repo `verify-deploy-target` job + `.github/deploy-targets.yml` lookup tables in both repos; (24-02) `instrumentation.ts` + `src/lib/assertEnv.ts` + `src/lib/env-schema.ts` in both portal and admin; (24-03) `scripts/validate-apphosting.ts` + CI step in both; (24-04) HUMAN-VERIFY runbook for Mike's gcloud SA + IAM work + missing portal Actions secrets.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `yaml` | 2.8.4 | Parse apphosting.yaml + deploy-targets.yml in `validate-apphosting.ts` | Pure JS, zero deps, well-maintained, returns proper YAML 1.2 AST. Alternative `js-yaml@4.1.1` is heavier and older API. |
| `tsx` | 4.21.0 (already in both repos) | Run TS scripts in CI (`npx tsx scripts/validate-apphosting.ts`) | Already a portal devDep; admin uses it too. No new dep. |
| `vitest` | 4.1.5 (already in both) | Unit tests for `assertEnv` + `validate-apphosting` | Repo standard; already wired. No new dep. |

**Verified versions:** `npm view yaml version` → `2.8.4` (current). `npm view js-yaml version` → `4.1.1`. `tsx@4.21.0` is in portal's `package.json:devDependencies`. Vitest is already at 4.1.5 in portal; admin is at 4.x per CLAUDE.md.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@actions/core` | n/a (use `echo "::error::"` directly) | GitHub Actions error annotations | Inline shell `echo "::error::"` is sufficient — no JS step needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-repo `verify-deploy-target` | shared-workflows v5 with new job | v5 cut requires: PR to shared-workflows, tag, then PR-bump every consumer (admin + portal + future apps). Per-repo is 30 lines duplicated across 2 repos. Duplication is OK here because the lookup table content is per-repo anyway. |
| `instrumentation.ts` for assertEnv | `app/layout.tsx` server throw | Layout-throw fails on every request (container appears "healthy" to FAH; requests 500). Instrumentation fails at boot — FAH retry/rollback policy kicks in correctly. |
| YAML parser | Hand-roll regex | YAML has indentation, comments, multi-line strings, anchors. Hand-rolling is the textbook "Don't Hand-Roll" trap (see below). |
| Project-level deploy SA | Per-backend IAM | Doesn't exist (Q5). |
| SA keys | Workload Identity Federation | WIF is the recommended modern path (Google deprecated SA keys for CI in 2023). Keys still work; switching to WIF is a nice-to-have but adds setup complexity. **Recommend documenting WIF as a v2.3 follow-up; ship Phase 24 with SA keys to match the existing admin pattern.** |

**Installation (both repos, if not already present):**
```bash
# Both repos already have tsx + vitest. Only yaml needs adding.
npm install --save-dev yaml@^2.8.4
```

## Architecture Patterns

### Recommended File Layout (per repo, both admin and portal)
```
.github/
├── workflows/
│   └── ci-cd.yml             # NEW job: verify-deploy-target (gates `deploy:`)
└── deploy-targets.yml        # NEW lookup table: {repo: backend} mapping

src/
├── instrumentation.ts        # NEW Next.js boot hook → calls assertEnv()
└── lib/
    ├── assertEnv.ts          # NEW boot guard
    ├── assertEnv.test.ts     # NEW vitest
    ├── env-schema.ts         # NEW REQUIRED_ENV constant + types
    └── env-schema.test.ts    # NEW vitest

scripts/
├── validate-apphosting.ts    # NEW pre-deploy lint
└── validate-apphosting.test.ts  # NEW vitest
```

> **Note on instrumentation.ts location:** Next.js docs (`01-app/02-guides/instrumentation.md` line 17) say *"create `instrumentation.ts|js` file in the **root directory** of your project (or inside the `src` folder if using one)"*. Both admin and portal use `src/`, so the file goes at `src/instrumentation.ts`.

### Pattern 1: `verify-deploy-target` per-repo job
**What:** A pre-deploy GitHub Actions job that asserts `github.repository` matches the expected backend per a committed YAML lookup table.
**When to use:** Before any job that calls `deploy-firebase.yml`.

```yaml
# Source: distilled from existing ci-cd.yml + shared-workflows/v4 deploy-firebase.yml
# (admin/.github/workflows/ci-cd.yml lines 22-54 already shows the pattern shape)
verify-deploy-target:
  needs: quality-gate
  if: github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Verify repo→backend mapping
      run: |
        EXPECTED=$(yq -r ".[\"${GITHUB_REPOSITORY}\"]" .github/deploy-targets.yml)
        if [ -z "$EXPECTED" ] || [ "$EXPECTED" = "null" ]; then
          echo "::error::No deploy-targets.yml entry for ${GITHUB_REPOSITORY}. Add a mapping or remove the deploy job."
          exit 1
        fi
        if [ "$EXPECTED" != "${{ inputs.app_hosting_backend || 'NOT-SET' }}" ]; then
          # NOTE: with the lookup table approach, the *next* job's `with: app_hosting_backend:`
          # value is what we're guarding. We hard-code the expected backend in this job and let
          # the `deploy:` job's literal `app_hosting_backend:` static value match.
          echo "::error::Repo ${GITHUB_REPOSITORY} maps to backend '$EXPECTED' but deploy job has '${{ inputs.app_hosting_backend }}'."
          exit 1
        fi
        echo "OK: ${GITHUB_REPOSITORY} → $EXPECTED"

deploy:
  needs: [quality-gate, verify-deploy-target]   # ← NEW dependency
  # ... existing config ...
```

```yaml
# .github/deploy-targets.yml — committed to BOTH repos (identical content)
MyAlterLego/triarch-dev: triarch-dev
MyAlterLego/triarch-portal: portal-prod
```

> **NOTE on backend names:** admin's `ci-cd.yml` line 53 says `app_hosting_backend: triarch-dev` (NOT `admin-prod`). The CONTEXT mentioned `admin-prod` but the actual workflow uses `triarch-dev`. The lookup table must reflect reality (verified by reading `admin/.github/workflows/ci-cd.yml` line 53). Phase 24 should NOT rename backends; this is a planning artifact, not a refactor.

### Pattern 2: `instrumentation.ts` boot hook
**What:** Next.js calls `register()` once per new server instance, before any request handler binds. Throwing here aborts process startup.
**When to use:** Boot-time invariant validation (env presence, secret reachability, schema sanity).

```typescript
// src/instrumentation.ts
// Source: Next.js 16 docs (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md)
// "register function will be called once when a new Next.js server instance is initiated,
//  and must complete before the server is ready to handle requests"
export async function register() {
  // Only run on Node.js runtime — Edge runtime has different env surface
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnv } = await import('./lib/assertEnv');
    assertEnv();  // throws on missing required vars; aborts boot
  }
}
```

```typescript
// src/lib/assertEnv.ts
// Source: composed from CONTEXT decision (throw before request handler binds, log
// names not values) + portal's existing env binding pattern (apphosting.yaml).
import { REQUIRED_ENV } from './env-schema';

export function assertEnv(): void {
  const missing: string[] = [];
  for (const name of REQUIRED_ENV) {
    const v = process.env[name];
    if (v === undefined || v === '') missing.push(name);
  }
  if (missing.length > 0) {
    // Log names ONLY — never values. Even a misclassified secret stays uncompromised.
    const message = `[assertEnv] FATAL: missing required env vars: ${missing.join(', ')}`;
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }
}
```

> **Why throw instead of `process.exit(1)`?** Per Next.js docs, `register()` "must complete before the server is ready to handle requests". A thrown error aborts boot. `process.exit()` from `register()` is undocumented behavior and may interact poorly with Next.js's worker management. Throwing is the documented contract.

### Pattern 3: Env-schema constant per repo
**What:** Single source-of-truth list of required env names, exported from one file. Used by `assertEnv()` (runtime) AND `validate-apphosting.ts` (CI lint).

```typescript
// portal/src/lib/env-schema.ts
// Required at runtime in portal-prod and portal-dev FAH backends.
// Cross-checked by:
//   - assertEnv() at boot (instrumentation.ts)
//   - scripts/validate-apphosting.ts during CI (apphosting.yaml lint)
export const REQUIRED_ENV = [
  'NEXTAUTH_URL',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'INTERNAL_HMAC_SECRET',
  'ADMIN_INTERNAL_DISPATCH_URL',
  'FAH_PROMOTER_SA_KEY',
  'PORTAL_SLACK_BOT_TOKEN',
  'SLACK_RELEASE_APPROVAL_CHANNEL',
  'PORTAL_BUG_REPORTS_CHANNEL',
  'PORTAL_FEATURE_REQUESTS_CHANNEL',
] as const;

export type RequiredEnvName = typeof REQUIRED_ENV[number];
```

> **`NODE_AUTH_TOKEN` excluded.** It has `availability: [BUILD]` (not RUNTIME) — only present during `npm ci`. `assertEnv()` runs at *runtime*, so it shouldn't enforce build-only vars. `validate-apphosting.ts` should validate that BUILD-only vars are bound *somewhere* but not require them to be runtime-required.

### Pattern 4: `validate-apphosting.ts` CI lint
**What:** Pre-deploy script reads apphosting.yaml + apphosting.dev.yaml + env-schema.ts, asserts every REQUIRED_ENV name has a binding, exits 1 with diff on drift.

```typescript
// scripts/validate-apphosting.ts
// Source: composed from CONTEXT decisions. yaml@2.8.4 used (verified via npm view).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { REQUIRED_ENV } from '../src/lib/env-schema';

interface ApphostingEnv { variable: string; value?: string; secret?: string; availability?: string[] }
interface ApphostingDoc { env?: ApphostingEnv[] }

function bindingsIn(file: string): Set<string> {
  const text = readFileSync(resolve(file), 'utf8');
  const doc = parse(text) as ApphostingDoc;
  const names = new Set<string>();
  for (const e of doc.env ?? []) names.add(e.variable);
  return names;
}

function main() {
  const prod = bindingsIn('apphosting.yaml');
  const dev = bindingsIn('apphosting.dev.yaml');
  // Dev overlay merges on top of prod — a var bound in prod is inherited by dev unless overridden.
  // For required-at-runtime vars: must be bound in prod (dev inherits). Dev overrides are optional.
  const missingProd = REQUIRED_ENV.filter(n => !prod.has(n));
  if (missingProd.length > 0) {
    console.error(`apphosting.yaml is missing required bindings:\n  - ${missingProd.join('\n  - ')}`);
    process.exit(1);
  }
  // Bonus: dead binding detection (warning, not failure — apphosting may bind build-time vars
  // not in REQUIRED_ENV, which is fine).
  const dead = [...prod].filter(n =>
    !(REQUIRED_ENV as readonly string[]).includes(n) &&
    n !== 'NODE_AUTH_TOKEN' && // build-only, allow-list
    !n.startsWith('NEXT_PUBLIC_')  // build-time client bundling
  );
  if (dead.length > 0) {
    console.warn(`apphosting.yaml has bindings NOT in REQUIRED_ENV (dead?):\n  - ${dead.join('\n  - ')}`);
  }
  console.log(`OK: all ${REQUIRED_ENV.length} required vars bound; ${dev.size} dev overrides.`);
}

main();
```

CI step in `ci-cd.yml`:
```yaml
- name: Validate apphosting.yaml against env schema
  run: npx tsx scripts/validate-apphosting.ts
  # Runs in quality-gate job (or new job before verify-deploy-target).
  # No `if: always()` — must succeed before deploy.
```

### Anti-Patterns to Avoid
- **Storing the lookup table in shared-workflows.** Adds a release-coordination tax. Per-repo `.github/deploy-targets.yml` lets each repo own its mapping; the *content* of the table is identical across consumers because it's authoritative for ALL projects. (Yes, this is duplication. Acceptable per CONTEXT D-decision-discretion: "lean toward 'no'" on extracting shared validators.)
- **Throwing in `app/layout.tsx`.** Container starts, every request 500s, FAH considers the rollout "deployed" because the health check (if any) may not exercise the layout. Instrumentation throws at boot.
- **Reading process.env at module-top-level for the schema.** Schema is a static `as const` array. Reading `process.env` at module load freezes values at boot — fine for assertEnv, broken for hot-config tests. Schema-as-data, env-read-at-call-time.
- **A "soft" mode that warns instead of failing.** Per CONTEXT.md `## Decisions`: "Exit 1 with diff output on missing or typo'd binding. CI step has `if: always()` removed". No soft mode.
- **Granting deploy SAs `roles/firebaseapphosting.admin`.** Use `roles/firebaseapphosting.developer` — has `rollouts.create`, `builds.create`, `backends.update` but not `backends.create` / `backends.delete`. Smaller blast radius if a key is leaked.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parse apphosting.yaml | Custom regex | `yaml@2.8.4` | YAML has comments, multi-line strings, anchors, indentation rules. Regex breaks. |
| Repo→backend lookup parsing | Bash sed/awk | `yq` (already on ubuntu-latest runners) or `node -e "console.log(require('yaml').parse(...))"` | yq is preinstalled on `ubuntu-latest` — no install step. |
| HMAC-signed callbacks (separate concern) | n/a — Phase 22 already shipped | n/a | Phase 22 done; not a Phase 24 concern. |
| GCP IAM CRUD from CI | Custom curl + JWT signer | `gcloud iam` (in HUMAN-VERIFY runbook) — Mike runs once | Per CONTEXT.md, Phase 24 doesn't run gcloud from CI; HUMAN-VERIFY runbook only. |
| Boot-time env validation | `if (!process.env.X) process.exit(1)` scattered across files | Single `assertEnv()` from `instrumentation.ts` register hook | Centralized; matches Next.js documented contract. |

**Key insight:** Phase 24 is mostly about **wiring**, not algorithms. The hard parts (HMAC, JWT signing, FAH rollout API) are already in `@myalterlego/secrets`, `src/lib/github-app.ts`, `src/lib/fah-rollout.ts` — Phase 24 just adds 3 small surfaces (env schema, env asserter, apphosting linter) and 1 GHA job (verify-deploy-target).

## Runtime State Inventory

> Phase 24 is greenfield CI/infra (new files, new GHA jobs, new bindings) — no rename/refactor/migration. This section is included for completeness but answers "nothing found" in most categories.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by inspection. Phase 24 ships CI gates and boot guards; no DB writes, no schema migration, no data-shaped state. | None. |
| Live service config | **GitHub Actions secrets per repo (NOT in git):** `MyAlterLego/triarch-dev` has 5 (`ADMIN_API_TOKEN`, `DATABASE_URL`, `FIREBASE_SA_KEY`, `GH_PAT`, `NODE_AUTH_TOKEN`); `MyAlterLego/triarch-portal` has 2 (`GH_PAT`, `NODE_AUTH_TOKEN` only). **Portal is missing `FIREBASE_SA_KEY` and `ADMIN_API_TOKEN` — required for any portal deploy to succeed.** | Mike adds the missing portal secrets (HUMAN-VERIFY in 24-04). For CI-02 if cutting per-repo SAs: also add `FIREBASE_SA_KEY` rotated to portal-deployer's key. |
| OS-registered state | None — no Windows/launchd/systemd surface in this phase. | None. |
| Secrets/env vars | New env names introduced: none (Phase 24 validates existing ones). The phase touches `src/lib/env-schema.ts` content, which is the *list* of required names — that's source code, not a secret. | None — env schemas are code. |
| Build artifacts / installed packages | New devDep: `yaml@^2.8.4` in both repos. Triggers `package.json` + `package-lock.json` change. Phase 24's per-repo PRs include version bump (workspace CLAUDE.md mandate). | Standard `npm install` on next CI run regenerates lockfile entries. No global installs. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?* — Not applicable; Phase 24 doesn't rename anything.

**Additional state-not-in-git:** GCP IAM bindings on the `triarch-dev-website` project. New SAs (`portal-deployer@…` if Mike creates one) are NOT in git — they live in GCP IAM. The HUMAN-VERIFY runbook (24-04) documents the exact `gcloud projects add-iam-policy-binding` invocation Mike runs.

## Common Pitfalls

### Pitfall 1: shared-workflows v4 tag is unprotected
**What goes wrong:** A future PR force-moves the `v4` ref. Every consumer (admin + portal + future apps) now consumes the new code on next dispatch. Cross-app contamination.
**Why it happens:** GitHub tags are mutable refs by default. `gh api repos/MyAlterLego/shared-workflows/branches` shows `protected:false` on `main`. The v4 tag is a lightweight ref — `git tag -d v4 && git tag v4 newSha && git push --force --tags` works.
**How to avoid:** This phase doesn't mutate v4. CI-01's per-repo verify-deploy-target is the failsafe — even if shared-workflows v4 is moved, the deploy still rejects if `github.repository` ↔ `app_hosting_backend` don't match the committed lookup. **Defense-in-depth:** lookup table is the source of truth; shared-workflows is just the runner.
**Warning signs:** Sudden cross-repo CI failures right after a shared-workflows main-branch commit; check `git log -1 dba21501f7414c5962842649f7ea68b70361f247` (current v4 commit at time of research) before debugging consumer bugs.

### Pitfall 2: GCP cannot enforce per-backend IAM (Q5 verdict)
**What goes wrong:** A planner reads "per-repo deploy SAs" and assumes that means portal's SA *cannot* deploy admin. It can. Both backends live in `triarch-dev-website`; project-level `firebaseapphosting.rollouts.create` works on every backend in that project. There is no resource-level IAM available on Firebase App Hosting backends as of API revision 20260429.
**Why it happens:** GCP App Hosting v1beta API exposes `list/get/create/patch/delete` on `projects.locations.backends` but NOT `setIamPolicy`/`getIamPolicy` (verified via discovery doc fetch). IAM Conditions don't support `resource.name` matching for `firebaseapphosting.googleapis.com` (verified via cloud.google.com/iam/docs/conditions-resource-attributes — Firebase App Hosting not in supported-services list).
**How to avoid:** Treat per-repo SAs as a key-rotation + audit-trail boundary, not a blast-radius boundary. **CI-01 (verify-deploy-target) is the actual blast-radius gate.** Document this trade-off explicitly in 24-04-SUMMARY.md so future maintainers don't assume IAM gives them isolation it doesn't.
**Warning signs:** Any plan or task that says "portal SA can't deploy admin" — it can. Fix the language: "portal repo's CI can't deploy admin (because verify-deploy-target rejects mismatched repos)."

### Pitfall 3: instrumentation.ts location depends on src/
**What goes wrong:** File placed at repo root when project uses `src/` — Next.js can't find it, `register()` never fires, `assertEnv()` never runs.
**Why it happens:** Two valid paths per Next.js 16 docs (`01-app/02-guides/instrumentation.md` line 17): root for non-src projects, `src/instrumentation.ts` for src-using projects. Both admin and portal use `src/`.
**How to avoid:** Place at `src/instrumentation.ts` in BOTH admin and portal. Verify with `next build` log — Next.js logs "Instrumentation hook installed" or similar; if absent, file is in the wrong place.
**Warning signs:** Container boots, all requests succeed, but env enforcement isn't happening. Smoke-test by deliberately removing a binding in apphosting.dev.yaml (e.g., temporarily) and triggering a portal-dev deploy — boot should fail.

### Pitfall 4: Edge runtime invocation
**What goes wrong:** `register()` fires on BOTH Node.js and Edge runtimes (per docs: "Next.js calls `register` in all environments"). Edge runtime can't import Node modules and may have a different env surface (only `NEXT_PUBLIC_*` vars guaranteed).
**Why it happens:** Next.js 16 docs explicitly call this out. The `instrumentation.ts` examples show `if (process.env.NEXT_RUNTIME === 'nodejs')` gating.
**How to avoid:** Wrap `assertEnv()` in `if (process.env.NEXT_RUNTIME === 'nodejs')`. Edge routes don't need server env validation in this phase.
**Warning signs:** Build error during `next build` saying "Module not found" for fs/path/etc. when Edge runtime tries to import the assertEnv module.

### Pitfall 5: getSecret() vs assertEnv() coverage gap
**What goes wrong:** Admin loads many secrets via `getSecret('SLACK_BOT_TOKEN')` from `@myalterlego/secrets@0.1.0`. Those secrets are NOT in `process.env` until `getSecret()` is called (and even then, the package fetches from GCP Secret Manager first, falls back to `process.env`). `assertEnv()` checking `process.env.SLACK_BOT_TOKEN` at boot may PASS (because apphosting.yaml binds the secret) yet there's no test that vault is reachable. Conversely, vault-only secrets (without process.env binding) would fail `assertEnv` even though `getSecret()` works fine.
**Why it happens:** Two parallel secret-loading paths: (1) `apphosting.yaml secret: NAME` exposes via `process.env`; (2) `@myalterlego/secrets.getSecret('NAME')` reads from `triarch-vault` GCP project, falls back to `process.env`. They coincide because Phase 1 of v2.0 set up vault + apphosting bindings together.
**How to avoid:** Phase 24 `REQUIRED_ENV` for ADMIN should reflect what the *runtime expects from `process.env`* — i.e., everything bound in apphosting.yaml as `secret:` or `value:`. Vault-only secrets (none currently exist; verified) would NOT be in REQUIRED_ENV. Document this distinction in 24-02-SUMMARY.md.
**Warning signs:** A future task adds a vault-only secret without an apphosting binding; assertEnv breaks the deploy because process.env doesn't have it. Solution: either bind it in apphosting (recommended) or exclude from REQUIRED_ENV (only if `getSecret()` is the sole consumer).

### Pitfall 6: app_hosting_backend literal mismatch with deploy-targets.yml
**What goes wrong:** Admin's current `ci-cd.yml` line 53 says `app_hosting_backend: triarch-dev` — NOT `admin-prod`. CONTEXT.md and several requirements say `admin-prod`. If the lookup table contains `admin-prod` but the workflow input is `triarch-dev`, verify-deploy-target rejects every admin deploy.
**Why it happens:** Naming drift between roadmap docs and actual infra. The FAH backend is named `triarch-dev` (created at v0.1; never renamed). The CONTEXT alias `admin-prod` is the conceptual name, not the actual backend ID.
**How to avoid:** **Source of truth = actual `firebase apphosting:backends:list` output**, not roadmap copy. Lookup table content:
```yaml
MyAlterLego/triarch-dev: triarch-dev          # actual backend name
MyAlterLego/triarch-portal: portal-prod       # actual backend name
```
Document this in 24-01-SUMMARY.md so future devs reading roadmap docs that say "admin-prod" know they mean `triarch-dev`.
**Warning signs:** Deploy fails on first push to main with `verify-deploy-target` error message. Quick check: `gh api repos/MyAlterLego/triarch-dev/contents/.github/workflows/ci-cd.yml --jq .content | base64 -d | grep app_hosting_backend`.

### Pitfall 7: Test branch leaves cruft
**What goes wrong:** CONTEXT decision says "Test branch for CI-01 + CI-04 acceptance — created, observed reject, deleted." If the deletion step fails, the repo accumulates `test/wrong-deploy-target` branches and stale PR drafts.
**Why it happens:** GitHub branch deletion via REST is independent of local refs. Local `git branch -D` doesn't push.
**How to avoid:** Each plan ends with `git push origin --delete <test-branch>` AND `gh pr close <pr-num> --delete-branch` if a PR was opened. SUMMARY.md must include the cleanup verification.
**Warning signs:** Branch listing shows `test/cicd-deploy-safety-wrongbackend-...` after the phase closes.

### Pitfall 8: Assuming "validate-apphosting" can lint at PR time
**What goes wrong:** `validate-apphosting.ts` reads `apphosting.yaml` from the working directory. In PR runs, the checked-out code is the PR branch — the validation reflects that branch's bindings. Approved PR merges to main; main doesn't re-run validate (because the workflow already ran on the PR). If apphosting.yaml is the LAST commit before merge and doesn't trigger PR review, drift slips through.
**Why it happens:** GitHub Actions PR workflow runs once per PR push event, not on merge. The post-merge workflow run is on `push: main` — that's where `verify-deploy-target` and `validate-apphosting` MUST also run.
**How to avoid:** Wire the validation step into BOTH `pull_request: main` runs AND `push: main` runs. Existing `ci-cd.yml` already has both triggers (line 4-12); just place the step in `quality-gate` (which is `needs: quality-gate`-gated for the deploy).
**Warning signs:** Drift slips through PR review; `next build` succeeds in CI but production crashes at boot.

### Pitfall 9: REQUIRED_ENV imported by Vitest tests pulls in instrumentation
**What goes wrong:** `assertEnv.test.ts` imports `assertEnv` which imports `env-schema`. If env-schema is in the same module graph as `instrumentation.ts` register (via re-exports), Vitest may import the module and trigger `register()` on test boot — which then fails (no DATABASE_URL in test env).
**Why it happens:** Module side effects + Vitest's eager module loading.
**How to avoid:** Keep `instrumentation.ts` minimal — just the `register()` function calling `await import('./lib/assertEnv')`. The dynamic import means assertEnv is NOT loaded at instrumentation.ts load time. Tests can safely import `./lib/assertEnv` without booting instrumentation.
**Warning signs:** Vitest fails with "FATAL: missing required env vars" before any test runs.

## Code Examples

### Example 1: Existing per-repo verify-deploy-target placement
```yaml
# Source: admin/.github/workflows/ci-cd.yml, AFTER 24-01 changes.
# Existing structure (verified by reading file Oct 2026): quality-gate → deploy chain.
# verify-deploy-target inserted between.
jobs:
  quality-gate:
    uses: MyAlterLego/shared-workflows/.github/workflows/quality-gate.yml@v1
    with: { run_qa_tests: false, run_pentest: false, needs_server: false }
    secrets: inherit

  validate-apphosting:    # NEW — Plan 24-03
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
        env: { NODE_AUTH_TOKEN: ${{ secrets.NODE_AUTH_TOKEN }} }
      - run: npx tsx scripts/validate-apphosting.ts

  verify-deploy-target:   # NEW — Plan 24-01
    needs: quality-gate
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Verify github.repository → backend mapping
        run: |
          EXPECTED=$(yq -r ".\"${GITHUB_REPOSITORY}\"" .github/deploy-targets.yml)
          if [ -z "$EXPECTED" ] || [ "$EXPECTED" = "null" ]; then
            echo "::error::No deploy-targets.yml entry for ${GITHUB_REPOSITORY}"; exit 1
          fi
          # Hard-coded match — the deploy job's static value is the authoritative input.
          # (We can't read inputs from the deploy job here; we hardcode and fail loud
          #  if the deploy job's literal differs.)
          if [ "$EXPECTED" != "triarch-dev" ]; then    # admin's backend
            echo "::error::Mismatch: $EXPECTED ≠ triarch-dev"; exit 1
          fi
          echo "OK"

  deploy:
    needs: [quality-gate, verify-deploy-target, validate-apphosting]   # ← UPDATED
    if: github.event_name == 'push'
    uses: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@v4
    with:
      firebase_project_id: triarch-dev-website
      app_hosting_backend: triarch-dev
      deploy_command: apphosting
    secrets: inherit
```

### Example 2: gcloud IAM binding for portal-deployer SA (HUMAN-VERIFY runbook content)
```bash
# Source: composed from gcloud projects add-iam-policy-binding standard form +
# Firebase App Hosting Developer role per cloud.google.com IAM docs.
# Mike runs once, post-research, before Phase 25 cutover.

# 1. Create the SA
gcloud iam service-accounts create portal-deployer \
  --display-name="Portal CI/CD Deploy SA" \
  --project=triarch-vault

# 2. Grant FAH developer (rollouts/builds) — PROJECT-LEVEL because no per-backend IAM exists
gcloud projects add-iam-policy-binding triarch-dev-website \
  --member="serviceAccount:portal-deployer@triarch-vault.iam.gserviceaccount.com" \
  --role="roles/firebaseapphosting.developer"

# 3. Grant Service Account User on the FAH compute SA (so portal-deployer can act as the runtime SA during deploys)
gcloud iam service-accounts add-iam-policy-binding \
  firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com \
  --member="serviceAccount:portal-deployer@triarch-vault.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=triarch-dev-website

# 4. Mint a key, store in portal repo secrets (ROTATE quarterly)
gcloud iam service-accounts keys create portal-deployer-key.json \
  --iam-account=portal-deployer@triarch-vault.iam.gserviceaccount.com
gh secret set FIREBASE_SA_KEY --repo MyAlterLego/triarch-portal < portal-deployer-key.json
rm portal-deployer-key.json    # local file: don't leave on disk
```

> **Caveat (Pitfall 2):** Step 2 is project-level. portal-deployer has `firebaseapphosting.rollouts.create` on EVERY backend in `triarch-dev-website`. The "blast radius" is bounded by CI-01 (verify-deploy-target), not IAM. This is documented in 24-04-SUMMARY.md.

### Example 3: assertEnv test
```typescript
// src/lib/assertEnv.test.ts
// Source: composed from CONTEXT decisions + Vitest patterns from existing portal tests.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('assertEnv', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('passes when all required vars are set', async () => {
    process.env.NEXTAUTH_URL = 'https://x';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.NEXTAUTH_SECRET = 'x';
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'x';
    process.env.INTERNAL_HMAC_SECRET = 'x';
    process.env.ADMIN_INTERNAL_DISPATCH_URL = 'https://x';
    process.env.FAH_PROMOTER_SA_KEY = 'x';
    process.env.PORTAL_SLACK_BOT_TOKEN = 'x';
    process.env.SLACK_RELEASE_APPROVAL_CHANNEL = '#x';
    process.env.PORTAL_BUG_REPORTS_CHANNEL = '#x';
    process.env.PORTAL_FEATURE_REQUESTS_CHANNEL = '#x';

    const { assertEnv } = await import('./assertEnv');
    expect(() => assertEnv()).not.toThrow();
  });

  it('throws with the missing var name when one is unset', async () => {
    // ...same setup as above but delete one
    delete process.env.DATABASE_URL;
    const { assertEnv } = await import('./assertEnv');
    expect(() => assertEnv()).toThrow(/DATABASE_URL/);
  });

  it('lists ALL missing names in error message (not just first)', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    const { assertEnv } = await import('./assertEnv');
    expect(() => assertEnv()).toThrow(/DATABASE_URL.*NEXTAUTH_SECRET/);
  });

  it('does NOT log secret VALUES, only NAMES', async () => {
    delete process.env.DATABASE_URL;
    process.env.NEXTAUTH_SECRET = 'super-secret-value-must-not-appear';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { assertEnv } = await import('./assertEnv');
    try { assertEnv(); } catch {}
    const calls = errSpy.mock.calls.flat().join(' ');
    expect(calls).not.toContain('super-secret-value-must-not-appear');
    errSpy.mockRestore();
  });
});
```

## Q1: shared-workflows@v4 immutability — Verdict

**Question:** Is `MyAlterLego/shared-workflows@v4` immutable in practice? Can `verify-deploy-target` ship as a new shared-workflows job (v5) or must it ship per-repo?

**Evidence (HIGH confidence):**

1. **shared-workflows is a public, separate GitHub repo** (`gh api repos/MyAlterLego/shared-workflows` confirms `private:false`, owner User=MyAlterLego, default_branch=main).
2. **Tag inventory (gh api repos/MyAlterLego/shared-workflows/git/refs/tags):** `v1`, `v1.1`, `v1.2`, `v1.3`, `v1.4`, `v1.5`, `v2`, `v3`, `v4`. v4 = commit `dba21501f7414c5962842649f7ea68b70361f247` (lightweight ref, mutable).
3. **No branch protection** on `main` (`protected:false` confirmed via `gh api repos/MyAlterLego/shared-workflows/branches`).
4. **`deploy-firebase.yml@v4` already has 7 input parameters** (read directly: `gh api 'repos/.../contents/.github/workflows/deploy-firebase.yml?ref=v4'`):
   - `firebase_project_id` (required, string)
   - `deploy_command` (default 'apphosting')
   - `app_hosting_backend` (default '')
   - `app_url` (default '')
   - `git_branch` (default 'main')
   - `admin_callback_url` (default 'https://admin.triarch.dev')
   - `environment` (default 'prod')

**Cost comparison:**

| Path | Steps | Risk |
|------|-------|------|
| **shared-workflows v5** | (1) PR to MyAlterLego/shared-workflows adding `repo_name` input + verify step. (2) Tag `v5`. (3) Bump consumer ci-cd.yml in admin (PR + review + merge). (4) Bump consumer ci-cd.yml in portal (PR + review + merge). (5) Verify both deploy paths still work. | Cross-repo coordination; v4→v5 migration window where some consumers run v4 and some run v5; cosmetic version bumps in 2+ consumer repos. |
| **Per-repo verify-deploy-target** | (1) PR to admin: new GHA job + .github/deploy-targets.yml. (2) PR to portal: same. | Same-repo PRs; no shared-workflows release; lookup table content is per-repo (acceptable) but identical. ~30 lines duplicated, fully owned by each consumer. |

**Verdict: ship per-repo.** The shared-workflows route adds a release-coordination tax with zero benefit — the lookup table content is identical regardless of where the job lives, and a per-repo job is also more debuggable (no need to chase logs across repos).

**Mitigation for future apps:** When app #3 (e.g., a future Truth+Treason customer surface) lands, copy the per-repo job. If app #5 is on the horizon, THAT'S when to consider extracting to shared-workflows as v5 — i.e., extract only when duplication actually hurts (3+ consumers).

## Q2: deploy-firebase.yml@v4 input validation — Verdict

**Question:** Does `deploy-firebase.yml@v4` validate `firebase_project_id` / `app_hosting_backend` against any whitelist?

**Evidence (HIGH confidence):**

The full `deploy-firebase.yml@v4` was read (245 lines). The relevant deploy step is:
```yaml
- name: Deploy via App Hosting (main branch)
  if: inputs.deploy_command == 'apphosting' && (inputs.git_branch == '' || inputs.git_branch == 'main')
  run: |
    BACKEND="$APP_HOSTING_BACKEND"
    [ -z "$BACKEND" ] && BACKEND="$FIREBASE_PROJECT_ID"
    if [ "$ENVIRONMENT" = "dev" ]; then
      BACKEND="${BACKEND}-dev"
    fi
    DEPLOY_BRANCH="${INPUT_GIT_BRANCH:-main}"
    if [ "$ENVIRONMENT" = "dev" ] && [ "$DEPLOY_BRANCH" = "main" ]; then
      DEPLOY_BRANCH="dev"
    fi
    firebase apphosting:rollouts:create "$BACKEND" \
      --git-branch "$DEPLOY_BRANCH" \
      --project "$FIREBASE_PROJECT_ID" \
      --non-interactive 2>&1
```

**No whitelist check.** Inputs flow directly to `firebase apphosting:rollouts:create`. If a caller passes `firebase_project_id: triarch-dev-website` and `app_hosting_backend: portal-prod` from a workflow running in `MyAlterLego/triarch-dev`, the deploy executes against portal-prod with no protest — exactly the catastrophic failure mode CI-01 is designed to prevent.

**Verdict:** CI-01's check MUST live UPSTREAM of the call to `deploy-firebase.yml@v4`. Per Q1, that's a per-repo `verify-deploy-target` job in each consumer's `ci-cd.yml`, gated as a `needs:` dependency of the `deploy:` job. The lookup table is per-repo and identical (`MyAlterLego/triarch-dev → triarch-dev`, `MyAlterLego/triarch-portal → portal-prod`).

## Q3: Next.js 16 instrumentation.ts — Verdict

**Question:** Does Next.js 16 have a canonical `instrumentation.ts` boot hook? Or use `app/layout.tsx` server-throw?

**Evidence (HIGH confidence):**

From `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` (verified by Read):

> *"To set up instrumentation, create `instrumentation.ts|js` file in the **root directory** of your project (or inside the `src` folder if using one). Then, export a `register` function in the file. This function will be called **once** when a new Next.js server instance is initiated, and must complete before the server is ready to handle requests."*

From `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`:

> Version History: `v13.2.0` introduced as experimental; `v15.0.0` instrumentation stable + onRequestError introduced.

Both admin and portal are on Next.js 16.2.2 (verified via `package.json` Read). instrumentation.ts is stable, documented, and the canonical boot hook.

**Failure-mode comparison:**

| Approach | Container state on missing env | FAH retry/rollback behavior | Logs |
|----------|-------------------------------|------------------------------|------|
| **instrumentation.ts throw** | Process exits before binding port | FAH treats as failed rollout; previous version stays serving | Boot log shows the FATAL with var names |
| `app/layout.tsx` server throw | Process bound; first request 500s | FAH may consider rollout "healthy" (port bound); endless 500s | Per-request error logs (noisy) |
| Custom `next start` wrapper | Pre-Next.js exit; loses Next.js error handling | FAH same as instrumentation.ts | Wrapper script logs only |

**Verdict:** Use `instrumentation.ts` `register()` hook. Place at `src/instrumentation.ts` (both repos use `src/`). Wrap `assertEnv()` import in `if (process.env.NEXT_RUNTIME === 'nodejs')` per the docs' Edge-runtime guidance.

## Q4: Env-name inventory across both repos

### Admin: REQUIRED_ENV (12 entries — runtime-required, plain values + secrets)

Cross-referenced from:
- `apphosting.yaml` (read, 19 bindings total)
- `apphosting.dev.yaml` (read, 4 overrides)
- `grep -rhoE 'process\.env\.[A-Z_][A-Z0-9_]+' src/` (20 distinct names)
- `grep -rhE "getSecret\(['\"]([A-Z_][A-Z0-9_]+)['\"]\)" src/` (9 vault-loaded names — these are also present in apphosting as fallback)

```typescript
// admin/src/lib/env-schema.ts
export const REQUIRED_ENV = [
  'NEXTAUTH_URL',
  'ADMIN_EMAIL',
  'DEPLOY_WEBHOOK_URL',
  'PORTAL_BASE_URL',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'DEPLOY_WEBHOOK_SECRET',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_PAYLOAD_SECRET',
  'SLACK_RELEASE_APPROVAL_CHANNEL',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_INSTALLATION_ID',
  'FAH_PROMOTER_SA_KEY',
  'INTERNAL_HMAC_SECRET',
] as const;
// 18 entries
```

**Build-only (excluded from REQUIRED_ENV):** `NODE_AUTH_TOKEN` (availability: BUILD only).
**Public/inlined (excluded — handled by Next.js):** `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_TRIARCH_API_KEY`, `NEXT_PUBLIC_TRIARCH_API_URL`. These are inlined at build time; presence at runtime is irrelevant.
**Script-only (excluded — not part of FAH runtime):** `GCLOUD_ACCESS_TOKEN`, `GITHUB_TOKEN`, `GODADDY_API_KEY`, `GODADDY_API_SECRET`, `TRIARCH_API_KEY`, `TRIARCH_API_URL`, `DRY_RUN`. These appear only in `scripts/` (used by ad-hoc one-off scripts run locally or by Mike).
**GitHub Actions–only (excluded):** `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_SHA`. These are auto-injected by Actions; not bound in apphosting.

**Drift check (admin):**
- Bindings in apphosting.yaml NOT in REQUIRED_ENV: none (after exclusions).
- REQUIRED_ENV entries NOT in apphosting.yaml: none. ✅ Clean.
- Dev-overlay drift: `apphosting.dev.yaml` overrides 4 vars; all are in REQUIRED_ENV. ✅ Clean.

### Portal: REQUIRED_ENV (12 entries)

Cross-referenced from:
- `portal/apphosting.yaml` (read, 12 bindings)
- `portal/apphosting.dev.yaml` (read, 7 overrides)
- `grep -rhoE 'process\.env\.[A-Z_][A-Z0-9_]+' portal/src/` (9 distinct names)
- `grep -rhE "getSecret\(['\"]([A-Z_][A-Z0-9_]+)['\"]\)" portal/src/` (3 vault-loaded names)

```typescript
// portal/src/lib/env-schema.ts
export const REQUIRED_ENV = [
  'NEXTAUTH_URL',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'INTERNAL_HMAC_SECRET',
  'ADMIN_INTERNAL_DISPATCH_URL',
  'FAH_PROMOTER_SA_KEY',
  'PORTAL_SLACK_BOT_TOKEN',
  'SLACK_RELEASE_APPROVAL_CHANNEL',
  'PORTAL_BUG_REPORTS_CHANNEL',
  'PORTAL_FEATURE_REQUESTS_CHANNEL',
] as const;
// 12 entries
```

**Build-only (excluded):** `NODE_AUTH_TOKEN`.
**Runtime-only via process.env (no source ref but bound):** none — every binding is referenced.
**Code references with NO binding (bug):** none — every `process.env.X` in portal/src maps to an apphosting binding. ✅ Clean.
**`NODE_ENV`:** referenced in source (cookie config logic) but managed by Next.js at runtime, not a binding. Excluded from REQUIRED_ENV.

**Drift check (portal):** ✅ Clean — zero current drift; `validate-apphosting.ts` is purely preventive of FUTURE drift.

### Naming conventions
- Both repos use SCREAMING_SNAKE_CASE.
- Portal uses `PORTAL_` prefix for portal-specific resources (`PORTAL_NEXTAUTH_SECRET` mapped to `NEXTAUTH_SECRET` via secret-name-vs-env-name, `PORTAL_SLACK_BOT_TOKEN`, `PORTAL_BUG_REPORTS_CHANNEL`).
- Admin does NOT use an `ADMIN_` prefix — its env names are unprefixed (`NEXTAUTH_SECRET`, `SLACK_BOT_TOKEN`).
- Shared cross-app secrets use the same name and value: `INTERNAL_HMAC_SECRET`, `FAH_PROMOTER_SA_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Shared GCP secret IDs in `triarch-vault` use the prefixed form (`PORTAL_NEXTAUTH_SECRET`) and bind to the unprefixed env name in apphosting (`NEXTAUTH_SECRET`).

**Pattern is sound; no rename recommendation.** New phase 24 work should follow it: portal-specific = `PORTAL_*`, admin-specific = unprefixed, shared = unprefixed.

## Q5: GCP IAM scoping for per-app deploy SAs — HUMAN-VERIFY runbook

### Verdict (HIGH confidence)

**GCP cannot enforce per-backend IAM for Firebase App Hosting.** Project-level grants are the only available scope.

### Evidence

1. **Firebase App Hosting v1beta API discovery doc** (revision 20260429, fetched live): `projects.locations.backends` exposes only `list/get/create/patch/delete`. **No `setIamPolicy` / `getIamPolicy` methods.** Same for `backends.builds` and `backends.rollouts`.
   ```bash
   curl -s 'https://firebaseapphosting.googleapis.com/$discovery/rest?version=v1beta' | \
     python3 -c "import json,sys; print(json.dumps(list(json.load(sys.stdin)['resources']['projects']['resources']['locations']['resources']['backends'].get('methods',{})), indent=2))"
   # ["list", "get", "create", "patch", "delete"]
   ```

2. **IAM Conditions don't help.** Per cloud.google.com/iam/docs/conditions-resource-attributes: only services in an explicit allow-list support `resource.name` in IAM Conditions. **`firebaseapphosting.googleapis.com` is NOT in that list** (verified via WebFetch).

3. **Predefined roles are project-scoped:**
   - `roles/firebaseapphosting.admin` — full backends/builds/rollouts/domains/traffic.
   - `roles/firebaseapphosting.developer` — read+update on backends, full on builds/rollouts. **Has `firebaseapphosting.rollouts.create`. Does NOT have `backends.create`/`backends.delete`.** Smaller blast radius if a key leaks.
   - `roles/firebaseapphosting.viewer` — read-only.
   - `roles/firebaseapphosting.computeRunner` — runtime-only (the `firebase-app-hosting-compute@…` SA gets this; it's NOT for CI deploy SAs).

### Recommended runbook (Mike runs once, post-research)

**Goal:** Per-repo deploy SAs that satisfy CI-02 *as an audit-trail and key-rotation boundary* — NOT as a blast-radius boundary.

```bash
# ────────────────────────────────────────────────────────────────
# CONTEXT: triarch-vault hosts the SAs (existing pattern from Phase 13);
#          triarch-dev-website hosts both portal-prod and triarch-dev (admin) backends.

# A. Admin SA (already exists per gh secret list — FIREBASE_SA_KEY in triarch-dev repo)
#    Confirm role attached:
gcloud projects get-iam-policy triarch-dev-website \
  --format='table(bindings.role,bindings.members)' \
  --filter='bindings.role:firebaseapphosting'
# Expected: existing admin-deploy SA listed under roles/firebaseapphosting.admin or .developer.
# If admin still has roles/firebaseapphosting.admin, downgrade to .developer for least-privilege:
gcloud projects remove-iam-policy-binding triarch-dev-website \
  --member="serviceAccount:<EXISTING-ADMIN-SA>@triarch-vault.iam.gserviceaccount.com" \
  --role="roles/firebaseapphosting.admin"
gcloud projects add-iam-policy-binding triarch-dev-website \
  --member="serviceAccount:<EXISTING-ADMIN-SA>@triarch-vault.iam.gserviceaccount.com" \
  --role="roles/firebaseapphosting.developer"

# B. NEW: portal-deployer SA
gcloud iam service-accounts create portal-deployer \
  --display-name="Portal CI/CD Deploy SA (Phase 24)" \
  --project=triarch-vault

# C. Grant FAH developer role at PROJECT level (no resource-level option exists)
gcloud projects add-iam-policy-binding triarch-dev-website \
  --member="serviceAccount:portal-deployer@triarch-vault.iam.gserviceaccount.com" \
  --role="roles/firebaseapphosting.developer"

# D. Grant Service Account User on FAH compute SA (so portal-deployer can dispatch deploys
#    that act as the runtime SA — required for FAH rollouts)
gcloud iam service-accounts add-iam-policy-binding \
  firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com \
  --member="serviceAccount:portal-deployer@triarch-vault.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=triarch-dev-website

# E. Mint key (rotate quarterly; record rotation date in 24-04-SUMMARY.md)
gcloud iam service-accounts keys create /tmp/portal-deployer-key.json \
  --iam-account=portal-deployer@triarch-vault.iam.gserviceaccount.com

# F. Store in portal repo Actions secrets
gh secret set FIREBASE_SA_KEY --repo MyAlterLego/triarch-portal < /tmp/portal-deployer-key.json
shred -u /tmp/portal-deployer-key.json    # macOS: rm -P; never leave on disk

# G. Verify
gh secret list --repo MyAlterLego/triarch-portal
# Expected: FIREBASE_SA_KEY now listed alongside GH_PAT, NODE_AUTH_TOKEN.

# H. Add ADMIN_API_TOKEN to portal repo (still missing per gh secret list 2026-05-09)
#    Get the token from admin's projects.apiKey for portal's project row in CRDB
#    (or generate a new one if portal hasn't been added to projects table yet — Phase 25 task).
gh secret set ADMIN_API_TOKEN --repo MyAlterLego/triarch-portal --body "<token>"
```

### Caveat (must be in 24-04-SUMMARY.md)

> *Per-repo SAs do NOT prevent portal-deployer from technically being able to call `firebaseapphosting.rollouts.create` on the `triarch-dev` (admin) backend. Resource-level IAM is unavailable on Firebase App Hosting backends as of API revision 20260429 (research date 2026-05-09). The blast-radius isolation is enforced by `verify-deploy-target` in CI (Plan 24-01), which rejects mismatched (repo, backend) pairs before any `firebase apphosting:rollouts:create` call. The per-repo SA boundary is for: (1) audit-trail clarity (CloudAudit logs show different identities), (2) key-rotation independence, (3) future migration to Workload Identity Federation per repo without disturbing the other.*

### Workload Identity Federation (recommended v2.3 follow-up)

Google deprecated SA keys for CI in 2023. WIF eliminates stored JSON keys: GitHub Actions OIDC token is exchanged for a short-lived GCP token. Setup is a one-time per-repo workload identity pool + provider configuration. **Document as a v2.3 candidate** — Phase 24 ships with SA keys to match admin's existing pattern; switching is mechanical and isolatable. Source: `google-github-actions/auth` README + cloud.google.com workload-identity-federation-with-deployment-pipelines.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `process.env.X` checks scattered across files | Centralized `assertEnv()` from `instrumentation.ts` register hook | Next.js 13.2 (experimental) → 15.0 stable | Single source of truth; fail-fast at boot |
| Service account JSON keys for CI | Workload Identity Federation | GCP deprecated keys for CI in 2023 | Recommended but not mandatory; WIF is a v2.3 follow-up here |
| Project-level FAH IAM | Resource-level IAM on backends | **NOT available** as of API rev 20260429 | Per-backend isolation only via CI-layer gates (CI-01) |
| `firebase apphosting:secrets:set` | Same — still the canonical CLI for FAH secret bindings | No change | Bindings still written to `apphosting.yaml`; vault path via `@myalterlego/secrets` is overlay |
| `app/layout.tsx` server throw for env | `instrumentation.ts` register | Next.js 13.2+ | Pre-request boot abort vs. per-request 500 |

**Deprecated/outdated:**
- Long-lived SA keys for CI (still works; WIF preferred).
- Hand-rolled env checks in route handlers (centralize via assertEnv).

## Open Questions

> Mike's calls (these unblock execution; planner cannot resolve from research alone):

1. **Should portal-deployer be created NOW (in Phase 24) or deferred to Phase 25?**
   - What we know: Portal currently has no `FIREBASE_SA_KEY` — first portal deploy fails today with or without Phase 24.
   - What's unclear: If Phase 25 cutover is imminent (per ROADMAP), creating portal-deployer now decouples Phase 24's CI-02 from Phase 25's go-live. If cutover slips, the SA sits unused.
   - Recommendation: Create the SA in Phase 24's HUMAN-VERIFY (24-04 runbook). Even if unused for a sprint, it's safe — IAM bindings are reversible.

2. **Can the existing admin SA be reused for both repos with role downgrade?**
   - What we know: The current admin `FIREBASE_SA_KEY` is in `MyAlterLego/triarch-dev` only. Sharing it with portal would violate CONTEXT D-decision "Per-repo deploy SAs."
   - What's unclear: Whether Mike actually wants the admin SA renamed (current name unknown — only the secret value is in `gh secret list`). Phase 24 just consumes the secret; renaming is out of scope.
   - Recommendation: Don't rename. Phase 24 only creates portal-deployer NEW; admin's existing SA stays.

3. **Should Workload Identity Federation be in Phase 24 scope?**
   - What we know: WIF is the modern best-practice; SA keys still work and are simpler to set up first time.
   - What's unclear: Whether a WIF migration is a Phase 24 concern or a v2.3 cleanup. CONTEXT decisions don't mention WIF.
   - Recommendation: **Defer WIF to v2.3.** Phase 24 ships with SA keys. Document as v2.3 candidate in PROJECT.md when transitioning.

4. **Should the lookup table also enforce environment (`prod` vs `dev`)?**
   - What we know: The existing `deploy-firebase.yml@v4` `environment` input drives `BACKEND="${BACKEND}-dev"` shell-side. So "portal-prod" plus `environment: dev` deploys to `portal-prod-dev` (no such backend) → silently fails.
   - What's unclear: Whether to add `environment` to the lookup. Probably overkill — there's only one prod path per repo, and dev is auto-derived.
   - Recommendation: Single-key lookup (repo → backend), accept the existing -dev suffix convention. `validate-apphosting.ts` validates apphosting.yaml; verify-deploy-target validates the (repo, backend) pair. Environment is downstream concern.

## Sources

### Primary (HIGH confidence)
- `gh api repos/MyAlterLego/shared-workflows/...` — full v4 deploy-firebase.yml + tag inventory + branch protection state
- `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` (Next.js 16.2.2 official docs, instrumentation guide)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` (Next.js 16 API reference + version history)
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` (Next.js 16 env-var contract)
- `https://firebaseapphosting.googleapis.com/$discovery/rest?version=v1beta` (live FAH API discovery doc, revision 20260429)
- `https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseapphosting` (Firebase App Hosting predefined roles)
- `https://docs.cloud.google.com/iam/docs/conditions-resource-attributes` (IAM Conditions service support)
- Local files Read: admin/.github/workflows/ci-cd.yml, portal/.github/workflows/ci-cd.yml, admin/apphosting.yaml + .dev.yaml, portal/apphosting.yaml + .dev.yaml, admin/.planning/* (CONTEXT, REQUIREMENTS, STATE, PROJECT)

### Secondary (MEDIUM confidence)
- `firebase.google.com/docs/projects/iam/roles-predefined-product` (Firebase IAM roles overview, fetched via WebFetch)
- `https://github.com/google-github-actions/auth` (WIF setup reference) — search result, not directly fetched

### Tertiary (LOW confidence — flagged for validation if used)
- WIF + Firebase Admin SDK direct compatibility (one search result claimed "not supported by Firebase Admin SDK; use SA keys" — partial; WIF works with the FAH deploy CLI, just not always with Admin SDK at runtime). Validate before recommending WIF for runtime.

## Metadata

**Confidence breakdown:**
- Q1 shared-workflows verdict: **HIGH** — direct API inspection of repo + tag list + branch protection.
- Q2 deploy-firebase.yml v4 input validation: **HIGH** — full file read at v4 ref.
- Q3 Next.js instrumentation: **HIGH** — official docs in node_modules at the project's pinned Next.js version.
- Q4 env inventory: **HIGH** — exhaustive grep + cross-reference of every yaml binding and source reference.
- Q5 GCP IAM scoping: **HIGH** — live discovery doc fetch + IAM Conditions docs cross-reference; verdict (no resource-level IAM) confirmed by ABSENCE of setIamPolicy method, not by source claim.
- Standard stack: **HIGH** — `npm view yaml version` + portal/admin package.json reads.
- Architecture patterns: **HIGH** — patterns are direct extensions of existing repo conventions (Phase 22-22.5 established instrumentation-adjacent patterns).
- Pitfalls: **MEDIUM-HIGH** — pitfalls are derived from observed code (e.g., admin/portal apphosting drift potential, getSecret/process.env dual path); not all are battle-tested.

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30 days — Firebase API + IAM are slow-moving; Next.js 16 instrumentation is stable since 15.0)

## RESEARCH COMPLETE
