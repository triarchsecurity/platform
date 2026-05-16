# Phase 32: CL-4 Roll to Consumers - Context

**Gathered:** 2026-05-16
**Status:** Ready for parallel execution (4 repos, mirrors Phase 28 platform self-adopt)

<domain>
## Phase Boundary

Wire `gate-prod-version.yml@v8.2` into 4 consumer repos' ci-cd.yml as `needs:` prerequisite of deploy-prod. Mirror Phase 28's platform self-adopt exactly. Per-repo ADMIN_API_TOKEN secret is a HUMAN-UAT step (Settings → Actions secrets, can't be set autonomously).

4 consumer repos:
- dev-portal (project_key: triarchsecurity-dev-portal — verify by reading admin DB seed or Project record)
- darksouls (project_key: darksouls)
- tmi (project_key: tmi)
- truthtreason (project_key: truthtreason)

Also: per the roadmap entry, tmi + truthtreason need back-patching to v2.13.10 framework (corrected C-12 verify-dev-deployed direction; remove `[hotfix-bypass-dev]` token). This may already be done in their `dev` branches — verify per-repo during execution.

Out of scope: ADMIN_API_TOKEN secret provisioning (human GitHub Settings UI), v8.2 tag/publish (still pending from Phase 28 HUMAN-UAT), live deploy verification.

</domain>

<decisions>
## Implementation Decisions

### Per-consumer wire-up pattern (same as Phase 28 platform)
1. Add `cl4-gate` job in ci-cd.yml using `triarchsecurity/shared-workflows/.github/workflows/gate-prod-version.yml@v8.2`
2. Inputs: `project_key: <verified>`, `target_version: ${{ needs.version.outputs.version }}` (add `version` job if absent — same pattern as Phase 28 added to platform)
3. Secret: `ADMIN_API_TOKEN: ${{ secrets.ADMIN_API_TOKEN }}`
4. `if:` guard: gate only fires on prod-deploy path (env=prod or push to main)
5. Update `deploy-prod` job's `needs:` array to include `cl4-gate`; extend `deploy.if` to allow `cl4-gate.result == 'success' || 'skipped'`
6. Bump per-repo version
7. Single commit format: `vX.Y.Z: feat(ci-cd): wire gate-prod-version@v8.2 as needs of deploy-prod (CL-4)`
8. Local commits only on feature branch `feat/cl4-consumer-gate`; no push

### Back-patch tmi + truthtreason (per roadmap)
- Read each repo's ci-cd.yml at execute time
- If `verify-dev-deployed` exists with C-12 direction (is-ancestor origin/dev HEAD) — already correct, no action
- If `[hotfix-bypass-dev]` token references exist — remove them
- If older C-12 direction (reversed) — flip per platform v2.13.10 pattern
- This may already be done; verify before editing

### Base branch per consumer
- dev-portal: branch off `main` (ignore stale fix/deploy-skip-bug per Phase 29 pattern)
- darksouls: same
- tmi: same
- truthtreason: branch off `dev` (clean)
- New branch in each: `feat/cl4-consumer-gate`

### What this phase does NOT do
- Does NOT push to remotes
- Does NOT add GitHub Actions secrets (ADMIN_API_TOKEN must be set manually per repo Settings)
- Does NOT run real prod deploys
- Does NOT verify the round-trip (depends on Phase 28's v8.2 publish + Phase 27's migration applied to CRDB + each project's apiKey populated)

</decisions>
