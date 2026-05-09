---
phase: 15-operational-prework
verified: 2026-05-08T00:00:00Z
status: human_needed
score: 4/5 must-haves verified
human_verification:
  - test: "Open https://console.cloud.google.com/apis/credentials?project=triarch-dev-website, click 'Triarch Dev' OAuth 2.0 Client, confirm Authorized Redirect URIs contains all of: https://admin.triarch.dev/api/auth/callback/google (existing), https://portal.triarch.dev/api/auth/callback/google (new), http://localhost:3002/api/auth/callback/google (new). Optionally sign in to https://admin.triarch.dev in incognito to confirm admin auth regressed."
    expected: "All three URIs present; admin sign-in still works; no existing URIs removed"
    why_human: "GCP's clientauthconfig.googleapis.com OAuth 2.0 Client redirect URI list is not readable or writable via gcloud CLI for legacy OAuth 2.0 clients. gcloud iam oauth-clients list returns empty for Triarch Dev. Console is the only management surface. Confirmed as GCP limitation in 15-05-SUMMARY.md."
---

# Phase 15: Operational Prework Verification Report

**Phase Goal:** Repository, DNS, OAuth, and FAH backend prerequisites exist so the deploy pipeline is provable on a skeleton before any app code lands.
**Verified:** 2026-05-08
**Status:** human_needed — 4 of 5 OPS requirements verified by CLI; OPS-04 (OAuth redirect URIs) is pending Mike's manual Console action, which is a known deferred human action, not a code gap.
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Repository `MyAlterLego/triarch-portal` exists, is private, on main | VERIFIED | `gh repo view` → `triarch-portal PRIVATE default=main` |
| 2 | Local clone at `~/claude/triarch/development/portal` tracking `origin/main` | VERIFIED | `git remote get-url origin` → `https://github.com/MyAlterLego/triarch-portal.git`; clean tree on `main`; `README.md` present |
| 3 | DNS `portal.triarch.dev` resolves publicly to Firebase App Hosting IP | VERIFIED | `dig +short portal.triarch.dev` → `35.219.200.0`; `admin.triarch.dev` still `35.219.200.0` (no regression) |
| 4 | GCP secret `PORTAL_NEXTAUTH_SECRET` exists in `triarch-vault` with ENABLED version and secretAccessor IAM | VERIFIED | `gcloud secrets describe` → `projects/125442121919/secrets/PORTAL_NEXTAUTH_SECRET`; one `enabled` version; binding: `roles/secretmanager.secretAccessor` → `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` |
| 5 | FAH backends `portal-prod` and `portal-dev` exist in `triarch-dev-website`; `portal-prod` has `portal.triarch.dev` custom domain | VERIFIED | REST API confirms both backends; `portal-prod` live branch=`main`; `portal-dev` live branch=`dev`; custom domain `portal.triarch.dev` status: `HOST_ACTIVE`, `CERT_ACTIVE`, `OWNERSHIP_ACTIVE`; both `main` and `dev` branches exist on repo |
| 6 | Google OAuth client `Triarch Dev` lists portal prod + localhost:3002 redirect URIs | NEEDS HUMAN | gcloud CLI cannot list/update legacy OAuth 2.0 client redirect URIs (confirmed in 15-05-SUMMARY.md); Console action required from Mike |

**Score:** 5/6 truths machine-verifiable; 5 confirmed VERIFIED, 1 needs human. Among the 5 OPS requirements trackable by CLI, all 5 targets were confirmed present and correct.

---

## Required Artifacts

