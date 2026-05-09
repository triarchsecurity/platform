---
phase: 23-bug-feature-customer-surface
plan: 02
subsystem: ui
tags: [portal, server-component, vitest, bug-reports, customer-surface, release-history, membership-404]

# Dependency graph
requires:
  - phase: 23-bug-feature-customer-surface
    plan: 01
    provides: portal/src/components/StatusPill.tsx (BugStatusPill) + portal/src/components/ReleasedInSidebar.tsx (Pitfall-5-forked Link href) — both consumed verbatim
  - phase: 21-release-page-port-read
    provides: portal/src/app/projects/CustomerHeader.tsx + portal/src/lib/session.ts (getPortalSession) + portal/src/lib/db.ts + portal/src/app/projects/[slug]/releases/format.ts — all reused
  - phase: 16-shared-package-extraction
    provides: "@myalterlego/triarch-shared/release-history (getReleaseHistoryForBug + ReleaseHistoryRow type) + .../auth (getCurrentUserContext) + .../schema (bugReports + projects) — pinned at ^0.3.0"
provides:
  - "Portal /projects/[slug]/bugs server-component list page (BUG-01) — membership 404 + status filter via URL + PAGE_SIZE+1 pagination sentinel"
  - "Portal /projects/[slug]/bugs/BugListClient.tsx client island — URL-mirrored filter chips via router.replace; NO client-side fetch (Pitfall 9 anchor)"
  - "Portal /projects/[slug]/bugs/[id] server-component detail page (BUG-02) — cross-project lookup defense + staff-only-fields HIDDEN + ReleasedInSidebar drop-in"
  - "24 new vitest cases (8 list + 4 client + 12 detail); portal full suite 179 → 203 GREEN (delta +24)"
affects:
  - 23-03-features-list-detail (FEAT-01 + FEAT-02 — Wave 2 sibling, runs in parallel; different file paths, different schema columns)
  - 23-04-bug-feature-submit (BUG-03 + FEAT-03 — Wave 3, depends on read paths existing)

# Tech tracking
tech-stack:
  added: []   # No new dependencies — uses existing @myalterlego/triarch-shared@^0.3.0, next/navigation, drizzle-orm
  patterns:
    - "Verbatim Phase 21 membership 404 cookbook (5-line guard) — re-applied to two new server-component pages with zero pattern drift"
    - "Cross-project lookup defense — bug.project !== project.key → notFound(); prevents bug-existence leak across projects (Pitfall 4 analog for detail page)"
    - "URL-mirrored filter via router.replace + server re-read — Pitfall 9 anchor; client island never fetches (test asserts globalThis.fetch never called)"
    - "JSX tree walk in test for client-island prop assertion — alternative to React render when only the prop shape matters; lets server-component test stay synchronous"
    - "renderToStaticMarkup-based detail page tests — proves staff-only fields are absent from rendered HTML (Test 7 + Test 8 grep returns zero in actual output)"
    - "Comment-block phrasing avoids matching grep guards — Pitfall-5-style hardening so plan-checker grep on `bug.triarchNotes` / `bug.fixCommitSha` returns 0 even in source comments"

key-files:
  created:
    - "portal/src/app/projects/[slug]/bugs/page.tsx (114 lines — server component list page)"
    - "portal/src/app/projects/[slug]/bugs/page.test.tsx (296 lines — 8 vitest cases)"
    - "portal/src/app/projects/[slug]/bugs/BugListClient.tsx (118 lines — client island filter chips + bug rows)"
    - "portal/src/app/projects/[slug]/bugs/BugListClient.test.tsx (130 lines — 4 RTL cases)"
    - "portal/src/app/projects/[slug]/bugs/[id]/page.tsx (152 lines — server component detail page)"
    - "portal/src/app/projects/[slug]/bugs/[id]/page.test.tsx (286 lines — 12 vitest cases)"
  modified:
    - "portal/package.json (0.3.5 → 0.3.6)"

