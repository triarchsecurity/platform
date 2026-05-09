---
plan: 22-05
phase: 22-release-page-port-write
subsystem: ui
tags: [vitest, rtl, write-05, mobile, ux-preservation, traceability, phase-close]
status: complete
started: 2026-05-08
updated: 2026-05-08
tasks: 2/3   # Plan Task 2 (publish shared@0.3.0 + portal pin) was already done in 22-01/22-02 — orchestrator skipped per shared@0.3.0 already on GitHub Packages and portal package.json already at ^0.3.0

# Dependency graph
requires:
  - phase: 22-release-page-port-write
    provides: "22-01 shared internal-hmac module + admin /api/internal/dispatch endpoint; 22-02 portal release-mutations + customer write routes; 22-03 portal branch preview swap + portal-owned FAH; 22-04 portal Slack + un-stubbed ReleasesClient + BranchPreviewClient handlers"
  - phase: 21-release-page-port-read
    provides: "PORTAL-04 mobile-responsive read paths + hidden sm:flex desktop-only convention; ReleasesClient + BranchPreviewClient stubs ready to wire (now wired in 22-04)"
provides:
  - "WRITE-05 explicit traceability via describe('WRITE-05: ...') blocks across 3 test files"
  - "Mobile (375px) viewport hardening for portal release page write controls"
  - "Phase 22 close-out: portal v0.3.3 → v0.3.4 patch bump"