| Artifact | Requirement | Status | Details |
|----------|-------------|--------|---------|
| GitHub repo `MyAlterLego/triarch-portal` | OPS-01 | VERIFIED | Private, default branch=main, README.md seeded, MIT license |
| Local clone `~/claude/triarch/development/portal` | OPS-01 | VERIFIED | Clean tree, on main, tracking https://github.com/MyAlterLego/triarch-portal.git |
| GoDaddy A record `portal.triarch.dev` | OPS-03 | VERIFIED | Type=A, data=35.219.200.0, TTL=600; resolves immediately via dig |
| GCP secret `PORTAL_NEXTAUTH_SECRET` | OPS-05 | VERIFIED | In `triarch-vault` (project 125442121919), one ENABLED version, 32-byte random base64 payload |
| IAM binding on `PORTAL_NEXTAUTH_SECRET` | OPS-05 | VERIFIED | `roles/secretmanager.secretAccessor` granted to `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` — mirrors admin's `NEXTAUTH_SECRET` pattern exactly |
| FAH backend `portal-prod` | OPS-02 | VERIFIED | Exists in `triarch-dev-website/us-central1`, live branch=main, connected to `MyAlterLego/triarch-portal` |
| FAH backend `portal-dev` | OPS-02 | VERIFIED | Exists in `triarch-dev-website/us-central1`, live branch=dev, connected to `MyAlterLego/triarch-portal` |
| `portal.triarch.dev` custom domain on `portal-prod` | OPS-02 | VERIFIED | `HOST_ACTIVE`, `CERT_ACTIVE`, `OWNERSHIP_ACTIVE` — all three domain states active |
| `dev` branch on `MyAlterLego/triarch-portal` | OPS-02 | VERIFIED | `gh api repos/MyAlterLego/triarch-portal/branches` returns `main` and `dev` |
| OAuth client `Triarch Dev` portal + localhost:3002 URIs | OPS-04 | NEEDS HUMAN | gcloud CLI cannot introspect legacy OAuth 2.0 client redirect URIs; Console-only |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| GitHub repo `MyAlterLego/triarch-portal` | Phase 16 scaffolding | git clone target | WIRED | Local clone exists, clean, on main — Phase 16 can write into it immediately |
| DNS `portal.triarch.dev` | FAH `portal-prod` custom domain | A record 35.219.200.0 | WIRED | All three domain states ACTIVE (HOST_ACTIVE, CERT_ACTIVE, OWNERSHIP_ACTIVE); DNS placeholder from Plan 15-02 was correct |
| `PORTAL_NEXTAUTH_SECRET` | Phase 18 portal NextAuth config | apphosting.yaml secret binding (Phase 18) | WIRED (partial) | Secret and IAM exist; Phase 18 writes the apphosting.yaml binding — expected and by design |
| Secret accessor IAM | FAH backend runtime | GCP Secret Manager IAM | WIRED | `firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com` has `secretAccessor` on `PORTAL_NEXTAUTH_SECRET` |
| Google OAuth client redirect URIs | Phase 18 portal NextAuth signIn flow | OAuth 2.0 authorization code grant | NEEDS HUMAN | Redirect URIs cannot be verified by CLI; requires Console visual confirmation |
| `MyAlterLego/triarch-portal` (dev branch) | `portal-dev` FAH backend live branch | GitHub App connection | WIRED | `portal-dev` traffic policy: `codebaseBranch=dev`; `dev` branch exists on repo |
| `MyAlterLego/triarch-portal` (main branch) | `portal-prod` FAH backend live branch | GitHub App connection | WIRED | `portal-prod` traffic policy: `codebaseBranch=main` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OPS-01 | 15-01 | `MyAlterLego/triarch-portal` repo with private visibility, main branch, README | SATISFIED | `gh repo view` → `triarch-portal PRIVATE default=main`; local clone tracked and clean |
| OPS-02 | 15-04 | Two FAH backends `portal-prod` (custom domain `portal.triarch.dev`) and `portal-dev` | SATISFIED | Both backends confirmed via REST API; custom domain `CERT_ACTIVE`/`HOST_ACTIVE`/`OWNERSHIP_ACTIVE`; live branches set |
| OPS-03 | 15-02 | GoDaddy DNS records for `portal.triarch.dev` resolving | SATISFIED | `dig +short portal.triarch.dev` → `35.219.200.0`; no regression on `admin.triarch.dev` |
| OPS-04 | 15-05 | Google OAuth client updated with portal prod + localhost:3002 redirect URIs | PENDING HUMAN | gcloud CLI cannot read/write legacy OAuth 2.0 client redirect URIs; Console action required |
| OPS-05 | 15-03 | `PORTAL_NEXTAUTH_SECRET` in `triarch-vault` with secretAccessor for FAH runtime SAs | SATISFIED | Secret exists (ENABLED version), IAM binding confirmed via `gcloud secrets get-iam-policy` |

**Orphaned requirements check:** REQUIREMENTS.md Traceability table maps OPS-01..OPS-05 exclusively to Phase 15. All five are accounted for across plans 15-01 through 15-05. No orphaned requirements for this phase.

**OPS-01 scope note:** The plan-level success_criteria in 15-01-PLAN.md explicitly defers the ci-cd.yml workflow file to Phase 16 (Phase 15 produces only the repo container). The requirement text in REQUIREMENTS.md says "admin-equivalent CI/CD scaffolding" — the scaffolding file lands in Phase 16. Phase 15's share of OPS-01 (repo container) is satisfied; Phase 16 closes it fully.

---

## Anti-Patterns Found

None. This phase produced only infrastructure resources (GitHub repo, DNS record, GCP secret, IAM bindings, FAH backends). No source files were created or modified. No stub patterns applicable.

---

## Human Verification Required

### 1. OPS-04: Google OAuth Redirect URI Confirmation

**Test:** Open https://console.cloud.google.com/apis/credentials?project=triarch-dev-website. Under "OAuth 2.0 Client IDs", click the row named **Triarch Dev** (Client ID: `276081117950-bgkkp6gcf8feovodg08cn2gu71636tnt.apps.googleusercontent.com`). In "Authorized redirect URIs", confirm all of the following are present:
- `https://admin.triarch.dev/api/auth/callback/google` (existing — must not be removed)
- `https://portal.triarch.dev/api/auth/callback/google` (new — added in Plan 15-05)
- `http://localhost:3002/api/auth/callback/google` (new — Pitfall 13 localhost-from-start)

If one or both new URIs are missing, follow the steps in 15-05-SUMMARY.md to add them via Console (+ADD URI, SAVE).

**Expected:** All three URIs present in the list; green save confirmation. Optionally: sign into https://admin.triarch.dev in incognito to verify admin auth regression did not occur.

**Why human:** GCP does not expose legacy OAuth 2.0 Client redirect URI management via gcloud CLI. `gcloud iam oauth-clients list --project=triarch-dev-website` returns empty for the Triarch Dev client because it is a legacy OAuth 2.0 Client ID, not a newer IAM OAuth client. The `clientauthconfig.googleapis.com` API used by Console has no publicly documented gcloud surface. This is a confirmed GCP CLI limitation, not a tooling regression.

---

## Gaps Summary

No code gaps exist. All CLI-verifiable infrastructure resources are confirmed present and correctly configured. The single outstanding item (OPS-04) is a deferred human action that requires Mike to make a 30-second Console edit. It is not blocking Phases 16 or 17 (per 15-05-SUMMARY.md: OPS-04 is first consumed by Phase 18, not Phase 16 or 17). Phase 15 is in `complete-with-deferred-item` state.

---

_Verified: 2026-05-08_
_Verifier: Claude (gsd-verifier)_
