---
phase: 15-operational-prework
plan: 04
subsystem: infra
tags: [firebase, app-hosting, gcp, dns, github]

requires:
  - phase: 15-01
    provides: "MyAlterLego/triarch-portal repo (used as codebase source for both FAH backends)"
  - phase: 15-02
    provides: "portal.triarch.dev A record (35.219.200.0) required for custom domain HOST_ACTIVE state"
  - phase: 15-03
    provides: "PORTAL_NEXTAUTH_SECRET with secretAccessor grant to firebase-app-hosting-compute SA"

provides:
  - "Firebase App Hosting backend portal-prod in triarch-dev-website (us-central1, live branch=main)"
  - "Firebase App Hosting backend portal-dev in triarch-dev-website (us-central1, live branch=dev)"
  - "portal.triarch.dev custom domain attached to portal-prod (HOST_ACTIVE, CERT_ACTIVE, OWNERSHIP pending TXT propagation)"
  - "dev branch on MyAlterLego/triarch-portal repo"
  - "MyAlterLego-triarch-portal gitRepositoryLink in apphosting-github-conn-kh7m03f connection"

affects: [phase-16, phase-18, phase-19, phase-24, phase-25]

tech-stack:
  added: []
  patterns:
    - "FAH backends created via REST API (firebaseapphosting.googleapis.com/v1beta) using gcloud access token, bypassing firebase CLI which had expired OAuth credentials"
    - "Live branch configured via PATCH to /backends/{id}/traffic with rolloutPolicy.codebaseBranch"
    - "Custom domain attached via POST to /backends/{id}/domains — requires TXT record fah-claim= for OWNERSHIP_ACTIVE"

key-files:
  created: []
  modified: []

key-decisions:
  - "firebase CLI auth was expired (login:list showed logged-in but apphosting:backends:list returned 401); used gcloud auth print-access-token + direct REST API calls as fallback — same Owner-level permissions, equivalent result"
  - "gitRepositoryLink MyAlterLego-triarch-portal created in existing connection apphosting-github-conn-kh7m03f via Developer Connect API (connection already authorized for MyAlterLego org from admin backends)"
  - "dev branch created on triarch-portal via GitHub API (only main existed post Plan 15-01); SHA cf96e361 from main"
  - "portal.triarch.dev TXT record fah-claim=002-02-057e97c9-6ea2-4adc-9d15-d1cd6e444b19 added to GoDaddy to complete OWNERSHIP_ACTIVE validation — DNS propagation 5-30 min"
  - "A record (35.219.200.0) for portal.triarch.dev already correct from Plan 15-02 placeholder; no DNS update needed for HOST_ACTIVE — FAH confirmed HOST_ACTIVE on creation"
  - "CERT_ACTIVE immediately on domain attach — cert was already provisioned (shared infra from prior triarch.dev domain operations)"

patterns-established:
  - "REST API fallback: when firebase CLI auth expires, gcloud print-access-token provides equivalent access to all FAH REST endpoints"
  - "Traffic/live-branch separation: FAH backend creation does not set live branch; must PATCH /traffic with rolloutPolicy.codebaseBranch separately"

requirements-completed: [OPS-02]

duration: 4min
completed: 2026-05-08
---

# Phase 15 Plan 04: Portal FAH Backends Summary

**Two FAH backends (portal-prod + portal-dev) created in triarch-dev-website via gcloud REST API fallback; portal.triarch.dev domain attached to portal-prod (HOST_ACTIVE + CERT_ACTIVE, ownership TXT added to GoDaddy — propagation pending).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-08T15:31:19Z
- **Completed:** 2026-05-08T15:36:03Z
- **Tasks:** 2 of 3 (Task 3 is human-verify checkpoint awaiting Mike confirmation)
- **Files modified:** 0 (pure infrastructure)

## Accomplishments

- Created `portal-prod` FAH backend: `portal-prod--triarch-dev-website.us-central1.hosted.app`, live branch=`main`, environment=prod
- Created `portal-dev` FAH backend: `portal-dev--triarch-dev-website.us-central1.hosted.app`, live branch=`dev`, environment=dev
- Both backends connected to `MyAlterLego/triarch-portal` via reused `apphosting-github-conn-kh7m03f` connection (no new GitHub App install required — org already authorized)
- Attached `portal.triarch.dev` custom domain to `portal-prod`: HOST_ACTIVE (A record correct from Plan 15-02), CERT_ACTIVE (cert pre-provisioned), OWNERSHIP pending FAH TXT validation
- Added GoDaddy TXT record `fah-claim=002-02-057e97c9-6ea2-4adc-9d15-d1cd6e444b19` to `portal.triarch.dev` to complete ownership verification
- Created `dev` branch on `triarch-portal` repo (SHA cf96e361 from main) — required for portal-dev backend's live-branch reference

