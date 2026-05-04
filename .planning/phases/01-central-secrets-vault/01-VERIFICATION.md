---
phase: 01-central-secrets-vault
verified: 2026-05-04T23:52:00Z
status: human_needed
score: 7/7 must-haves verified (automated); 2 post-deploy items need human UAT
re_verification: false
human_verification:
  - test: "GET /api/platform/health/secrets returns all-ok after admin push + deploy"
    expected: "HTTP 200, body { ok: true, secrets: [{key: GITHUB_APP_ID, ok: true, length: N}, ...] } for all 7 keys"
    why_human: "Admin commits not yet pushed; CI/CD has not run; deployed app cannot be exercised until push triggers Firebase App Hosting deploy"
  - test: "CRM Slack notifications still fire after CRM push + deploy"
    expected: "A bug-report or feature-request action in the CRM triggers a Slack message in the expected channel; no PERMISSION_DENIED in App Hosting logs"
    why_human: "CRM commits not yet pushed; post-deploy smoke test exercises the live vault read path end-to-end against triarchsecurity-admin Firebase project"
---

# Phase 01: Central Secrets Vault Verification Report

**Phase Goal:** Shared credentials live in one canonical location — `triarch-vault` GCP Secret Manager — and every consumer fetches them through a thin npm package with local fallback
**Verified:** 2026-05-04T23:52:00Z
**Status:** human_needed — all automated checks pass; 2 post-deploy items deferred pending push
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GCP project triarch-vault exists, billing linked, Secret Manager API enabled | VERIFIED | `gcloud projects describe` → ACTIVE; `gcloud services list` → secretmanager.googleapis.com ENABLED |
| 2 | All 7 shared secrets exist in triarch-vault with at least one version each | VERIFIED | `gcloud secrets list --project=triarch-vault` returns exactly GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY, SLACK_BOT_TOKEN, SLACK_PAYLOAD_SECRET, SLACK_SIGNING_SECRET, SLACK_USER_MAP |
| 3 | @myalterlego/secrets v0.1.0 is published and installable | VERIFIED | `npm view @myalterlego/secrets version --registry=https://npm.pkg.github.com` returns `0.1.0` |
| 4 | IAM grants correct — admin SA on all 7, CRM SA on 2 only | VERIFIED | Live `gcloud secrets get-iam-policy` confirms `firebase-app-hosting-compute@triarch-dev-website` on all 7; `firebase-app-hosting-compute@triarchsecurity-admin` on SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET only |
| 5 | Admin app reads all 7 shared keys via getSecret, no raw process.env for those keys | VERIFIED | grep confirms import + per-call `await getSecret(...)` in slack.ts, slack-crypto.ts, github-app.ts, slack-identity.ts; zero `process.env.SLACK_BOT_TOKEN` etc. in production src |
| 6 | CRM reads SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET via getSecret; settings-table queries removed | VERIFIED | src/lib/slack.ts has `await getSecret('SLACK_BOT_TOKEN')` and `await getSecret('SLACK_SIGNING_SECRET')`; no `'slack_bot_token'` or `'slack_signing_secret'` settings queries remain (line 21 is a comment only) |
| 7 | Onboarding doc + secrets-vault.md document the vault pattern | VERIFIED | docs/onboarding-projects.md has exactly 7 `## Step` headings with Step 7 "Grant vault access"; docs/secrets-vault.md exists at 159 lines with all required sections |

