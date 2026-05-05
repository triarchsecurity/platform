---
phase: 5
slug: customer-page-rc-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (root) — extend in Wave 0 to add jsdom env for UI tests |
| **Quick run command** | `npx vitest run src/app/projects/\[slug\]/releases` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (UI subset), ~120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/app/projects/\[slug\]/releases`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (UI subset)

---

## Per-Task Verification Map

> The planner will populate Task IDs once plans are created. Test files and verification commands below are pre-bound to requirements per RESEARCH.md §"Validation Architecture".

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | Wave 0 infra | install | `npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | Wave 0 infra | config | edit `vitest.config.ts` to add `environment: 'jsdom'` for `src/app/projects/**/*.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | RC-01 | unit | `npx vitest run src/app/projects/\[slug\]/releases/group-sections.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | RC-02 | unit-rtl | `npx vitest run src/app/projects/\[slug\]/releases/PreviewLink.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | RC-03 | unit-rtl | `npx vitest run src/app/projects/\[slug\]/releases/ReleasesClient.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | RC-07 | unit-rtl | `npx vitest run src/app/projects/\[slug\]/releases/BranchSection.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | server-grouping | unit | `npx vitest run src/app/projects/\[slug\]/releases/page.test.ts` (covers conflict-state derivation) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom` — RTL not currently installed; required for SC-2/SC-3/SC-4
- [ ] `vitest.config.ts` updated to add `environment: 'jsdom'` for `*.test.tsx` files (or workspace config scoping jsdom to UI tests while keeping `node` for API route tests)
- [ ] `src/app/projects/[slug]/releases/group-sections.test.ts` — stubbed test file with shared `makeRelease()` fixture factory (covers RC-01)
- [ ] `src/app/projects/[slug]/releases/PreviewLink.test.tsx` — stubbed test file (covers RC-02)
- [ ] `src/app/projects/[slug]/releases/ReleasesClient.test.tsx` — stubbed test file with two-section / two-row fixture (covers RC-03)
- [ ] `src/app/projects/[slug]/releases/BranchSection.test.tsx` — stubbed test file with conflict fixture (covers RC-07)
- [ ] `src/app/projects/[slug]/releases/__fixtures__/releases.ts` — shared `makeRelease()`, `makeBranchSection()`, `makeConflict()` factories used across all four test files

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual hierarchy of nested expansion (section open + row open) reads correctly across light/dark renders | RC-01 | Pixel-level visual judgment | Open `/projects/{slug}/releases` in admin app for a project with ≥2 branches and ≥1 conflict; expand sections + rows; verify chevron states + spacing |
| Real FAH preview URL opens the actual branch preview deploy | RC-02 | Requires live deploy + DNS propagation | After Phase 2 + Phase 6 wired, click preview URL on a real RC row; confirm correct preview loads |
| Two parallel approvals on different branches both succeed end-to-end (Phase 6 gate) | RC-03 / RC-08 (Phase 6) | Requires running shared-workflows v3 dispatch + GitHub App | Deferred to Phase 8 pilot UAT |
| Conflict badge + helper text wraps gracefully on 375px mobile | RC-07 | Visual judgment at small viewport | Manual at iPhone SE 1st-gen breakpoint; verify badge cluster wraps, file list scrolls |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (RTL install + config + 4 test stubs + fixtures)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (UI subset)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
