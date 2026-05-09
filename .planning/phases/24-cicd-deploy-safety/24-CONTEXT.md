# Phase 24: CI/CD Deploy Safety - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning (after research)
**Type:** Infrastructure / CI / DevOps (admin + portal + possibly shared-workflows)

<domain>
## Phase Boundary

Make cross-app deploy disasters impossible:
1. CI fails fast if `${{ github.repository }}` doesn't match the expected Firebase backend (lookup table)
2. Portal and admin each have their own deploy SAs — neither can deploy the other
3. Containers fail to start cleanly if required env vars are missing (no half-broken serves)
4. CI lints `apphosting.yaml` / `apphosting.dev.yaml` against a typed env-name schema (catches typos before deploy)

Out of scope: actual GCP IAM/SA provisioning (Mike's hands-on work in `gcloud` / Firebase Console). The phase wires the SA references into CI workflows and provides documentation for the GCP setup, but the actual `gcloud iam service-accounts create` invocations and IAM bindings are HUMAN-VERIFY items.

</domain>

<decisions>
## Implementation Decisions

### Architectural defaults (Claude's Discretion unless research overrides)
- **`assertEnv()` boot guard:** Add to BOTH portal and admin (`src/lib/assertEnv.ts` in each), called from `app/layout.tsx` (server) or `instrumentation.ts` (Next.js boot hook) — fail loud at startup with a list of missing required env names, not silent partial serve.
- **Env-name schema source of truth:** TypeScript `const REQUIRED_ENV = ['VAR_A', 'VAR_B', ...] as const` per app, exported from `src/lib/env-schema.ts`. NOT stored in the shared package — each app has its own required set, and shared validators add coupling that buys nothing.
- **`validate-apphosting.ts` script location:** `scripts/validate-apphosting.ts` in each repo (admin and portal). Reads its own `apphosting.yaml` + `apphosting.dev.yaml`, parses bindings, cross-checks against the same `env-schema.ts` constant. Run via `npx tsx scripts/validate-apphosting.ts` as a CI step, gated before deploy.
- **`verify-deploy-target` job placement:** Pending research — see Research Questions below.
- **Per-repo deploy SAs (CI-02):** Wire as new GitHub secrets per repo — `FIREBASE_DEPLOY_SA_KEY` (or similar). Portal CI uses portal's SA; admin CI uses admin's. The actual SA creation and IAM binding is HUMAN-VERIFY (Mike runs `gcloud`).
- **Test branch for CI-01 + CI-04 acceptance:** Each phase has a "deliberately wrong" branch that gets pushed and CI rejects. The orchestrator (or executor) creates the test branch, observes the rejection, then deletes it. Documented in SUMMARY.

### CONTEXT-driven decisions
- **Backend lookup table format:** YAML in `.github/deploy-targets.yml` (or similar) at repo root — `{repo: app_hosting_backend}` map; `verify-deploy-target` reads it, asserts current `${{ github.repository }}` matches expected backend. Two entries: `MyAlterLego/triarch-dev → admin-prod`, `MyAlterLego/triarch-portal → portal-prod`.
- **Failure mode for `assertEnv`:** Throw before request handler binds. Process exit non-zero on container start. Log the missing var names, NOT their values (no secret leakage even if a "secret" was wrongly set as a public env).
- **`validate-apphosting.ts` exit code:** Exit 1 with diff output on missing or typo'd binding. CI step has `if: always()` removed — must succeed before deploy.
- **No retroactive enforcement on existing deploys:** This phase ships the gates; existing v0.x deploys grandfathered in. New deploys (post-merge) get the full check chain.

### Claude's Discretion
- Test framework for `validate-apphosting.ts` and `assertEnv` — match repo standard (Vitest in both)
- Filename convention — match the repo's existing patterns
- Error message format and exact wording
- Whether to extract any shared validation helper to `@myalterlego/triarch-shared` (lean toward "no" — keep CI gates per-repo for now; consolidation is a future cleanup)
- Mobile / responsive — N/A, this is server/CI work
- Documentation depth — README updates if the repo has one for CI; skip if not

</decisions>

<research_questions>
## Research Questions (block planning until answered)

1. **Is `MyAlterLego/shared-workflows@v4` immutable in practice?** From ROADMAP `research_required` flag: "Whether `MyAlterLego/shared-workflows@v4` is immutable in practice or can accept the new `verify-deploy-target` job + `repo_name` input via v5 tag." Inspect:
   - Is shared-workflows a separate repo with its own version tags?
   - Does the workflow file already accept inputs we can extend?
   - What's the migration cost of adding a v5 tag vs. adding a per-repo `verify-deploy-target` step in each consumer's `ci-cd.yml`?
   - **Decision dependency:** If v5 is feasible → CI-01 lands as a new shared-workflows job + the consumer workflows reference v5. If not → CI-01 lands as a per-repo CI step (more code duplication but unblocks the gate immediately).

2. **What's the existing `firebase_project_id` / `app_hosting_backend` mapping in shared-workflows?** Does `deploy-firebase.yml@v4` already validate the inputs match a known set, or does it blindly deploy whatever's passed? Determines whether CI-01's check belongs upstream or downstream.

3. **Does Next.js 16 have a canonical `instrumentation.ts` boot hook usable for `assertEnv()`?** Or should we call from `app/layout.tsx` server component? Latency / failure-mode tradeoff. Read Next.js docs in `node_modules/next/dist/docs/` per workspace CLAUDE.md.

4. **Are there existing env-name conventions (`PORTAL_*`, `ADMIN_*` prefixes)?** Inventory required vars in both repos (apphosting.yaml + dev.yaml + any code references). Generate the canonical `env-schema.ts` constant per repo from this inventory.

5. **Pitfalls specific to multi-app Firebase projects:** Both portal-prod and admin-prod live in the same `triarch-dev-website` GCP project. Per-repo deploy SAs need IAM scoped to specific App Hosting backends, not the project. What's the gcloud command shape for binding a SA to one backend without project-wide deploy permission? (Documentation for HUMAN-VERIFY.)

</research_questions>

<code_context>
## Existing CI Surface (inventory)

### Admin (`/Users/mikegeehan/claude/triarch/development/admin/.github/workflows/`)
- `ci-cd.yml` — uses `quality-gate.yml@v1` (older), no deploy job in admin (admin deploys via different mechanism — investigate)
- `check-shared-version.yml` — gates against shared package version drift
- `promote-branch.yml` — promotion workflow
- `publish-shared.yml` — publishes the `@myalterlego/triarch-shared` package

### Portal (`/Users/mikegeehan/claude/triarch/development/portal/.github/workflows/`)
- `ci-cd.yml` — uses `quality-gate.yml@v1` AND `deploy-firebase.yml@v4` for actual deploys
  - `firebase_project_id: triarch-dev-website`
  - `app_hosting_backend: portal-prod`

### Shared workflows reference
- `MyAlterLego/shared-workflows` — separate GitHub org/repo
- Pinned versions: `quality-gate.yml@v1`, `deploy-firebase.yml@v4`
- Researcher must clone-or-fetch this repo to inspect the workflow files and decide v5 feasibility

### Both repos also use
- Workspace CLAUDE.md mandates: `npx next build`, version bump, PR-based, never direct-to-main except trivial admin
- Per-project version files: `package.json` in both
</code_context>

<deferred>
## Deferred Ideas

- Shared `validateApphosting` helper in `@myalterlego/triarch-shared` (defer until v2.3+ if multiple new apps need it)
- Drift detection across deploys (compare apphosting.yaml between branches and detect missing rollback path)
- Pre-deploy `terraform plan`-style dry-run for IAM changes (out of scope; this phase is deploy-time gates only)
- Runbook / disaster recovery doc for "we deployed wrong-app to wrong-backend, how do we revert?" (could be a Phase 26 sunset item)
- CI matrix to test build against multiple Node versions (out of scope; CI-CD safety, not build-matrix expansion)

</deferred>
