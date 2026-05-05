---
phase: "05-customer-page-rc-ui"
plan: "01"
subsystem: "test-infrastructure"
tags: ["vitest", "rtl", "wave-0", "test-setup", "fixtures"]
dependency_graph:
  requires: []
  provides:
    - "Vitest + RTL jsdom environment for *.test.tsx files"
    - "__fixtures__/releases.ts with makeRelease/makeBranchSection/makeConflict"
    - "4 RED test stubs for RC-01/02/03/07"
  affects:
    - "05-02 through 05-05 (each turns one or more tests GREEN)"
tech_stack:
  added:
    - "@testing-library/react ^16.3.2"
    - "@testing-library/user-event ^14.6.1"
    - "@testing-library/jest-dom ^6.9.1"
    - "jsdom ^25.0.1"
  patterns:
    - "environmentMatchGlobs: *.test.tsx → jsdom, *.test.ts → node (default)"
    - "Shared fixture factories with Partial<T> overrides slot"
    - "Intentionally-RED import stubs for TDD Wave 0"
key_files:
  created:
    - "vitest.setup.ts"
    - "src/app/projects/[slug]/releases/__fixtures__/releases.ts"
    - "src/app/projects/[slug]/releases/group-sections.test.ts"
    - "src/app/projects/[slug]/releases/PreviewLink.test.tsx"
    - "src/app/projects/[slug]/releases/ReleasesClient.test.tsx"
    - "src/app/projects/[slug]/releases/BranchSection.test.tsx"
  modified:
    - "package.json (devDependencies)"
    - "package-lock.json"
    - "vitest.config.ts (environmentMatchGlobs added)"
decisions:
  - "environmentMatchGlobs over workspace config — simpler single-file approach, vitest 4.x supports it natively"
  - "vitest.setup.ts at repo root for jest-dom matchers — required by toBeDisabled() / toHaveAttribute() used in Wave 0 stubs"
  - "fixtures import from '../types' intentionally — tests are RED until Plan 05-02 extends ReleaseRow with branch+metadata"
metrics:
  duration: "2 minutes"
  completed_date: "2026-05-05"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 3
---

# Phase 05 Plan 01: Vitest RTL Infrastructure + Red Test Stubs Summary

**One-liner:** Vitest jsdom env via environmentMatchGlobs + 4 intentionally-RED Wave 0 test stubs covering RC-01/02/03/07 with shared fixture factories.

---

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Install RTL devDeps + switch vitest env per file | e6ebd12 | package.json, vitest.config.ts, vitest.setup.ts |
| 2 | Create shared fixtures module | f80b88b | __fixtures__/releases.ts |
| 3 | Create 4 red test stubs | b852238 | group-sections.test.ts, PreviewLink.test.tsx, ReleasesClient.test.tsx, BranchSection.test.tsx |

---

## Verification Results

**Existing test suite:** 76 tests pass (8 test files) — no regressions introduced.

**Wave 0 RED state confirmed:** 4 test file failures, each with a clear pre-implementation reason:

| File | Failure Mode | GREEN in Plan |
|------|-------------|---------------|
| `group-sections.test.ts` | `Cannot find module './group-sections'` | 05-02 |
| `PreviewLink.test.tsx` | `Cannot find module './PreviewLink'` | 05-03 |
| `ReleasesClient.test.tsx` | `TypeError: userEvent.setup()` (no document — `initialSections` prop missing) | 05-04 |
| `BranchSection.test.tsx` | `Cannot find module './BranchSection'` | 05-04 |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None — this plan creates test infrastructure only. No production source files were modified (Wave 0 constraint respected). The fixtures module intentionally references types (`branch`, `metadata` on `ReleaseRow`) that don't exist yet in `types.ts` — this is by design; Plan 05-02 adds them.

---

## Self-Check: PASSED

Files confirmed present:
- vitest.setup.ts: FOUND
- __fixtures__/releases.ts: FOUND
- group-sections.test.ts: FOUND
- PreviewLink.test.tsx: FOUND
- ReleasesClient.test.tsx: FOUND
- BranchSection.test.tsx: FOUND

Commits confirmed:
- e6ebd12: FOUND (chore: install RTL devDeps + switch vitest env)
- f80b88b: FOUND (feat: create shared fixtures module)
- b852238: FOUND (test: add 4 red test stubs)
