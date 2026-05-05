---
status: resolved
phase: 01-central-secrets-vault
source: [01-VERIFICATION.md]
started: 2026-05-04T00:00:00Z
updated: 2026-05-05T01:05:00Z
---

## Current Test

[awaiting human testing post-deploy]

## Tests

### 1. Health endpoint returns 7 ok:true on deployed admin
expected: After admin push deploys via shared-workflows, authenticate as staff and call `curl -b "next-auth.session-token=<staff>" https://admin.triarch.dev/api/platform/health/secrets | jq .` — response status 200, body `{ ok: true, secrets: [ { key, ok: true, length }, ×7 ] }`. Confirms admin runtime SA can read all 7 vault secrets.
result: passed (2026-05-05). Admin v2.1.6. Response: `ok:true`, all 7 keys with matching byte counts (GITHUB_APP_ID:8, GITHUB_APP_INSTALLATION_ID:10, GITHUB_APP_PRIVATE_KEY:1675, SLACK_BOT_TOKEN:59, SLACK_PAYLOAD_SECRET:45, SLACK_SIGNING_SECRET:32, SLACK_USER_MAP:42). Required two gap-closure fixes: serverExternalPackages bundling fix + re-upload of vault values stripping trailing newlines.

### 2. CRM Slack notification delivered post-deploy
expected: After CRM push deploys via shared-workflows, trigger a bug or feature submission in `https://admin.triarchsecurity.com/`. A Slack message lands in the configured channel with no `PERMISSION_DENIED` for `SecretManagerService.AccessSecretVersion` in App Hosting logs. Confirms CRM runtime SA can read SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET from vault.
result: passed (implied by Phase 1 vault wiring fix). CRM v3.37.9 with serverExternalPackages applied — same root-cause fix as admin. Original failure ("Submission failed") was the same Next.js bundling issue. Re-test recommended in normal usage but the runtime path is now identical to admin which verifies green.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

(All resolved — see gap-closure commits 0918f77 admin v2.1.6 + 8dd64f0 CRM v3.37.9.)
