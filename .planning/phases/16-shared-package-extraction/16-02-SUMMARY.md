---
phase: 16-shared-package-extraction
plan: 02
subsystem: infra
tags: [github-actions, github-packages, npm-publish, ci-cd, semver, version-drift]

# Dependency graph
requires:
  - phase: 16-shared-package-extraction
    provides: "packages/triarch-shared/ package scaffold (from 16-01)"
provides:
  - "Tag-driven publish workflow: pushing shared/v* tag builds and publishes @myalterlego/triarch-shared to GitHub Packages"
  - "PR version-drift gate: fails any PR touching packages/triarch-shared/src/ without bumping package.json version vs latest shared/v* tag"
affects:
  - 16-shared-package-extraction (Plan 16-04 triggers publish-shared.yml with shared/v0.1.0)
  - all future phases that modify packages/triarch-shared/ (gate enforces version discipline)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tag-driven publish: shared/v* tag (not branch push) triggers publish — keeps publish and CI completely separate"
    - "Drift detection vs tag (not base branch): diff since last published tag catches accumulated unbumped PRs, not just per-PR delta"
    - "Pre-first-publish skip mode: gate is informational until shared/v0.1.0 tag exists; Plan 16-04 flips it to enforcing"

key-files:
  created:
    - .github/workflows/publish-shared.yml
    - .github/workflows/check-shared-version.yml
  modified: []

key-decisions:
  - "npm install (not npm ci) in publish workflow because packages/triarch-shared has no committed lockfile yet; switch to npm ci when lockfile is committed"
  - "Drift gate diffs against latest shared/v* tag (not PR base branch) to catch multi-PR accumulation of unbumped changes"
  - "No separate test step in publish workflow — admin's vitest suite tests behavior transitively via re-export shims (Plan 16-03)"
  - "Both workflows use GITHUB_TOKEN only — no new secrets needed; publish gets packages: write via explicit permissions block"

patterns-established:
  - "Tag-vs-package-version guard in publish: exit 1 if tag shared/vX.Y.Z does not match package.json version field"
  - "Inline Node semver compare in shell: three-segment major.minor.patch without semver npm dep"
  - "shared/v* tag namespace: distinct from admin vX.Y.Z commit convention; no tag conflicts"

requirements-completed: [PKG-02, PKG-04]

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 16 Plan 02: Publish + Version-Drift CI Workflows Summary

**Two GitHub Actions workflows adding tag-driven publish and PR version-drift enforcement for @myalterlego/triarch-shared via shared/v* tag namespace and git-tag-based diff**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T16:51:00Z
- **Completed:** 2026-05-08T16:56:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `publish-shared.yml` created: triggers on `shared/v*` tag push, verifies tag matches package.json version, installs, builds, publishes to GitHub Packages using workflow-scoped GITHUB_TOKEN
- `check-shared-version.yml` created: PR gate that diffs packages/triarch-shared/src/ against the latest `shared/v*` tag (not PR base branch), fails if source changed without version bump
- Both workflows pass Python yaml.safe_load validation; neither touches admin source code or admin's existing ci-cd.yml

## Tag Pattern: No Conflict with Admin Version Convention

Admin's commit-message convention uses `vX.Y.Z` prefixed commit messages (e.g., `v2.9.0: description`) — these are NOT git tags. The admin `ci-cd.yml` triggers on branch pushes (`main`, `release/**`, `hotfix/**`), not tags.

The shared package uses git tags with the `shared/v*` namespace (e.g., `shared/v0.1.0`). These are disjoint from any admin tag pattern — admin does not push semver git tags. No conflict.

## Version-Drift Gate: Skip Mode Until Plan 16-04

Before `shared/v0.1.0` is tagged (Plan 16-04), `check-shared-version.yml` detects no `shared/v*` tags and exits the "Determine latest published shared version" step with `skip=true`. Subsequent steps are conditioned on `skip != 'true'`, so the gate is fully bypassed. The summary step still runs and prints `## Pre-first-publish — drift gate skipped`.

After Plan 16-04 tags `shared/v0.1.0`, any PR touching `packages/triarch-shared/src/` or `tsconfig.json` without bumping `package.json` version will fail the gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: publish-shared.yml** - `039819c` (feat)
2. **Task 2: check-shared-version.yml** - `92c7655` (feat)

## Files Created/Modified

- `.github/workflows/publish-shared.yml` - Tag-driven publish: triggers on `shared/v*` push, verifies version match, builds and publishes @myalterlego/triarch-shared to GitHub Packages
- `.github/workflows/check-shared-version.yml` - PR gate: diffs source against latest `shared/v*` tag, fails if src/ changed without version bump

## Decisions Made

- Used `npm install` instead of `npm ci` in publish workflow — `packages/triarch-shared` has no committed lockfile yet (zero runtime deps, minimal devDeps). Can switch to `npm ci` after lockfile is committed in Plan 16-03.
- Drift gate diffs against git tag (not PR base branch) — catches the "merged 3 schema PRs without bumping; the 4th also forgets" failure mode. Base-branch diff would only catch within-PR changes.
- No test step in publish workflow — admin's Vitest suite proves behavior transitively through re-export shims (after Plan 16-03 lands). Avoids duplicate test execution.
- Both workflows use `GITHUB_TOKEN` only — no new secrets added. Publish gets `packages: write` via explicit `permissions:` block (default GITHUB_TOKEN scope is read-only for packages).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — both workflow files created cleanly with valid YAML syntax.

## Admin Tests / Build Status

No admin source code was modified in this plan. Admin's `npx vitest run` and `npx next build` remain in the state they were before this plan executed (no regressions introduced).

## Next Phase Readiness

- Plan 16-03 can confidently move `src/db/schema.ts` and helper files into `packages/triarch-shared/src/` — version-drift gate is already live (in skip mode) and will activate the moment 16-04 tags `shared/v0.1.0`
- Plan 16-04 can tag `shared/v0.1.0` and push — `publish-shared.yml` will trigger, verify version match, build, and publish to GitHub Packages
- No blockers for Wave 1 siblings (16-01 scaffold already committed; 16-02 CI workflows now committed)

---
*Phase: 16-shared-package-extraction*
*Completed: 2026-05-08*
