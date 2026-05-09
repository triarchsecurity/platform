---
phase: 23
slug: bug-feature-customer-surface
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
last_updated: 2026-05-09
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

This phase ships entirely in the portal repo (admin gets docs commits only). Every requirement maps to at least one Vitest test file. Wave 0 work (test-file scaffolding) is folded into each task's TDD cycle — no separate Wave 0 plan needed since portal's vitest infrastructure already exists from Phase 18-22 (jsdom env, RTL, alias `@/` → `portal/src/`, setup file with `afterEach(cleanup)`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + jsdom + RTL 16.3.2 |
| **Config file** | `/Users/mikegeehan/claude/triarch/development/portal/vitest.config.ts` (alias `@/` → `portal/src/`) |
| **Setup file** | `/Users/mikegeehan/claude/triarch/development/portal/vitest.setup.ts` (afterEach cleanup wired in 21-02) |
| **Quick run command** | `cd /Users/mikegeehan/claude/triarch/development/portal && npx vitest run <pattern>` |
| **Full suite command** | `cd /Users/mikegeehan/claude/triarch/development/portal && npx vitest run` |
| **Build command** | `cd /Users/mikegeehan/claude/triarch/development/portal && npx next build` |
| **Estimated runtime** | ~10-15 sec full suite (167 baseline + ~120 new ≈ 290 tests) |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted vitest pattern (per-task command in the verify map below).
- **After every plan completion (PR ready):** Run full portal vitest suite + `npx next build`.
- **Before `/gsd:verify-work`:** Full portal suite GREEN + admin re-run sanity (no admin code changed in Phase 23, so admin should be no-op).
- **Max feedback latency:** ~15 sec (full suite) per Phase 22 precedent.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | BUG-02, FEAT-02 (foundation) | RTL component | `cd portal && npx vitest run src/components/ReleasedInSidebar.test.tsx` | ❌ W0 (created in this task) | ⬜ pending |
| 23-01-02 | 01 | 1 | BUG-01, FEAT-01 (foundation) | RTL component + source-inspect | `cd portal && npx vitest run src/components/StatusPill.test.tsx` | ❌ W0 (created in this task) | ⬜ pending |
| 23-02-01 | 02 | 2 | BUG-01 | server component test + RTL | `cd portal && npx vitest run src/app/projects/[slug]/bugs/page.test.tsx src/app/projects/[slug]/bugs/BugListClient.test.tsx` | ❌ W0 (created in this task) | ⬜ pending |
| 23-02-02 | 02 | 2 | BUG-02 | server component test | `cd portal && npx vitest run src/app/projects/[slug]/bugs/[id]/page.test.tsx` | ❌ W0 (created in this task) | ⬜ pending |
| 23-03-01 | 03 | 2 | FEAT-01 | server component test + RTL | `cd portal && npx vitest run src/app/projects/[slug]/features/page.test.tsx src/app/projects/[slug]/features/FeatureListClient.test.tsx` | ❌ W0 (created in this task) | ⬜ pending |
| 23-03-02 | 03 | 2 | FEAT-02 | server component test | `cd portal && npx vitest run src/app/projects/[slug]/features/[id]/page.test.tsx` | ❌ W0 (created in this task) | ⬜ pending |
| 23-04-01 | 04 | 3 | BUG-03, FEAT-03 (Slack helpers) | unit + fetch mock | `cd portal && npx vitest run src/lib/portal-slack.test.ts` | ⚠️ EXTEND (existing file from 22-04) | ⬜ pending |
| 23-04-02 | 04 | 3 | BUG-03, FEAT-03 (POST routes) | route test + invocationCallOrder | `cd portal && npx vitest run src/app/api/projects/[slug]/bugs/route.test.ts src/app/api/projects/[slug]/features/route.test.ts` | ❌ W0 (created in this task) | ⬜ pending |
| 23-04-03 | 04 | 3 | BUG-03, FEAT-03 (form pages) | RTL + user-event + fetch mock | `cd portal && npx vitest run src/app/projects/[slug]/bugs/new src/app/projects/[slug]/features/new` | ❌ W0 (created in this task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Per-Requirement Test Map

| Req ID | Behavior | Test File(s) | Cases |
|--------|----------|-------------|-------|
| BUG-01 | Membership-scoped bug list with status pills | `bugs/page.test.tsx`, `bugs/BugListClient.test.tsx` | 12 (auth, project-not-found, member 404, populated list, status filter narrows query, Pitfall 4 cross-project URL ignore, pagination sentinel, BugListClient chip URL replace, no client fetch, active styling, clear, pill render) |
| BUG-02 | Bug detail with ReleasedInSidebar; staff fields hidden | `bugs/[id]/page.test.tsx`, `ReleasedInSidebar.test.tsx` | 12 + 6 = 18 (auth/found/cross-project notFound/triarchNotes hidden/fixCommitSha hidden/sidebar populated/sidebar empty/severity displayed/no-use-client + sidebar's own 6 cases) |
| BUG-03 | Bug submission POST + form | `bugs/route.test.ts`, `bugs/new/BugForm.test.tsx`, `portal-slack.test.ts` (extension) | 15 + 9 + ~4 (extension cases for bug helper) = ~28 |
| FEAT-01 | Membership-scoped feature list with 9-status filter | `features/page.test.tsx`, `features/FeatureListClient.test.tsx` | 12 (mirror BUG-01 + features-specific 9-status assertion) |
| FEAT-02 | Feature detail with ReleasedInSidebar; 4 staff fields hidden | `features/[id]/page.test.tsx` | 16 (auth/found/cross-project/4 staff-fields-hidden/useCase rendered when set/useCase hidden when null/sidebar populated/sidebar empty/priority/no-use-client) |
| FEAT-03 | Feature submission POST + form | `features/route.test.ts`, `features/new/FeatureForm.test.tsx`, `portal-slack.test.ts` (extension) | 15 + 9 + ~5 (extension cases for feature helper) = ~29 |
| **Cross-cutting** | Pitfall 5 — sidebar Link href fork | `ReleasedInSidebar.test.tsx` Test 5 | 1 |
| **Cross-cutting** | Pitfall 9 — no admin Block Kit action_ids | `portal-slack.test.ts` EXT-4 + EXT-8 | 2 |
| **Cross-cutting** | Pitfall 10 — sanitize-at-boundary | `portal-slack.test.ts` EXT-3 | 1 |
| **Cross-cutting** | Pitfall 11 — color-map drift guard (StatusPill encapsulation) | `StatusPill.test.tsx` | 6 cases prove single-source-of-truth |
| **Cross-cutting** | Slack-before-response ordering (Phase 22-04 envelope) | `bugs/route.test.ts` Test 11, `features/route.test.ts` Test FEAT-11 | 2 |
| **Cross-cutting** | RESEARCH.md OQ-2 — slack_message_ts UPDATE on success | `bugs/route.test.ts` Test 14, `features/route.test.ts` Test FEAT-14 | 2 |

**Total new vitest cases across Phase 23:** ~120 (12 from 23-01 + 24 from 23-02 + 28 from 23-03 + ~57 from 23-04). Portal baseline 167 + ~120 = ~287 expected at phase close.

---

## Wave 0 Requirements

All "Wave 0" work is folded into each plan's TDD cycle (tests written before/with implementation). No separate Wave 0 plan needed — portal's existing vitest infrastructure is sufficient:

- [x] No framework install needed — Vitest 4.1.5 already in portal `devDependencies`
- [x] Vitest config + setup already exist (`portal/vitest.config.ts`, `portal/vitest.setup.ts`)
- [x] No new shimMap entries needed — `auth-context`, `release-history`, `schema`, `sanitize-commit` already in `@myalterlego/triarch-shared@^0.3.0` and consumed by Phase 21+22
- [x] No mock infrastructure additions — existing patterns from Phase 21 (server-component tests with `vi.mock` for `next/navigation`, `getPortalSession`, `getCurrentUserContext`, db chain, drizzle-orm operators) carry over verbatim

Test files created (each plan creates its own — no cross-plan dependency):
- 23-01: `portal/src/components/ReleasedInSidebar.test.tsx`, `portal/src/components/StatusPill.test.tsx`
- 23-02: `portal/src/app/projects/[slug]/bugs/page.test.tsx`, `portal/src/app/projects/[slug]/bugs/BugListClient.test.tsx`, `portal/src/app/projects/[slug]/bugs/[id]/page.test.tsx`
- 23-03: `portal/src/app/projects/[slug]/features/page.test.tsx`, `portal/src/app/projects/[slug]/features/FeatureListClient.test.tsx`, `portal/src/app/projects/[slug]/features/[id]/page.test.tsx`
- 23-04: `portal/src/app/api/projects/[slug]/bugs/route.test.ts`, `portal/src/app/api/projects/[slug]/features/route.test.ts`, `portal/src/app/projects/[slug]/bugs/new/BugForm.test.tsx`, `portal/src/app/projects/[slug]/features/new/FeatureForm.test.tsx`. EXTEND `portal/src/lib/portal-slack.test.ts` (existing from 22-04).

---

## Manual-Only Verifications

Live deploy verifications that cannot be fully automated (require post-merge dev backend deploy):

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Customer signs in to portal-dev → submits a real bug → row appears in CRDB `bug_reports` with correct project + reporter; Slack message lands in `#triarch-bugs-test` within 3 sec; redirect to detail page shows the bug; sidebar empty | BUG-03 | Requires live OAuth + live Slack + live FAH backend redeploy | Open https://portal-dev.triarch.dev/projects/{slug}/bugs/new; fill title + description; submit; verify CRDB row via direct query (or admin staff page); verify Slack post landed; verify redirect URL contains the new bug id |
| Same flow for features | FEAT-03 | Same | Open `/projects/{slug}/features/new`; fill title + description + useCase; submit; verify CRDB row + Slack in `#triarch-features-test` + redirect |
| Cross-project POST attempt returns 404 with no row | BUG-03, FEAT-03 | Requires authenticated session for one project + curl/postman against another | curl with portal cookie to `/api/projects/B/bugs` POST while user is member of project A → expect 404; verify no row in CRDB |
| Bug created via portal then staff triages in admin → customer detail page reflects new status pill + ReleasedInSidebar shows release version once `release_log_links` row stamps | BUG-02, FEAT-02 | Requires admin staff PATCH + dev deploy + Phase 11 commit-parser link stamping | After portal submission, open admin `/admin/modules/bug-reports/[id]`, PATCH status to 'fixed' + set fix_version; deploy a dev release referencing the bug; verify customer detail page shows new status + sidebar populates |
| Mobile (375px viewport): list page renders correctly; submission form usable; detail page sidebar collapses below main content (lg: breakpoint) | BUG-01..03, FEAT-01..03 | Requires browser devtools at 375px width | Chrome devtools → device toolbar → 375px → walk through list / detail / submit on portal-dev |
| Cross-project read attempt: customer for project A → /projects/B/bugs → 404 (membership 404-not-403) | BUG-01, FEAT-01 | Requires authenticated session | Same as POST cross-project but for GET |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify blocks per plan
- [x] Sampling continuity: every task in every plan has automated tests; no 3-task gap
- [x] Wave 0 covers all MISSING references (folded into each plan's TDD cycle; no separate Wave 0 plan needed since portal infrastructure exists)
- [x] No watch-mode flags — every command uses `npx vitest run` (one-shot)
- [x] Feedback latency < 23s (portal full suite ~10-15s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-09
