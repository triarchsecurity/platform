---
plan: 15-05
phase: 15-operational-prework
status: deferred_human_action
started: 2026-05-08
updated: 2026-05-08
tasks: 1/3
commits: []
requirements_addressed: []
requirements_pending: [OPS-04]
---

# Plan 15-05 Summary

## Status: DEFERRED (Human Action Required)

Plan 15-05 is parked at Task 2 awaiting Mike's manual edit of the 'Triarch Dev' OAuth 2.0 Client in GCP Console. The gcloud CLI does NOT expose redirect-URI updates for OAuth 2.0 Client IDs — `gcloud iam oauth-clients list` returns empty for legacy OAuth 2.0 clients (it surfaces only newer IAM OAuth clients which Triarch Dev is not). The redirect-URI management API at `clientauthconfig.googleapis.com` is Console-only. This is a known GCP limitation, not a tooling regression.

## What Shipped

### Task 1 (complete): OAuth Client Discovery
- Confirmed gcloud auth: `mike@triarchsecurity.com`
- Captured client ID via Secret Manager: `276081117950-bgkkp6gcf8feovodg08cn2gu71636tnt.apps.googleusercontent.com`
- Verified gcloud programmatic update path is unavailable

### Task 2 (blocked): Add Redirect URIs
- BLOCKED on Console-only API limitation. See "Human Action Required" below.

### Task 3 (blocked): Verify URIs in Console
- Pending Task 2 completion.

## Human Action Required

Mike performs these steps in GCP Console (~30 seconds):

1. Open https://console.cloud.google.com/apis/credentials?project=triarch-dev-website
2. Under "OAuth 2.0 Client IDs", click the row named **Triarch Dev** (Client ID begins with `276081117950`)
3. Note the current "Authorized redirect URIs" list (preserve all existing entries)
4. Click "+ ADD URI" → paste exactly: `https://portal.triarch.dev/api/auth/callback/google`
5. Click "+ ADD URI" again → paste exactly: `http://localhost:3002/api/auth/callback/google`
6. Click **SAVE** at bottom; wait for green confirmation banner
7. After save, confirm all 4+ URIs are visible: 2 admin (existing) + 2 portal (new)

**Verification:** No CLI command available. Visual confirmation in Console is sufficient.

**Reply with:** "console-done" (and the full URI list if you want me to spot-check) — I'll close out Task 3, mark OPS-04 [x], and update the plan status to complete.

## Why Phase 16+ Can Proceed

OPS-04 (OAuth redirect URIs) is consumed by **Phase 18 (Portal Auth Scaffolding)**, not Phase 16 or 17. Phase 16 (Shared Package Extraction) extracts schema/helpers — no auth involvement. Phase 17 (Hostname Guard Inventory) audits admin's host checks — no auth involvement. So the autonomous build continues into Phases 16 → 17 immediately. Phase 18 is the gate that will block on OPS-04 if still pending.

## Files

- `.planning/phases/15-operational-prework/15-05-PLAN.md` (plan)
- `.planning/phases/15-operational-prework/15-05-SUMMARY.md` (this file)

## Phase 15 Status After 15-05

- 4/5 plans complete (15-01, 15-02, 15-03, 15-04)
- 4/5 OPS reqs marked [x] in REQUIREMENTS.md (OPS-01, 02, 03, 05)
- OPS-04 left [ ] with note "Pending human action — see 15-05-SUMMARY.md"
- Phase 15 marked "complete-with-deferred-item" in ROADMAP.md