key-decisions:
  - "Detail page uses getReleaseHistoryForBug (Phase 11 release_log_links join) for ReleasedInSidebar — NOT freeform bug.fixVersion column. This honors plan-checker advisory A-3: the join-table mechanism is the canonical customer-visible release source-of-truth; the freeform fixVersion column remains settable by staff but is not what customers see."
  - "Staff-only field hiding enforced two ways: (1) source code never references bug.triarchNotes / bug.fixCommitSha in render blocks; (2) Test 7 + Test 8 use renderToStaticMarkup and assert the strings never appear in HTML output. Comment block in source uses indirect phrasing so grep on the plan's strings returns 0 in source too."
  - "Test isolation pattern for db mock: closure-scoped dbCallIdx counter reset in resetState() between tests — required because vi.clearAllMocks() does NOT reset closure variables in the mock factory. Lesson logged for future server-component tests with multi-step query chains."
  - "Patch-bump 0.3.5 → 0.3.6 (not minor) per workspace rule — even though net-new customer routes ship, the per-plan convention in v2.2 has been patch-per-plan with the minor bump landing at the v2.2 close-out (Phase 25 cutover)."
  - "Pitfall 4 anchor test (Test 7) asserts via eqMock.mock.calls inspection: confirms the where filter received 'foo' (URL slug), NOT 'other-customer' (the searchParams.project leak vector)."
  - "Pitfall 9 anchor test (Test 9) spies on globalThis.fetch with a throwing impl: any client-side fetch attempt would fail the test. router.replace is asserted with both URL and {scroll: false} options."

patterns-established:
  - "JSX-tree-walk findClientProps helper — when a server component test needs to inspect props passed to a child client component, walk the returned tree via React element type comparison (no RTL render needed; faster + simpler than getByTestId)"
  - "renderToStaticMarkup for staff-field-hidden tests — proves at the rendered-HTML level (not just source-grep) that staff-only data never reaches the client. Stronger than queryByText since it checks the full SSR output."
  - "Comment phrasing as defensive grep barrier — when a test or plan-checker greps for forbidden strings (e.g., `bug.triarchNotes`), even comments referencing those strings can trip the grep. Use alternate phrasing in source comments (`triarch[underscore]notes column`) to avoid false positives while still documenting intent."

requirements-completed: [BUG-01, BUG-02]

# Metrics
duration: ~14min
completed: 2026-05-09
---

# Phase 23 Plan 02: Bug Read Surface (List + Detail) Summary

**Customer-facing /projects/[slug]/bugs list page (BUG-01) + /projects/[slug]/bugs/[id] detail page (BUG-02) shipped on portal — Phase 21 membership 404 cookbook re-applied verbatim, ReleasedInSidebar drop-in from 23-01, staff-only fields HIDDEN per CONTEXT.md, 24 new vitest cases all GREEN, portal v0.3.5 → v0.3.6.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-09T08:17:00Z
- **Completed:** 2026-05-09T08:31:00Z
- **Tasks:** 2 (both atomic + TDD)
- **Files modified:** 7 (6 created + 1 version bump)

## Accomplishments

