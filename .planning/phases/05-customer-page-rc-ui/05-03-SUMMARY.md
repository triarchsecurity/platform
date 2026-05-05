---
phase: 05-customer-page-rc-ui
plan: 03
subsystem: ui
tags: [react, lucide-react, jsdom, vitest, testing-library]

requires:
  - phase: 05-01
    provides: Wave 0 test scaffolding — PreviewLink.test.tsx (RED tests)

provides:
  - PreviewLink.tsx — icon-only external-link component with enabled/disabled states (RC-02)
  - vitest.config.ts jsdom default — fixes broken environmentMatchGlobs in vitest 4.x

affects:
  - 05-04 (BranchSection — imports PreviewLink per release row)
  - Any future .tsx test files in [slug] directory

tech-stack:
  added: []
  patterns:
    - "'use client' single-responsibility atom component with no project-internal imports"
    - "stopPropagation on anchor click to prevent row toggle bubble-up"

key-files:
  created:
    - src/app/projects/[slug]/releases/PreviewLink.tsx
  modified:
    - vitest.config.ts

key-decisions:
  - "vitest 4.x silently ignores environmentMatchGlobs — replaced with environment: jsdom as default; node-env tests unaffected in practice"
  - "Props interface is { url: string | null } only — no additional props per D-08 constraint"
  - "Disabled button state uses aria-label + title both set to 'No preview deployed' for tooltip + screen-reader parity"

patterns-established:
  - "PreviewLink: icon-only link atom, self-contained, no project imports — template for other icon-link atoms"

requirements-completed: [RC-02]

duration: 12min
completed: 2026-05-05
---

# Phase 05 Plan 03: PreviewLink Component Summary

**Icon-only ExternalLink atom with anchor/disabled-button duality, turning Wave 0 PreviewLink.test.tsx GREEN**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-05T~11:20Z
- **Completed:** 2026-05-05T~11:32Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Created `PreviewLink.tsx` satisfying the RC-02 spec: anchor with `target="_blank" rel="noopener noreferrer" onClick={stopPropagation}` when `url` is a non-empty string; disabled `<button aria-label="No preview deployed">` when `url` is null
- Both tests in `PreviewLink.test.tsx` turned GREEN (was RED in Wave 0)
- Fixed vitest 4.x environment issue: `environmentMatchGlobs` is silently ignored in v4.1.5; changed config to `environment: 'jsdom'` globally so all `.tsx` test files in `[slug]` directory get jsdom properly

## Task Commits

1. **Task 1: Create PreviewLink component (RC-02)** — `3820c8a` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/app/projects/[slug]/releases/PreviewLink.tsx` — Self-contained `'use client'` component (~50 lines). Single `Props { url: string | null }`. Lucide `ExternalLink` at size 12. `stopPropagation` on anchor click.
- `vitest.config.ts` — Replaced `environment: 'node'` + broken `environmentMatchGlobs` with `environment: 'jsdom'` as default

## Decisions Made

- **vitest 4.x environmentMatchGlobs is ignored** — The option doesn't exist in vitest 4.1.5 compiled output (searched all dist files; not present). Using `environment: 'jsdom'` globally is the correct fix; node-based tests (API routes, lib utils) are unaffected because jsdom is a superset environment that doesn't break non-DOM tests.
- **No project-internal imports** — Component imports only from `react` and `lucide-react` per constraint. Fully portable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vitest environmentMatchGlobs not working in v4.x**
- **Found during:** Task 1 (PreviewLink component verification)
- **Issue:** `environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']]` in vitest.config.ts was silently ignored by vitest 4.1.5 — the option no longer exists in v4.x dist. All `.tsx` test files in the `[slug]` directory ran in `node` environment, causing `ReferenceError: document is not defined`
- **Fix:** Changed `environment: 'node'` to `environment: 'jsdom'` and removed the broken `environmentMatchGlobs` block
- **Files modified:** `vitest.config.ts`
- **Verification:** PreviewLink.test.tsx 2/2 PASS; all 81 other tests still pass
- **Committed in:** `3820c8a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking issue)
**Impact on plan:** Required fix — without it the Wave 0 test file could not be turned GREEN. No scope creep.

## Issues Encountered

- `environmentMatchGlobs` silently ignored in vitest 4.x — required config change to unblock test execution.

## Known Stubs

None — PreviewLink is fully implemented. Wiring into the release row UI is Plan 05-04's responsibility.

## Next Phase Readiness

- `PreviewLink` is ready for import by `BranchSection` / `ReleasesClient` in Plan 05-04
- vitest environment is correctly set to jsdom for all tsx test files going forward
- `ReleasesClient.test.tsx` and `BranchSection.test.tsx` remain RED — those are 05-02 and 05-04 responsibilities respectively

---
*Phase: 05-customer-page-rc-ui*
*Completed: 2026-05-05*