affects: [22-verify, 23-bug-feature-customer-surface, 25-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "describe('WRITE-05: <invariant>') traceability blocks — explicit test-name-as-requirement-mapping convention so requirement coverage is grep-able from test output"
    - "Mobile viewport stub via Object.defineProperty(window, 'innerWidth') + window.matchMedia mock; jsdom does not apply CSS media queries so Tailwind class probing (closest('div.hidden.sm\\:flex')) is the assertion mechanism rather than visual rendering"
    - "Cross-section disable propagation test: render 3 sibling BranchPreviewButton instances + assert disabled state propagates from the SWR cache to all mounts simultaneously"
    - "SWR singleton-by-cache-key dedupe assertion: capture useSWR cache key from each mount + assert all calls share the same key (proving one network poll across N mounts)"

key-files:
  created:
    - "portal/src/app/projects/[slug]/releases/MobileApproveSpec.test.tsx (NEW — M-1 + M-2 mobile viewport tests)"
  modified:
    - "portal/src/app/projects/[slug]/releases/ReleasesClient.test.tsx (+ describe('WRITE-05: UX preservation') with W5-1, W5-2)"
    - "portal/src/app/projects/[slug]/releases/BranchPreviewClient.test.tsx (+ describe('WRITE-05: lock propagation') with W5-3, W5-4, W5-5)"
    - "portal/package.json (v0.3.3 → v0.3.4)"
    - "portal/package-lock.json (synced)"
    - ".planning/STATE.md (Phase 22 marked complete; completed_phases 13→14, completed_plans 52→53; 22-05 decisions added; session info updated)"
    - ".planning/ROADMAP.md (Phase 22 status row + 22-05 plan checkbox marked complete)"

key-decisions:
  - "Plan Task 2 (tag shared/v0.3.0 + portal pin update) skipped — work already landed in 22-01 (shared package version bumped to 0.3.0 + tag pushed during 22-01 wrap-up) and 22-02 (portal package.json pinned ^0.3.0 during the [Rule 3 - Blocking] dep refresh — verified in 22-02-SUMMARY deviation). Orchestrator confirmed npm view returns 0.3.0 metadata + portal lockfile resolves to npm.pkg.github.com."
  - "Plan Task 3 version bump revised from 0.4.0 minor → 0.3.4 patch — orchestrator override since 22-05 changes only test files (no app code, no API surface). Phase 22's customer-write surface MAJOR change is reflected by the cumulative 0.3.0 → 0.3.4 progression across 22-01..22-05; the v0.4.0 jump deferred until a more substantial customer-facing change (likely Phase 23 bug/feature surface)."
  - "WRITE-05 traceability via test-name convention: explicit describe('WRITE-05: <invariant>') blocks let `npx vitest run | grep WRITE-05` enumerate coverage. 5 dedicated cases (W5-1..W5-5) + 2 mobile cases (M-1, M-2) = 7 net-new WRITE-05 traceable cases."
  - "Mobile assertion via DOM probing rather than visual rendering: jsdom does not apply Tailwind media-query CSS, so we assert `approveBtn.closest('div.hidden.sm\\:flex')` is non-null and the mobile-hint `<div class='sm:hidden'>` is in the DOM. This proves the structural intent — `hidden` + `sm:flex` is the established portal pattern (Phase 21-06)."
  - "Modal label phrasing accepted as-is from portal source: aria-label='Confirm promotion of {branch} {version}' (W5-1 regex matches `/confirm promotion of main v0\\.15\\.0-rc\\.1/i`) + visible 'Click to confirm — promote {branch} {version} (Ns)'. Plan suggested 'Promote X to production' phrasing matching admin; portal's actual phrasing is customer-friendlier and equally satisfies WRITE-05 (two-step + branch+version visible in label)."
  - "Conflict helper text rendered in BOTH BranchSection action cell AND ExpandedPanel preserved (deviation #2 from 22-04). W5-2 uses getAllByText(...).length >= 1 to accommodate this."

patterns-established:
  - "Phase-close hardening pattern: explicit describe('REQ-ID: ...') traceability + version patch-bump + STATE/ROADMAP/REQUIREMENTS updates + open-PR-don't-merge — applied to Phase 22, candidate for future phases"
  - "DOM-probing for Tailwind responsive intent: closest('div.hidden.sm\\:flex') and querySelector('div.sm\\:hidden') accurately reflect Tailwind class emission even when jsdom skips CSS — sufficient for asserting layout intent in unit tests"

requirements-completed: [WRITE-05]

# Metrics
duration: ~10min
completed: 2026-05-08T23:58:31Z
---

# Phase 22 Plan 05: WRITE-05 Hardening + Phase Close-Out Summary

**Test-only patch bump (portal 0.3.3 → 0.3.4) hardening WRITE-05 with explicit `describe('WRITE-05')` traceability blocks across three test files plus a new mobile viewport spec. Phase 22 is structurally complete — pending verifier and audit.**

## Performance

- **Duration:** ~10 minutes wall clock
- **Started:** 2026-05-08T23:53:42Z
- **Completed:** 2026-05-08T23:58:31Z
- **Tasks:** 2 of 3 (Plan Task 2 was no-op — see Decisions)
- **Files created:** 1 (MobileApproveSpec.test.tsx)
- **Files modified:** 4 (2 test files + package.json + package-lock.json) + 2 admin docs (STATE.md + ROADMAP.md)
- **New tests:** 7 (2 in ReleasesClient + 3 in BranchPreviewClient + 2 in MobileApproveSpec)
- **Total portal vitest:** **167 GREEN / 1 skipped** (was 160; +7 new — exceeded plan target of ≥ 6)

## WRITE-05 Test Traceability Map

| Invariant | Test ID | File | Mechanism |
|---|---|---|---|
| Two-step approve UX | W5-1 | ReleasesClient.test.tsx | Step-1 click → fetchSpy NOT called; confirm button rendered with branch+version label; confirm click → exactly one POST to `/api/projects/.../releases/.../approve` |
| Conflict badge propagation | W5-2 | ReleasesClient.test.tsx | Render with `conflictsByBranch={'feat/x': conflict}`; expand row; assert Approve button NOT in document; assert helper text "Resolve conflict to enable approval" rendered (>= 1 instance — both BranchSection cell AND ExpandedPanel) |
| Branch lock site-wide disable | W5-3 | BranchPreviewClient.test.tsx | Render 3 sibling BranchPreviewButton instances with SWR data state=BUILDING for a fourth branch; assert all 3 buttons disabled |
| Branch lock terminal re-enable | W5-4 | BranchPreviewClient.test.tsx | Render 2 BranchPreviewButton instances with SWR data state=SUCCEEDED; assert both buttons re-enabled |
| SWR singleton dedupe | W5-5 | BranchPreviewClient.test.tsx | Render Banner + 2 Buttons; assert useSWR called 3x with the SAME cache key (`/api/projects/truth-treason/branch/preview/status`) — proving one network poll across N mounts |
| Mobile viewport — release list | M-1 | MobileApproveSpec.test.tsx | Stub innerWidth=375 + matchMedia `(min-width: 640px)`→matches:false; assert release version text in document; assert Approve button's closest ancestor uses `hidden sm:flex` Tailwind classes; assert mobile hint `<div class="sm:hidden">View on desktop to approve / reject</div>` in DOM |
| Mobile viewport — conflict helper | M-2 | MobileApproveSpec.test.tsx | Stub mobile env; render with conflict; expand row; assert helper text NOT inside `hidden sm:flex` wrapper (visible on mobile so customers see conflict guidance regardless of viewport) |

## Modal Label Phrasing (locked from portal source)

Plan suggested matching admin's "Promote X to production" phrasing; portal's actual phrasing is **different** but equally satisfies WRITE-05:

| Element | Portal phrasing |
|---|---|
| Step-1 button | `Approve for Production` (with CheckCircle icon) |
| Confirm button aria-label | `Confirm promotion of {branch} {version}` |
| Confirm button visible text | `Click to confirm — promote {branch} {version} (Ns)` (with countdown) |
| Confirm button title | `Click to confirm — promote {branch} {version}` |

Test W5-1 matches against `/confirm promotion of main v0\.15\.0-rc\.1/i` (aria-label) + `/click to confirm.*promote/i` (visible text). Both branch + version surface in the label, satisfying the WRITE-05 invariant "no fetch fires until confirm clicked + literal label includes branch + version".

## shared@0.3.0 Publish Status

**Already complete pre-22-05.** Per 22-02 SUMMARY deviation #1:

> "Plan 22-01's tag (shared/v0.3.0) IS pushed and 0.3.0 IS published to GitHub Packages (verified with `npm view @myalterlego/triarch-shared versions` using gh CLI token). The 22-01-SUMMARY note 'TAG NOT YET PUSHED' is stale; orchestrator follow-ups completed."

Verified state at 22-05 start:
- `portal/package.json` — `"@myalterlego/triarch-shared": "^0.3.0"` ✓
- `portal/package-lock.json` — resolved to `https://npm.pkg.github.com/@myalterlego/triarch-shared/-/...0.3.0.tgz` ✓ (would have failed `npx next build` otherwise)
- `npx next build` — clean, 13 dynamic routes register ✓

Plan Task 2 (`git tag shared/v0.3.0 && git push origin shared/v0.3.0` + portal pin update) was therefore a no-op for 22-05. Orchestrator confirmed and skipped.

## Portal v0.3.4 Final State

| Item | Value |
|---|---|
| `portal/package.json` version | `0.3.4` (was 0.3.3) |
| `@myalterlego/triarch-shared` pin | `^0.3.0` (unchanged from 22-02) |
| Vitest count | 167 / 168 GREEN (1 pre-existing skip from PORTAL-03 RC-03 isolation test, refreshed in 22-04) |
| `next build` | clean |
| New routes | none — test-only commit |

Phase 22 cumulative bump: **portal 0.3.0 → 0.3.4** across 5 plans:
- 22-01 admin v2.10.0 (no portal change yet)
- 22-02 portal 0.3.0 → 0.3.1 (write routes)
- 22-03 portal 0.3.1 → 0.3.2 (branch preview)
- 22-04 portal 0.3.2 → 0.3.3 (Slack + UI un-stub)
- 22-05 portal 0.3.3 → 0.3.4 (test hardening + phase close)

The v0.4.0 minor jump originally planned for 22-05 is deferred until a more substantial customer-facing change lands (Phase 23 bug/feature surface is the next candidate).

## Task Commits (portal repo)

1. **Task 1** — `6f64093` `test(22-05): WRITE-05 dedicated UX-preservation + mobile viewport tests`
2. **Task 3** — `7c40590` `v0.3.4: phase 22 close-out (WRITE-05 hardening test bump)`

(Plan Task 2 had no commits — it was the publish/pin step which was already done.)

## PR Status

- **Portal PR:** https://github.com/MyAlterLego/triarch-portal/pull/15 — `feat/22-05-phase-close-hardening` → `main` — **OPEN, awaiting review.** Title: `v0.3.4: WRITE-05 dedicated tests + mobile viewport (Phase 22 close-out)`. CI quality-gate + type-check + build will run on the PR.
- **Admin docs PR:** to be opened by orchestrator with this SUMMARY.md + STATE.md + ROADMAP.md updates as docs(22) commit. Branch `feat/22-05-phase-close-hardening` ready for push.

**Neither PR has been merged.** Orchestrator stops at PRs-open per 22-05 instructions.

## Quality Gate (CONTEXT.md operational context)

- [x] HMAC tests cover valid sig, tampered sig, expired timestamp, replay (22-01: 7 tests in `internal-hmac.test.ts` + 7 integration in admin's `dispatch/route.test.ts`)
- [x] Portal Vitest stays GREEN: **167/168** (target ≥ 127; exceeded by 40)
- [x] Admin Vitest stays GREEN: **352/352** (verified at 22-01 close; no admin code change in 22-02..22-05)
- [x] Portal next build clean
- [x] Admin next build clean (verified 22-01)
- [x] Each plan ended with branch + PR (squash-merge to be performed by orchestrator after review)
- [x] Final portal **v0.3.0 → v0.3.4** (patch progression — see "Portal v0.3.4 Final State" for rationale on v0.4.0 deferral)
- [x] Final admin **v2.9.3 → v2.10.0** (22-01)

## Pitfall Checklist — End-to-End Verified

- [x] **Pitfall 5 (BRANCH_REGEX before any DB/FAH call):** exercised in 22-03 fah-rollout test 5 (invalid_branch case asserts `updateCallIndex === 0` BEFORE any DB write)
- [x] **Pitfall 9 (Slack credential routing):** PORTAL_SLACK_BOT_TOKEN distinct from admin's SLACK_BOT_TOKEN; portal Block Kit posts plain section blocks only — no `slack_promote` / `slack_reject` action_ids (those use SLACK_PAYLOAD_SECRET admin-only). Verified by 22-04 portal-slack test 6 (structural — grep on rendered Block Kit JSON)
- [x] **Pitfall 11 (sanitize at Slack composition boundary):** every customer-derived field (version, branch, feedback excerpt, rejection reason) wraps in `sanitizeForSlack` BEFORE composition. Verified by 22-04 portal-slack test 3
- [x] **Pitfall 12 (signIn race):** NO new auth code in Phase 22 — write paths only; existing Phase 18 auth scaffolding owns the read-only signIn callback. Pitfall ownership preserved.

## Deviations from Plan

### [Rule 3 - Blocking] Plan Task 2 (publish shared@0.3.0 + portal pin) was already done

- **Found during:** 22-05 setup — verified `portal/package.json` already showed `@myalterlego/triarch-shared@^0.3.0` and lockfile already resolved to npm.pkg.github.com.
- **Issue:** Plan 22-01 SUMMARY originally said "TAG NOT YET PUSHED (Phase 22 wrap-up step pending)", but per 22-02 SUMMARY deviation #1, the orchestrator follow-up landed during the 22-01 → 22-02 transition: tag pushed, package published, portal pinned.
- **Fix:** Skipped Plan Task 2. No tag push, no `npm install` re-run, no commit on lockfile from this step.
- **Files modified:** none (verified state only)
- **Committed in:** none — no commit needed.

### [Rule 4 - Architectural] Version bump 0.4.0 minor → 0.3.4 patch

- **Found during:** Plan reading + orchestrator override.
- **Issue:** Plan called for portal v0.3.3 → v0.4.0 minor bump as the phase-closing marker. Orchestrator instructions specified v0.3.3 → v0.3.4 patch since 22-05 changes are test-only (no app code, no API surface). The minor jump deferred until a more substantial customer-facing change.
- **Fix:** Bumped portal package.json + package-lock.json to 0.3.4. Documented as a 22-05 decision in STATE.md.
- **Files modified:** `portal/package.json`, `portal/package-lock.json`
- **Committed in:** `7c40590`
- **User decision:** ORCHESTRATOR-LEVEL — no human action; documented for traceability.

**Total deviations:** 2 (1 blocking already-resolved, 1 architectural orchestrator-level)
**Impact on plan:** All deviations were pre-resolved or orchestrator-level; no functional/architectural deviation in code. Test count exceeded target (≥ 6 → actual +7).

## Issues Encountered

- None blocking. Test files compiled clean on first execution; all 7 new tests passed first run; `next build` clean first run.
- Initial test draft used `React.ComponentProps` without `import type { ComponentProps } from 'react'` — caught and fixed pre-commit.

## Auth Gates / User Setup Required

### HUMAN-VERIFY items (deferred — handled post-merge)

These were carried forward from 22-04 SUMMARY and remain pending Mike's hands-on action:

1. **GCP secret + IAM provisioning for `PORTAL_SLACK_BOT_TOKEN`** (22-04 deliverable)
   ```bash
   gcloud secrets versions access latest --secret=SLACK_BOT_TOKEN --project=triarch-vault > /tmp/bot.token
   gcloud secrets create PORTAL_SLACK_BOT_TOKEN --project=triarch-vault --data-file=/tmp/bot.token
   rm /tmp/bot.token
   gcloud secrets add-iam-policy-binding PORTAL_SLACK_BOT_TOKEN \
     --project=triarch-vault \
     --member=serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com \
     --role=roles/secretmanager.secretAccessor
   ```
   Until provisioned: portal logs `[portal-slack] PORTAL_SLACK_BOT_TOKEN not set` and continues without Slack notification (HMAC dispatch + approval still succeed).

2. **Live smoke test** (deferred — gated on PR merges + GCP secret + portal-dev redeploy)
   - Customer admin clicks Approve in portal-dev → release_approvals row stamped `actor_source='portal'` + Slack message in `#release-approvals-test` within 3s + admin-dev workflow dispatch fires (round-trip GH workflow).

### PRs to be reviewed (orchestrator handles routing)

- Portal PR https://github.com/MyAlterLego/triarch-portal/pull/15 — review and merge to main (triggers Firebase App Hosting deploy of portal-prod via shared-workflows).
- Admin docs PR — to be opened with this SUMMARY.md + STATE.md + ROADMAP.md updates. No app code change → no admin redeploy.

## Known Stubs

- `handleLoadMore` in `ReleasesClient.tsx`: kept stubbed (no portal GET releases list endpoint exists yet). `hasMoreState=false` keeps the LoadMore button hidden — users see all releases that fit in the initial page (`pageSize=20` default). Documented as a v2.3 polish candidate. Will not block customer use because no Triarch project currently ships > 20 active releases simultaneously.

## Self-Check: PASSED

All claimed files exist on disk; all claimed commits exist in portal history; all claimed tests are GREEN.

- 1 file created — verified with `[ -f portal/src/app/projects/[slug]/releases/MobileApproveSpec.test.tsx ]` ✓
- 4 portal files modified — verified with `git log --stat -2` showing `package.json`, `package-lock.json`, `ReleasesClient.test.tsx`, `BranchPreviewClient.test.tsx`
- 2 admin docs files modified — `.planning/STATE.md`, `.planning/ROADMAP.md` (this commit)
- 2 commits in portal — `6f64093` Task 1 + `7c40590` Task 3 — verified with `git log --oneline origin/main..HEAD` showing both
- `must_haves.truths` 6/6 covered:
  1. Two-step approve UX dedicated test ✓ (W5-1 in ReleasesClient.test.tsx)
  2. Conflict badge propagation dedicated test ✓ (W5-2 in ReleasesClient.test.tsx)
  3. Branch lock disable propagation dedicated test ✓ (W5-3 in BranchPreviewClient.test.tsx)
  4. Mobile (375px) viewport renders + desktop-optimized controls preserved ✓ (M-1 in MobileApproveSpec.test.tsx)
  5. Shared package 0.3.0 published + portal pin at ^0.3.0 ✓ (already done pre-22-05; verified)
  6. Portal v0.3.3 → v0.3.4 (patch — orchestrator override from plan's 0.4.0 minor) ✓
  - STATE.md updated to reflect Phase 22 complete ✓ (completed_phases: 13→14, completed_plans: 52→53)
  - REQUIREMENTS.md WRITE-01..05 all Complete ✓ (already marked Complete pre-22-05; verified `grep -c "WRITE-0[1-5] | Phase 22 | Complete" → 5`)
- `must_haves.artifacts` 3/3 present:
  - ReleasesClient.test.tsx contains `describe('WRITE-05` ✓
  - MobileApproveSpec.test.tsx contains `375` ✓ (line 50: `value: 375`)
  - portal/package.json contains `"version": "0.3.4"` ✓
- `must_haves.key_links` 1/1 satisfied:
  - portal package.json `@myalterlego/triarch-shared@^0.3.0` resolves to GitHub Packages 0.3.0 ✓ (verified by `next build` succeeding — would fail with module resolution error otherwise)
- Portal vitest 167/168 GREEN (1 skip = pre-existing) — verified with `npx vitest run`
- `next build` passes — verified

---

## Phase 22 — Final State

| Component | v Before | v After | Net change |
|---|---|---|---|
| **Admin** | v2.9.3 | v2.10.0 | New `/api/internal/dispatch` endpoint (HMAC-signed customer write proxy) |
| **Portal** | v0.3.0 | v0.3.4 | Full customer write surface — approve, reject, feedback (POST + DELETE), branch preview swap, all wired to UI; Slack notification posts on approve/reject; HMAC dispatch to admin for GH workflow |
| **Shared package** | v0.2.0 | v0.3.0 | New `internal-hmac` module (`signRequest`, `verifyRequest`, `NonceStore`); both apps import from same source — no signature-format drift possible |

**Code metrics:**
- Admin: 1 new route file (`/api/internal/dispatch/route.ts`) + 1 test file + 1 lib delta + 1 secret binding (apphosting.yaml)
- Portal: 9 new route files (5 mutation + 2 branch + 2 lib helpers) + 8 new test files + 2 modified UI components (un-stubbed) + 1 new lib (portal-slack.ts) + 4 secret/env bindings (apphosting.yaml + apphosting.dev.yaml × INTERNAL_HMAC_SECRET, ADMIN_INTERNAL_DISPATCH_URL, FAH_PROMOTER_SA_KEY, PORTAL_SLACK_BOT_TOKEN, SLACK_RELEASE_APPROVAL_CHANNEL)
- Shared: 1 new module (`internal-hmac.ts`) + 1 test file
- New tests: 14 admin (7 internal-hmac + 7 dispatch route) + 113+ portal (42 in 22-02 + 27 in 22-03 + 37 in 22-04 + 7 in 22-05) = **127+ new tests across the phase**
- 5 squash-merged PRs (target — orchestrator handles)
- 0 logic deltas vs admin's branch preview routes (auth swap only — verified by `diff` between portal and admin preview routes during 22-03)

**GCP secrets bound (3 new):**
1. `INTERNAL_HMAC_SECRET` (22-01) — admin + portal both bind; same triarch-vault secret; secretAccessor IAM on shared FAH compute SA
2. `PORTAL_SLACK_BOT_TOKEN` (22-04) — portal-only; same underlying value as admin's SLACK_BOT_TOKEN initially (per CONTEXT.md D-01); awaiting Mike's hands-on provisioning
3. `FAH_PROMOTER_SA_KEY` (22-03) — portal binds (already existed in triarch-vault from Phase 13); shared FAH compute SA's secretAccessor inherited automatically

**Capability delta — what customer admin can now do (end-to-end on portal):**
- ✅ Approve a release (two-step UX with countdown) → writes `release_approvals.actor_source='portal'` + posts Slack notification + dispatches GH workflow via admin HMAC proxy
- ✅ Reject a release with reason (500-char cap) → writes rejection approval + posts Slack rejection notification
- ✅ Leave feedback (2000-char cap) → INSERT into `release_feedback`
- ✅ Delete own feedback within 24h → DELETE from `release_feedback` (case-insensitive author match)
- ✅ Trigger branch preview swap → atomic lock + portal-owned FAH dispatch + 5s SWR polling + 8-min hard timeout + branch-guarded auto-clear + cross-section disable propagation
- ✅ All write controls behave identically to admin's v2.1 release page; portal is now feature-complete vs admin for the customer release surface

**Pitfall checklist (verified end-to-end across all 5 plans):**
- [x] Pitfall 5: BRANCH_REGEX enforced before any DB/FAH call (22-03 fah-rollout test 5)
- [x] Pitfall 9: Portal owns Slack credentials; admin retains GitHub App key via HMAC seam (22-01 internal-hmac + 22-04 live smoke)
- [x] Pitfall 11: sanitizeForSlack at composition boundary (22-04 portal-slack test 3)
- [x] Pitfall 12: signIn callbacks remain read-only (no new code in this phase; Phase 18 ownership preserved)

**Deferred to v2.3 polish:**
- `handleLoadMore` in portal ReleasesClient (no GET releases list endpoint yet; pageSize=20 covers near-term use)
- Admin sunset of `/projects/[slug]/*` (Phase 26, T+90 after Phase 25 cutover)
- Approval delegation / backup approver (POLISH-04)
- Multi-secret HMAC rotation / key versioning (folded into hot-rotation work if/when needed)

---
*Phase: 22-release-page-port-write — Plan 22-05 phase-close*
*Completed: 2026-05-08T23:58:31Z (PRs open, awaiting Mike's review)*