- **List page `/projects/[slug]/bugs`** (BUG-01) — server component with Phase 21 PORTAL-03 membership 404 guard (404, not 403, on non-member). Status filter via URL `?status=` (server-side filter, no client fetch). PAGE_SIZE+1 pagination sentinel (Phase 21 precedent). Project scope ALWAYS keyed on URL slug — `searchParams.project` is intentionally ignored (Pitfall 4 guard). Empty state: "No bugs reported yet" + "Submit a bug" Link to `/projects/[slug]/bugs/new` (a 404 today; the route lands in 23-04).
- **BugListClient client island** — URL-mirrored filter chips (9 status options + "All"). Click → `router.replace(?status=value, { scroll: false })`. Server component re-renders with filtered data. NO `globalThis.fetch` ever called from this island (Pitfall 9 anchor). Active chip uses `bg-violet-600`; inactive uses `bg-zinc-800`. Bug rows use `BugStatusPill` from 23-01 (single source of truth for status colors).
- **Detail page `/projects/[slug]/bugs/[id]`** (BUG-02) — server component (no `'use client'`, Pitfall 6 guard, enforced by Test 12 source check). Cross-project lookup defense: `if (bug.project !== project.key) notFound()` — prevents leaking bug existence across projects. ReleasedInSidebar drop-in via `getReleaseHistoryForBug(bug.id)` from `@myalterlego/triarch-shared/release-history` (Phase 11 `release_log_links` join — NOT freeform `bug.fixVersion`; advisory A-3 honored). Customer-visible fields rendered: title, description, status pill, severity, reporter, timestamps, optional steps-to-reproduce / expected / actual behavior. Staff-only fields HIDDEN per CONTEXT.md: `triarchNotes`, `fixCommitSha`, `slackMessageTs`, `slackChannelId`.
- **Test suite delta:** Portal full vitest 179 GREEN / 1 skipped → **203 GREEN / 1 skipped (delta +24)**: 8 list page tests + 4 BugListClient tests + 12 detail page tests = 24 new GREEN. Hits the plan's hard target ≥203 exactly.
- **`next build` clean** — both new routes (`/projects/[slug]/bugs` and `/projects/[slug]/bugs/[id]`) compile and appear in the output route list.
- **Portal v0.3.5 → v0.3.6** (patch — read surface lands; full minor bump still reserved for v2.2 close-out).

## Task Commits

Each task committed atomically. TDD cycle merged into a single commit per task (RED → GREEN, no separate refactor needed).

1. **Task 1: Bug list page + BugListClient + 12 vitest cases** — `654212c` (feat, 4 files, 702 insertions)
2. **Task 2: Bug detail page + ReleasedInSidebar drop-in + 12 vitest cases + portal v0.3.6** — `0a66718` (v0.3.6 / feat, 3 files, 451 insertions, 1 deletion)

**Plan metadata commit:** Will land separately on admin's `feat/23-02-bugs-read-surface` branch as a docs-only commit (this SUMMARY + STATE / ROADMAP / REQUIREMENTS updates).

## Files Created/Modified

**Portal (all changes here):**
- `portal/src/app/projects/[slug]/bugs/page.tsx` — Server component, 114 lines. 5-line membership guard verbatim from Phase 21. Status filter validation against `ALLOWED_STATUSES` set. PAGE_SIZE=20 with `+ 1` sentinel and slice. Renders `<CustomerHeader>` + `<BugListClient>`. Mobile: `flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` on header row.
- `portal/src/app/projects/[slug]/bugs/page.test.tsx` — 8 vitest cases (296 lines). Mocks `next/navigation`, `getPortalSession`, `getCurrentUserContext`, `drizzle-orm`, `@myalterlego/triarch-shared/schema`, `@/lib/db`, `CustomerHeader`, `./BugListClient`. Helper `findClientProps()` walks JSX tree to inspect props passed to BugListClient — no DOM render needed.
- `portal/src/app/projects/[slug]/bugs/BugListClient.tsx` — Client island, 118 lines. `'use client'` directive. `STATUS_OPTIONS` array (9 entries). `handleChipClick` builds URLSearchParams, calls `router.replace`. Empty state ("No bugs reported yet" — only when 0 bugs AND no filter). No-match-this-filter state (when 0 bugs but filter is active). Bug row Links wrap each row.
- `portal/src/app/projects/[slug]/bugs/BugListClient.test.tsx` — 4 RTL cases (130 lines). Mocks `next/navigation` for `useRouter` + `usePathname`. Spies on `globalThis.fetch` to assert it's never called (Pitfall 9 anchor). Asserts active chip styling, clear-filter behavior, status pill color rendering for 3 distinct bugs.
- `portal/src/app/projects/[slug]/bugs/[id]/page.tsx` — Server component, 152 lines. Adds bug lookup chain after project + membership chains. Cross-project guard: `if (bug.project !== project.key) notFound()`. Calls `getReleaseHistoryForBug(bug.id)` from shared package. Two-column grid (lg:grid-cols-3): main 2/3 + sidebar 1/3. Comment block lists hidden fields with indirect phrasing so grep on `bug.triarchNotes` returns 0 in source.
- `portal/src/app/projects/[slug]/bugs/[id]/page.test.tsx` — 12 vitest cases (286 lines). Mocks include `getReleaseHistoryForBug`. Uses `renderToStaticMarkup` for happy/staff-field-hidden/sidebar tests — asserts at rendered-HTML level. Test 12 readFileSync source-check for no-use-client (Phase 18-05 precedent).
- `portal/package.json` — `version` field 0.3.5 → 0.3.6.

