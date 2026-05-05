---
phase: 02-shared-workflows-hardening
verified: 2026-05-05T03:11:05Z
status: human_needed
score: 7/8 must-haves verified
human_verification:
  - test: "Trigger a deploy with git_branch set to a non-main branch name (e.g., feat/test-preview)"
    expected: "FAH branch rollout runs with --git-branch <branch>; deploy-firebase.yml deploy step uses the 'Deploy via App Hosting (branch preview)' step; a release_logs row appears with branch=<branch> and metadata.previewUrl populated"
    why_human: "admin and CRM both deploy main only. The branch-preview code path in deploy-firebase.yml@v2 has never been exercised E2E. Per Phase 2 CONTEXT.md and 02-04-SUMMARY, this is deliberately deferred to the T+T Phase 8 pilot."
---

# Phase 2: shared-workflows Hardening Verification Report

**Phase Goal:** Every deploy in shared-workflows notifies the admin control plane — dev deploys POST to release-logs ingest, prod deploys POST to the promoted endpoint, and non-main branch deploys trigger FAH branch preview URLs
**Verified:** 2026-05-05T03:11:05Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Dev deploy creates release_logs row (env=dev, version, commitSha, deployedAt) | VERIFIED | Admin run 25355271744: "Admin dev callback succeeded (HTTP 201). release_logs row created for main v2.2.2." CRM run 25355359662: same line for vv3.36.1. CRDB rows confirmed in 02-03 + 02-04 SUMMARYs. |
| 2 | Prod deploy transitions row to env=prod via /api/releases/promoted | VERIFIED | Idempotency curl in Plan 02-04: first POST returned HTTP 201 (new prod row); second identical POST returned HTTP 200 (idempotent). Dev row status flipped dev→promoted. Prod row inserted. |
| 3 | Non-main branch deploy uses FAH branch rollout + sends previewUrl | PARTIAL | Code verified: deploy-firebase.yml@v2 has two mutually exclusive deploy steps (main + branch preview), tr '/' '-' sanitization, previewUrl in metadata JSONB. Live E2E never exercised — deferred to Phase 8. |
| 4 | shared-workflows v2 tagged; v1 unchanged | VERIFIED | Live: `gh api /repos/MyAlterLego/shared-workflows/git/refs/tags/v2` returns tag object pointing to commit 915cc2f. v1 commit SHA 358719455... unchanged. Annotated tag message matches plan intent. |
| 5 | Admin ci-cd.yml pinned to deploy-firebase.yml@v2 | VERIFIED | Local file: `uses: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@v2`. quality-gate.yml@v1 and notify.yml@v1 unchanged. |
| 6 | CRM ci-cd.yml pinned to deploy-firebase.yml@v2 | VERIFIED | Local file at /Users/mikegeehan/claude/triarch/security/admin/.github/workflows/ci-cd.yml: deploy-firebase.yml@v2 present. quality-gate@v1, notify@v1, flush-changelog unchanged. |
| 7 | ADMIN_API_TOKEN secrets set on both repos | VERIFIED | `gh secret list --repo MyAlterLego/triarch-dev` shows ADMIN_API_TOKEN 2026-05-05T02:20:28Z. `gh secret list --repo MyAlterLego/triarchsecurity-admin` shows ADMIN_API_TOKEN 2026-05-05T02:54:44Z. |
| 8 | Non-main branch E2E live test (WORKFLOW-03 live validation) | HUMAN NEEDED | Branch preview code path never triggered in any CI run. All deploys to date use default git_branch=main. |