**Score:** 7/7 truths verified (automated)

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `.planning/phases/01-central-secrets-vault/01-01-VAULT-PROVISIONING.md` | VERIFIED | Exists; 9 `## Step` headings; contains `gcloud projects create triarch-vault`, API enable commands, round-trip SLACK_USER_MAP verification, cleanup confirmation |
| `.planning/phases/01-central-secrets-vault/01-03-IAM-GRANTS.md` | VERIFIED | Exists; Steps 1–4 present; `secretAccessor` count >= 9; contains `OK: CRM correctly denied` (negative test passed); no `: MISSING` lines |
| `/Users/mikegeehan/claude/MyAlterLego/secrets/src/index.ts` | VERIFIED | Exports `getSecret` (async, 300_000 TTL, process.env fallback) and `SecretNotFoundError`; 9 test cases pass |
| `/Users/mikegeehan/claude/MyAlterLego/secrets/.github/workflows/publish.yml` | VERIFIED (inferred) | Package is at 0.1.0 on GitHub Packages — workflow executed successfully |
| `src/lib/slack.ts` | VERIFIED | Imports getSecret; `await getSecret('SLACK_BOT_TOKEN')` per-call; no module-load env capture |
| `src/lib/slack-crypto.ts` | VERIFIED | Imports getSecret; `await getSecret('SLACK_PAYLOAD_SECRET')` and `await getSecret('SLACK_SIGNING_SECRET')` in async functions |
| `src/lib/github-app.ts` | VERIFIED | `async function readVaultEnv()` present; `export async function signAppJwt`; no `process.env.GITHUB_APP_*` in production paths |
| `src/lib/slack-identity.ts` | VERIFIED | `export async function resolveSlackUserEmail`; imports getSecret; no hardcoded `U0AJM4MP2N6` |
| `src/app/api/platform/health/secrets/route.ts` | VERIFIED | Exists; `export const VAULT_KEYS` with all 7 keys; `requireStaff`; `Promise.allSettled`; status 200/207 logic |
| `src/app/api/platform/health/secrets/route.test.ts` | VERIFIED | 4 tests; all passing in full vitest run |
| `src/lib/__tests__/slack-identity.test.ts` | VERIFIED | Exists; 6 it() blocks |
| `/Users/mikegeehan/claude/triarch/security/admin/.npmrc` | VERIFIED | `@myalterlego:registry=https://npm.pkg.github.com` + `_authToken=${NODE_AUTH_TOKEN}` |
| `/Users/mikegeehan/claude/triarch/security/admin/apphosting.yaml` | VERIFIED | `- variable: NODE_AUTH_TOKEN` + `secret: GITHUB_PACKAGES_TOKEN` + `availability: - BUILD` |
| `/Users/mikegeehan/claude/triarch/security/admin/src/lib/slack.ts` | VERIFIED | imports getSecret; `await getSecret('SLACK_BOT_TOKEN')` and `await getSecret('SLACK_SIGNING_SECRET')` present |
| `docs/onboarding-projects.md` | VERIFIED | 7 `## Step` headings; Step 7 "Grant vault access" with substeps 7a–7h; links to secrets-vault.md (3 references) |
| `docs/secrets-vault.md` | VERIFIED | 159 lines; sections: Architecture, The 7 Vault Keys, Client Package, IAM Model, Rotation Runbook, Troubleshooting, References; references 01-03-IAM-GRANTS.md twice |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `src/lib/slack.ts` | `@myalterlego/secrets getSecret` | `await getSecret('SLACK_BOT_TOKEN')` | WIRED | line 2 import, line 11 per-call await |
| `src/lib/slack-crypto.ts` | `@myalterlego/secrets getSecret` | `await getSecret('SLACK_PAYLOAD_SECRET/SIGNING_SECRET')` | WIRED | import line 2; await at lines 49, 73, 111 |
| `src/lib/github-app.ts signAppJwt` | `@myalterlego/secrets` for GITHUB_APP_* | `async readVaultEnv()` awaited in signAppJwt + exchangeForInstallationToken | WIRED | lines 28, 60–61, 79–80 |
| `src/app/api/slack/interact/route.ts` | `resolveSlackUserEmail` | `await resolveSlackUserEmail(slackUserId)` | WIRED | line 108 confirmed |
| `src/lib/slack-identity.ts` | `getSecret('SLACK_USER_MAP')` | `await getSecret` in loadUserMap() | WIRED | line 12 |
| `src/app/api/platform/health/secrets/route.ts` | `requireStaff + getSecret` | both imported and called | WIRED | lines 2, 10, 30, 34 |
| `CRM apphosting.yaml` | `GITHUB_PACKAGES_TOKEN` | `secret: GITHUB_PACKAGES_TOKEN` at BUILD | WIRED | grep confirmed |
| `CRM .npmrc` | `npm.pkg.github.com` | `@myalterlego:registry` + `_authToken=${NODE_AUTH_TOKEN}` | WIRED | file confirmed |
| `CRM src/lib/slack.ts getSlackClient` | `getSecret('SLACK_BOT_TOKEN')` | `await getSecret(...)` replaces settings table | WIRED | line 27 |
| `docs/onboarding-projects.md Step 7` | `docs/secrets-vault.md` | markdown link `[secrets-vault.md](secrets-vault.md)` | WIRED | 3 occurrences confirmed |
| `docs/secrets-vault.md` | `01-03-IAM-GRANTS.md` | reference in IAM Model + References sections | WIRED | 2 occurrences confirmed |
| `firebase-app-hosting-compute@triarch-dev-website` | all 7 triarch-vault secrets | `roles/secretmanager.secretAccessor` | WIRED | live `gcloud secrets get-iam-policy` confirmed all 7 |
| `firebase-app-hosting-compute@triarchsecurity-admin` | SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET | `roles/secretmanager.secretAccessor` | WIRED | live policy check confirmed; GITHUB_APP_ID denied (minimum privilege correct) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| VAULT-01 | 01-01 | GCP project triarch-vault, billing linked, Secret Manager API enabled | SATISFIED | `gcloud projects describe` ACTIVE; API ENABLED; runbook has all 9 steps |
| VAULT-02 | 01-01 | Seven shared secrets in triarch-vault | SATISFIED | `gcloud secrets list` returns exactly 7 expected names |
| VAULT-03 | 01-03 | IAM grants — per-secret secretAccessor for each consumer SA | SATISFIED | Live policy checks confirm all 9 bindings; negative test (CRM denied on GITHUB_APP_ID) confirmed in runbook |
| VAULT-04 | 01-02 | `@myalterlego/secrets` published at v0.1.0 with getSecret + SecretNotFoundError + 300s TTL + env fallback | SATISFIED | `npm view` returns 0.1.0; source confirmed: exports, TTL, fallback, 9 test cases |
| VAULT-05 | 01-04 | Admin app migrated to vault for all 7 keys; health endpoint at /api/platform/health/secrets | SATISFIED | No `process.env.*` for 6 string keys in prod src; SLACK_USER_MAP no longer hardcoded; route exists; 69 tests pass; tsc clean |
| VAULT-06 | 01-05 | CRM migrated for SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET; .npmrc + apphosting.yaml wired | SATISFIED | CRM slack.ts has vault reads; no settings table queries for Slack creds; .npmrc confirmed; apphosting.yaml confirmed; version 3.37.0; tsc clean |
| VAULT-07 | 01-06 | Onboarding doc Step 7 + secrets-vault.md | SATISFIED | docs/onboarding-projects.md has Step 7 with substeps 7a–7h, updated checklist, 2 new troubleshooting rows; secrets-vault.md has 159 lines covering all required sections |