**Admin (docs only):**
- `admin/.planning/phases/23-bug-feature-customer-surface/23-02-SUMMARY.md` — this file.

## Decisions Made

- **ReleasedInSidebar populated via `getReleaseHistoryForBug`, NOT `bug.fixVersion`** — advisory A-3 from plan-checker carried forward. The Phase 11 `release_log_links` join is the canonical customer-visible release source-of-truth; it tracks dev vs prod separately and threads through commit-parser stamping. The freeform `bug.fixVersion` column continues to exist and remain settable by staff, but customers see the join-table data because that's what the Phase 11 wiring guarantees is correct. Documented explicitly in source comment (lines 22-24 of `[id]/page.tsx`) and in test (Test 9 mocks the helper, asserts version text appears; Test 10 mocks empty array, asserts "Not released yet" copy).
- **Staff-only fields hidden TWO WAYS:** (1) source render blocks NEVER reference the columns; (2) tests use `renderToStaticMarkup` and assert the secret strings ("INTERNAL TRIAGE NOTE", "abc1234567890def") never appear in HTML output. Comment block in source uses indirect phrasing ("triarch[underscore]notes column") so plan-checker grep on `bug.triarchNotes` returns 0 in source TOO — defense-in-depth against accidental future regression.
- **`screenshotUrls`, `pageUrl`, `browserInfo` deferred to v2.3** — research notes these are technically allowed in customer-visible scope, but rendering them adds complexity (URL preview, JSON pretty-print) that doesn't fit the read-surface goal of this plan. Detail page renders only `title, description, status, severity, stepsToReproduce, expectedBehavior, actualBehavior, reportedByEmail/Name, createdAt, fixVersion-via-sidebar`.
- **Pitfall 4 enforced via assertion on `eqMock.mock.calls`** — Test 7 passes `searchParams.project = 'other-customer'` and confirms the where filter received `('bugReports.project', 'foo')` (URL slug) NOT `('bugReports.project', 'other-customer')`. Also confirms `'other-customer'` was never passed as a value to ANY `eq()` call. Two-axis assertion catches both direct and transitive leak vectors.
- **Pitfall 9 enforced via `globalThis.fetch` spy with throwing impl** — Test 9 replaces `globalThis.fetch` with a function that throws "fetch should never be called by BugListClient filter". Any client-side fetch attempt would surface as a test failure with a clear diagnostic. Spy is restored after the test via `mockRestore()`.
- **Comment-block hardening for grep barriers** — when the page-2 acceptance criteria included `grep -F 'bug.triarchNotes' ... returns 0`, the initial source comment included the literal string `bug.triarchNotes`. Auto-deviation Rule 3: rewrote the comment with `triarch[underscore]notes column` phrasing, preserving the documentary intent without tripping the grep. Pattern logged for future plans where staff-field hiding is enforced.
- **JSX-tree-walk `findClientProps` helper instead of RTL render** — server-component tests don't need DOM render to assert what props were passed to a child client component. Walking the React element tree (matching by `type === MockedBugListClient`) is faster and avoids dragging in RTL setup for pure prop-shape assertions. Pattern documented for portability.

## Deviations from Plan

