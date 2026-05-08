---
phase: 21-release-page-port-read
plan: 02
subsystem: ui
tags: [react, tailwind, lucide-react, vitest, testing-library, triarch-shared, next.js]

# Dependency graph
requires:
  - phase: 21-01
    provides: "@myalterlego/triarch-shared@0.2.0 published with release-entry-summary subpath export"
provides:
  - "6 leaf UI components in portal src/app/projects/[slug]/releases/ (PreviewLink, format, types, FilterChips, WhatsComingCard, Timeline)"
  - "3 vitest test suites (PreviewLink.test.tsx, FilterChips.test.tsx, WhatsComingCard.test.tsx)"
  - "types.ts re-exports EntryTypeCounts/WhatsComingSummary from @myalterlego/triarch-shared/release-entry-summary"
  - "portal @myalterlego/triarch-shared bumped to ^0.2.0"
  - "portal v0.2.2"
affects:
  - 21-03-ReleasesClient-port
  - 21-04-page-server-component

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "leaf UI components copied verbatim from admin to portal with import path rewrite only"
    - "types.ts re-exports shared types from @myalterlego/triarch-shared subpath instead of @/lib shim"

key-files:
  created:
    - "portal/src/app/projects/[slug]/releases/PreviewLink.tsx"
    - "portal/src/app/projects/[slug]/releases/format.ts"
    - "portal/src/app/projects/[slug]/releases/types.ts"
    - "portal/src/app/projects/[slug]/releases/FilterChips.tsx"
    - "portal/src/app/projects/[slug]/releases/WhatsComingCard.tsx"
    - "portal/src/app/projects/[slug]/releases/Timeline.tsx"
    - "portal/src/app/projects/[slug]/releases/PreviewLink.test.tsx"
    - "portal/src/app/projects/[slug]/releases/FilterChips.test.tsx"
    - "portal/src/app/projects/[slug]/releases/WhatsComingCard.test.tsx"
  modified:
    - "portal/package.json — v0.2.1 -> v0.2.2, @myalterlego/triarch-shared ^0.1.0 -> ^0.2.0"
    - "portal/vitest.setup.ts — added RTL cleanup afterEach (was missing)"

key-decisions:
  - "Copied UI leaf files verbatim from admin; only change is types.ts import path rewrite"
  - "Used gh auth token as NODE_AUTH_TOKEN for npm install (GitHub Packages auth)"
  - "Fixed vitest.setup.ts RTL cleanup gap (Rule 2) — portal lacked afterEach(cleanup) causing DOM accumulation across tests"

patterns-established:
  - "Portal leaf UI components import shared types via @myalterlego/triarch-shared/<subpath> not @/lib shims"

requirements-completed:
  - PORTAL-01

# Metrics
duration: 2min
completed: 2026-05-08
---

# Phase 21 Plan 02: Release Page Port - Leaf UI Components Summary

**6 leaf UI components + 3 vitest tests copied verbatim from admin to portal; types.ts re-export rewritten to @myalterlego/triarch-shared; portal v0.2.2**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-08T19:47:13Z
- **Completed:** 2026-05-08T19:49:36Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Copied PreviewLink, format, types, FilterChips, WhatsComingCard, Timeline from admin to portal verbatim
- Copied 3 vitest test suites; all 39 tests (7 suites) green after RTL cleanup fix
- Bumped @myalterlego/triarch-shared dep to ^0.2.0 and installed from GitHub Packages registry
- PR #7 squash-merged; portal v0.2.2 on main

## Task Commits

1. **Task 1: Copy files, rewrite import, bump deps** - `336166b` (feat) — on feature branch
2. **Task 2: Branch, PR, squash-merge** - `c7884ea` (feat) — squash merge commit on main

## Files Created/Modified
- `portal/src/app/projects/[slug]/releases/PreviewLink.tsx` — inline external-link icon component
- `portal/src/app/projects/[slug]/releases/format.ts` — formatDeployedAt + formatRelativeTime helpers
- `portal/src/app/projects/[slug]/releases/types.ts` — release types with shared re-export rewritten to package path
- `portal/src/app/projects/[slug]/releases/FilterChips.tsx` — filter chip pill component
- `portal/src/app/projects/[slug]/releases/WhatsComingCard.tsx` — collapsible what's-coming-to-prod card
- `portal/src/app/projects/[slug]/releases/Timeline.tsx` — release lifecycle timeline component
- `portal/src/app/projects/[slug]/releases/PreviewLink.test.tsx` — 2 tests
- `portal/src/app/projects/[slug]/releases/FilterChips.test.tsx` — 7 tests
- `portal/src/app/projects/[slug]/releases/WhatsComingCard.test.tsx` — 8 tests
- `portal/package.json` — v0.2.2, @myalterlego/triarch-shared ^0.2.0
- `portal/package-lock.json` — updated for 0.2.0 resolution
- `portal/vitest.setup.ts` — added RTL cleanup afterEach

## Decisions Made
- Used `gh auth token` as NODE_AUTH_TOKEN for `npm install` (NODE_AUTH_TOKEN env var unset in shell; gh CLI token has read:packages scope)
- Copied vitest.setup.ts cleanup fix from admin pattern (admin had it; portal was missing it)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added RTL afterEach cleanup to portal vitest.setup.ts**
- **Found during:** Task 1 (vitest run)
- **Issue:** Portal vitest.setup.ts lacked `afterEach(cleanup)` from @testing-library/react. Without it, rendered components accumulate in the DOM across tests, causing "Found multiple elements" errors. 9 out of 17 new tests failed.
- **Fix:** Added afterEach(cleanup) to vitest.setup.ts, mirroring the admin pattern
- **Files modified:** portal/vitest.setup.ts
- **Verification:** npx vitest run — 39 tests, 7 suites, all green
- **Committed in:** 336166b (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical test infrastructure)
**Impact on plan:** Necessary for test correctness; zero scope creep. Admin had this pattern; portal did not.

## Issues Encountered
- NODE_AUTH_TOKEN env var unset in shell — resolved by using `gh auth token` inline (gh CLI already authenticated with read:packages scope from Phase 18)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 6 leaf components available in portal at relative sibling paths for Plan 21-03 ReleasesClient import
- types.ts exports all types needed by ReleasesClient (ReleaseRow, BranchSection, FilterType, etc.)
- Portal vitest green; build clean; ready for Plan 21-03

---
*Phase: 21-release-page-port-read*
*Completed: 2026-05-08*