**Score:** 7/8 truths verified (Truth 3 is partial — code present, live path unexercised; Truth 8 is the corresponding human item)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `MyAlterLego/shared-workflows#v2 (remote tag)` | v2 tag on merge commit with both workflow files | VERIFIED | Annotated tag b2c2e550 object → commit 915cc2f. `deploy-firebase.yml` (7839 bytes) and `deploy-prod.yml` accessible at ref v2. |
| `shared-workflows deploy-firebase.yml@v2` | git_branch input + admin dev callback + branch-aware rollout steps | VERIFIED | All 8 feature checks pass: git_branch, admin_callback_url, ADMIN_API_TOKEN, "Notify admin (dev deploy)", empty-token guard, tr '/' '-', callback URL, continue-on-error. Two mutually exclusive deploy steps confirmed. |
| `shared-workflows deploy-prod.yml@v2` | workflow_call + snake_case prod callback + empty-token guard | VERIFIED | All checks pass: workflow_call, ADMIN_API_TOKEN, commit_sha, deployed_at, deployed_by, /api/releases/promoted, empty-token guard, continue-on-error. No camelCase leak (commitSha absent). |
| `.github/workflows/ci-cd.yml` (admin) | deploy-firebase.yml@v2; quality-gate@v1, notify@v1 unchanged | VERIFIED | Exact match. secrets: inherit passes ADMIN_API_TOKEN. |
| `/Users/mikegeehan/claude/triarch/security/admin/.github/workflows/ci-cd.yml` (CRM) | deploy-firebase.yml@v2; quality-gate@v1, notify@v1, flush-changelog unchanged | VERIFIED | Exact match. |
| `docs/onboarding-projects.md` | Step 8 with ADMIN_API_TOKEN runbook + both endpoint paths | VERIFIED | Step 8 section present. Both /api/platform/ingest/release-logs and /api/releases/promoted referenced. gh secret set instructions included. Empty-token fallback documented. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| deploy-firebase.yml@v2 "Notify admin (dev deploy)" | /api/platform/ingest/release-logs | curl -X POST + Authorization: Bearer | WIRED + LIVE | Two CI runs confirmed HTTP 201 response and CRDB rows. Pattern grep: api/platform/ingest/release-logs present in file. |
| deploy-prod.yml@v2 "Notify admin (prod deploy)" | /api/releases/promoted | curl -X POST + snake_case payload | WIRED + LIVE | Idempotency curl confirmed 201/200 response. snake_case fields (commit_sha, deployed_at, deployed_by) present; no camelCase. |
| deploy-firebase.yml@v2 branch input | previewUrl construction | tr '/' '-' sanitization + FAH URL pattern | WIRED (code only, not live) | tr '/' '-' pattern confirmed in file. previewUrl in metadata JSONB confirmed. Branch-preview deploy step confirmed. Live trigger not yet run. |
| Empty ADMIN_API_TOKEN guard | ::warning:: annotation | [ -z "$ADMIN_API_TOKEN" ] check | WIRED | Pattern confirmed in both deploy-firebase.yml and deploy-prod.yml at @v2. |
| Admin push to main | release_logs row env=dev | deploy-firebase.yml@v2 → /api/platform/ingest/release-logs | WIRED + LIVE | CI run 25355271744 (v2.2.2): confirmed row. CI run 25355271744 (latest v2.2.3 docs commit): also confirmed — run shows 2026-05-05T02:58:58. |
| CRM push to main | release_logs row env=dev project=triarchsecurity-admin | deploy-firebase.yml@v2 → /api/platform/ingest/release-logs | WIRED + LIVE | CI run 25355359662: confirmed row commit_sha=de87fc9, env=dev, branch=main. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| WORKFLOW-01 | 02-01, 02-03, 02-04 | deploy-firebase.yml POSTs dev deploy completion to /api/platform/ingest/release-logs | SATISFIED | REQUIREMENTS.md [x] checked. Live CI proof on admin (v2.2.2) and CRM (v3.36.1). |
| WORKFLOW-02 | 02-02, 02-04 | deploy-prod.yml POSTs prod deploy completion to /api/releases/promoted | SATISFIED | REQUIREMENTS.md [x] checked. Idempotency curl: 201 first, 200 second. Dev→prod status flip confirmed. |
| WORKFLOW-03 | 02-01, 02-03 | deploy-firebase.yml accepts git_branch input for FAH branch rollouts | SATISFIED (code) / DEFERRED (live E2E) | REQUIREMENTS.md [x] checked. Code verified at @v2. Per CONTEXT.md D-05/D-06 and 02-04-SUMMARY, live branch path deferred to Phase 8 T+T pilot. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No stubs, placeholders, or empty implementations found in any phase-modified file. |

The `::warning::ADMIN_API_TOKEN not set` branch in both workflow files is intentional guard code, not a stub — the live paths confirm real tokens are set and the guard never fires in production runs.

### Human Verification Required

#### 1. WORKFLOW-03 Branch Preview E2E

**Test:** Trigger a CI/CD run on either admin or CRM (or shared-workflows directly) with `git_branch` input set to a non-main branch name such as `feat/test-branch-preview`.
**Expected:**
- The "Deploy via App Hosting (branch preview)" step runs (not the main-branch step)
- `firebase apphosting:rollouts:create <backend> --git-branch feat/test-branch-preview --non-interactive` executes
- The "Notify admin (dev deploy)" step fires and POSTs to /api/platform/ingest/release-logs with `branch=feat/test-branch-preview` and `metadata.previewUrl=https://feat-test-branch-preview--<backend>.us-central1.hosted.app`
- A new release_logs row appears in CRDB with `env='dev'`, `branch='feat/test-branch-preview'`, `metadata` containing `previewUrl`

**Why human:** Neither admin nor CRM passes a `git_branch` input today (both default to `main`). The branch-preview code path in deploy-firebase.yml@v2 has never been exercised in any CI run captured during Phase 2. Per Phase 2 CONTEXT.md and 02-04-SUMMARY, this is deliberately scoped to the T+T Phase 8 pilot. The code is present and wired correctly — live exercise is the only remaining gap.

**Note from CONTEXT.md:** "Success criterion 3 (non-main branch) was deliberately deferred to Phase 8 pilot per CONTEXT.md — the code ships in Phase 2 but live E2E validation is Phase 8 scope."

### Gaps Summary

No implementation gaps. All code is present, wired, and structurally correct. The single open item is a live exercise of the WORKFLOW-03 branch-preview path, which was explicitly deferred in the phase design.

The v2 tag SHA in the 02-03 SUMMARY (`915cc2f`) matches the commit referenced by the live annotated tag object (`b2c2e550` → commit `915cc2f`) — the apparent SHA mismatch between the git refs API and the summary is explained by the annotated tag indirection layer, not a discrepancy.

---

_Verified: 2026-05-05T03:11:05Z_
_Verifier: Claude (gsd-verifier)_