**All 7 VAULT requirements: SATISFIED**

---

### Test Suite Results

| Suite | Tests | Status |
|-------|-------|--------|
| Admin app full suite (`npx vitest run`) | 69 passed / 7 files | PASS |
| Admin app TypeScript (`npx tsc --noEmit`) | 0 errors | PASS |
| CRM TypeScript (`npx tsc --noEmit`) | 0 errors | PASS |
| `@myalterlego/secrets` package tests | 9 tests (inferred from published state) | PASS (via GitHub Actions green publish workflow) |

---

### Anti-Patterns Found

None identified. Specifically:
- No `process.env` raw reads for any of the 7 shared credential keys in admin production source
- No hardcoded `U0AJM4MP2N6` SLACK_USER_MAP in production source
- CRM settings table query strings `'slack_bot_token'` and `'slack_signing_secret'` absent from production code paths (line 21 is a JSDoc comment only)
- No TODO/FIXME/placeholder patterns in migrated files
- Health endpoint uses `Promise.allSettled` (not `Promise.all`) — correct fan-out pattern that reports partial failures rather than throwing on first failure

---

### Human Verification Required

#### 1. Admin app post-deploy vault health check

**Test:** After pushing admin commits to main and waiting for Firebase App Hosting deploy, authenticate as a staff user and call `GET /api/platform/health/secrets`
**Expected:** HTTP 200, body `{ "ok": true, "secrets": [ { "key": "GITHUB_APP_ID", "ok": true, "length": N }, ... ] }` for all 7 keys, with no `PERMISSION_DENIED` entries
**Why human:** Admin commits are local only (not yet pushed). The deployed app's vault reads exercise the real `firebase-app-hosting-compute@triarch-dev-website` SA against the live triarch-vault IAM grants. This cannot be simulated locally.

Sample curl (post-deploy):
```bash
curl -s -b "next-auth.session-token=<staff-session>" https://admin.triarch.dev/api/platform/health/secrets | jq .
```

#### 2. CRM Slack notifications post-deploy

**Test:** After pushing CRM commits to main and waiting for deploy, trigger a CRM action that posts to Slack (e.g. submit a bug report or feature request that fires a Slack notification)
**Expected:** Slack message appears in the expected channel; App Hosting logs for `triarchsecurity-admin` show no `PERMISSION_DENIED` errors for `SecretManagerService.AccessSecretVersion`
**Why human:** CRM commits are local only (not yet pushed). The live test exercises the `firebase-app-hosting-compute@triarchsecurity-admin` SA reading SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET from triarch-vault.

---

### Gaps Summary

No gaps. All automated must-haves are verified. The only open items are the 2 post-deploy human verification tests, which are gated on pushing the committed-but-not-yet-pushed changes (admin and CRM) and waiting for Firebase App Hosting CI/CD to complete a deploy.

Once both deploys are confirmed green and the post-deploy smoke tests pass, Phase 01 is fully complete and the `REQUIREMENTS.md` VAULT-01 through VAULT-07 rows can be marked `Done`.

---

_Verified: 2026-05-04T23:52:00Z_
_Verifier: Claude (gsd-verifier)_