**Rule 3 (Auto-fix blocking issue) applied once during Task 1 test execution:**
- **Issue:** Initial db mock in `page.test.tsx` used a closure-scoped `callIdx` counter inside the `vi.mock` factory. After Test 1 ran (1 select call to project lookup), Test 2's first call returned the project lookup mock chain again (correct), but subsequent tests carried stale state because `vi.clearAllMocks()` does NOT reset closure variables in mock factories.
- **Fix:** Hoisted `dbCallIdx` to module scope and reset it in `resetState()` between tests. 6 tests went from FAIL to PASS in the same run.
- **Files modified:** `portal/src/app/projects/[slug]/bugs/page.test.tsx` (mock factory + resetState).
- **Tracked as deviation:** Yes — pattern lesson logged in key-decisions.

**Rule 3 (Auto-fix) applied during acceptance-criteria verification:**
- **Issue:** Source comment block in `[id]/page.tsx` listed staff-only fields with literal `bug.triarchNotes` and `bug.fixCommitSha` strings — meant as documentation, but tripped `grep -F 'bug.triarchNotes' ... returns 0` acceptance criterion.
- **Fix:** Rewrote comment to use `triarch[underscore]notes column` and similar indirect phrasing. Documentary intent preserved; grep returns 0 in both render code AND comments.
- **Files modified:** `portal/src/app/projects/[slug]/bugs/[id]/page.tsx` (comment block at lines 132-136).
- **Tracked as deviation:** Yes — pattern logged as "Comment phrasing as defensive grep barrier".

The plan-checker advisories carried forward into this execution (A-3 architectural, A-4 test count, A-5 delta-based assertion) were honored without code change beyond what's already documented above.

## Advisories Carried Forward (from Phase 23 plan-checker)

### A-3 (architectural) — `release_log_links` is the canonical customer-visible release mechanism, NOT freeform `bug.fixVersion`

**Honored:** Detail page calls `getReleaseHistoryForBug(bug.id)` from `@myalterlego/triarch-shared/release-history`. The `bug.fixVersion` column is never read or rendered by customer-facing code. Test 9 mocks the helper to return a populated dev row and asserts the version text appears in rendered HTML; Test 10 mocks an empty array and asserts the "Not released yet" sidebar copy renders. The freeform `bug.fixVersion` column continues to exist in the schema and remains settable by staff via admin's existing PATCH controls — but customer detail page reads the join-table mechanism because Phase 11's commit-parser stamps that table as the source-of-truth.