## Task Commits

No code commits (infrastructure-only plan). All work performed via API calls.

## Files Created/Modified

None — all deliverables are GCP/Firebase/GitHub/DNS infrastructure resources.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Firebase CLI auth expired; used gcloud REST API fallback**
- **Found during:** Task 1
- **Issue:** `firebase apphosting:backends:list` returned "Your credentials are no longer valid" despite `firebase login:list` showing `mike@triarchsecurity.com` as active. OAuth token was stale.
- **Fix:** Used `gcloud auth print-access-token` (gcloud authed as Owner) + direct `firebaseapphosting.googleapis.com/v1beta` REST API calls for all FAH operations. Equivalent permissions, same result.
- **Files modified:** none

**2. [Rule 2 - Missing Critical Functionality] gitRepositoryLink for triarch-portal not in connection**
- **Found during:** Task 2
- **Issue:** The `apphosting-github-conn-kh7m03f` connection only had links for `triarch-dev` and `darksouls-rpg`. Creating an FAH backend requires a gitRepositoryLink.
- **Fix:** Created `MyAlterLego-triarch-portal` gitRepositoryLink via Developer Connect API (`POST /v1/projects/.../connections/apphosting-github-conn-kh7m03f/gitRepositoryLinks`). No new GitHub App install needed — MyAlterLego org was already authorized.
- **Files modified:** none

**3. [Rule 2 - Missing Critical Functionality] gcloud beta firebase apphosting subcommand not available**
- **Found during:** Task 1
- **Issue:** `gcloud beta firebase apphosting` returns "Invalid choice: 'apphosting'" — the gcloud CLI alternative mentioned in the plan does not exist in this gcloud version.
- **Fix:** Used direct REST API (see deviation 1). gcloud REST API path worked cleanly.
- **Files modified:** none

**4. [Rule 3 - Blocking Issue] Live branch not set during backend creation**
- **Found during:** Task 2
- **Issue:** The FAH `POST /backends` endpoint does not accept a live branch field — it must be set via a separate `PATCH /backends/{id}/traffic` call with `rolloutPolicy.codebaseBranch`.
- **Fix:** After each backend creation, patched the traffic resource to set `codebaseBranch: main` (portal-prod) and `codebaseBranch: dev` (portal-dev).
- **Files modified:** none

## Custom Domain Status

| Field | State | Notes |
|-------|-------|-------|
| hostState | HOST_ACTIVE | A record 35.219.200.0 from Plan 15-02 correct |
| certState | CERT_ACTIVE | Pre-provisioned from prior triarch.dev FAH operations |
| ownershipState | OWNERSHIP_MISSING → pending | TXT fah-claim= added to GoDaddy; propagation 5-30 min |

FAH will auto-advance `ownershipState` to `OWNERSHIP_ACTIVE` once the TXT record propagates. No further manual action required for domain wiring.

## CLI-Managed vs Console-Managed Backends

**Both backends were created via REST API (not firebase CLI and not Firebase Console).** This is functionally equivalent to CLI-managed backends:
- FAH labels show `deployment-tool: cli-firebase` (same as admin backends)
- Rollouts can be triggered programmatically via the same REST API (`POST /backends/{id}/rollouts`)
- Phase 24 CI/CD safety work applies equally

## Known Stubs

None — plan delivers infrastructure resources, no app code.

## Self-Check: PASSED

- portal-prod backend exists: confirmed via GET `/backends/portal-prod` returning HTTP 200 with name, uri, serviceAccount fields
- portal-dev backend exists: confirmed via GET `/backends/portal-dev` returning HTTP 200 with name, uri, serviceAccount fields
- portal-prod live branch=main: confirmed via GET `/backends/portal-prod/traffic` returning `rolloutPolicy.codebaseBranch=main`
- portal-dev live branch=dev: confirmed via GET `/backends/portal-dev/traffic` returning `rolloutPolicy.codebaseBranch=dev`
- portal.triarch.dev attached: confirmed via GET `/backends/portal-prod/domains/portal.triarch.dev` returning HOST_ACTIVE, CERT_ACTIVE
- dev branch on triarch-portal: confirmed via `gh api repos/MyAlterLego/triarch-portal/branches` returning `dev` and `main`
- TXT record added: confirmed via GoDaddy API GET returning `fah-claim=002-02-057e97c9-6ea2-4adc-9d15-d1cd6e444b19`