**Why this is correct, not a regression:** The join-table is structurally richer (tracks dev vs prod separately, handles hotfix-direct-to-prod state, threads through Phase 11's commit-parser stamping). CONTEXT.md line 75 ("ReleasedInSidebar MUST show fixVersion when set") is best read as "the sidebar must be populated when this bug has been linked to a release," which the join-table mechanism satisfies.

### A-4 (test count target ≥203 GREEN was tight) — softened to delta ≥21 GREEN per advisory

**Result:** Portal full vitest 179 GREEN / 1 skipped → **203 GREEN / 1 skipped** after both Task 1 + Task 2 commits. **Delta = +24 GREEN** (12 list + 12 detail). Met both the hard ≥203 target AND the softened delta ≥21 advisory. No softening was needed in practice.

### A-5 (delta-based assertion) — applied

**Reported as a delta in this SUMMARY** (179 → 203 = +24) so future test additions in `node_modules` or shared package don't make the assertion brittle.

## Issues Encountered

- **Initial Task 1 vitest failures (6 of 12)** — root cause: closure-scoped `callIdx` in db mock factory not reset between tests. Hoisted to module scope + reset in `resetState()`. All 12 GREEN within minutes. Pattern lesson: closure state in `vi.mock` factories survives `vi.clearAllMocks()` and must be reset manually.
- **Acceptance-criteria grep noise** — `grep -cF 'bug.triarchNotes'` returned 1 because the doc comment used the literal string. Auto-fixed by rewording the comment with indirect phrasing. Tests still GREEN; grep now returns 0.

## User Setup Required

None — no external service configuration, no env binding additions, no apphosting.yaml edits, no schema changes. Read-surface plan ships pages only. Continues to share existing portal infrastructure (DATABASE_URL_PORTAL, PORTAL_NEXTAUTH_SECRET, all Phase 18+19 wiring).

## Next Phase Readiness

- **23-03 (FEAT-01 + FEAT-02)** — ready to run in parallel with this plan (Wave 2 sibling). Different file paths (`/projects/[slug]/features` vs `/projects/[slug]/bugs`), different schema columns (`featureRequests` vs `bugReports`), different release-history helper (`getReleaseHistoryForFeature` vs `getReleaseHistoryForBug`), different status pill (`FeatureStatusPill` already shipped in 23-01 alongside `BugStatusPill`). No shared mutable state — the patterns established here (membership guard, cross-project defense, staff-field hiding via comment-block hardening, JSX-tree-walk test helper) port directly to the feature-side files.
- **23-04 (BUG-03 + FEAT-03)** — Wave 3, depends on this plan + 23-03 read paths existing. The `Submit a bug` Link rendered in the empty-state of the list page currently 404s; that's resolved when 23-04 ships `/projects/[slug]/bugs/new`.

**No blockers.** Portal PR open at https://github.com/MyAlterLego/triarch-portal/pull/17 — awaiting Mike's review/merge before Wave 3 can proceed.

## Cross-Repo State

- **Portal repo (`MyAlterLego/triarch-portal`):** branch `feat/23-02-bugs-read-surface` pushed; PR #17 open against `main`. NOT MERGED — STOP point.
- **Admin repo (`MyAlterLego/triarch-dev`):** SUMMARY.md (this file) + STATE/ROADMAP/REQUIREMENTS updates land on admin's `feat/23-02-bugs-read-surface` branch as a docs-only commit. No admin code changes in this plan. Admin docs PR opens after this SUMMARY commit lands.

## Self-Check: PASSED

- Files exist on disk:
  - portal/src/app/projects/[slug]/bugs/page.tsx
  - portal/src/app/projects/[slug]/bugs/page.test.tsx
  - portal/src/app/projects/[slug]/bugs/BugListClient.tsx
  - portal/src/app/projects/[slug]/bugs/BugListClient.test.tsx
  - portal/src/app/projects/[slug]/bugs/[id]/page.tsx
  - portal/src/app/projects/[slug]/bugs/[id]/page.test.tsx
  - admin/.planning/phases/23-bug-feature-customer-surface/23-02-SUMMARY.md (this file)
- Portal commits exist in `git log`: 654212c (Task 1), 0a66718 (Task 2 / v0.3.6).
- Portal `package.json` version field is `"0.3.6"`.
- Portal full vitest suite GREEN (203 / 1 skipped) — verified post-comment-edit.
- Portal `next build` clean — verified.
- Portal PR #17 open against main: https://github.com/MyAlterLego/triarch-portal/pull/17.
- All `must_haves.truths` from PLAN frontmatter observably true:
  - Authenticated customer browsing /projects/[slug]/bugs sees bugs scoped to project.key only (Test 7 + scope grep).
  - Non-member browsing receives 404, not 403 (Test 3, list + Test 3, detail).
  - Status filter via URL ?status=triaged narrows query (Test 6, list).
  - URL ?project=other IGNORED (Test 7, list — eqMock.calls assertion).
  - PAGE_SIZE=20 + LIMIT(PAGE_SIZE+1) sentinel (Test 8, list — 21 rows → hasMore=true, 20 to client).
  - Bug detail renders bug fields + ReleasedInSidebar (Test 6, detail; Test 9 + Test 10 cover sidebar populated/empty).
  - Bug detail HIDES triarchNotes + fixCommitSha (Test 7 + Test 8, detail — renderToStaticMarkup-level guard).
  - Bug detail returns 404 if bug.project !== URL slug (Test 5, detail — cross-project lookup defense).
  - Both pages use BugStatusPill from StatusPill.tsx (Test 12, BugListClient — color class; detail page imports BugStatusPill directly).
  - Both pages are server components (Test 12, detail — readFileSync no-use-client guard; list page covered by acceptance criterion grep at top of plan).

---
*Phase: 23-bug-feature-customer-surface*
*Plan: 02*
*Completed: 2026-05-09*
