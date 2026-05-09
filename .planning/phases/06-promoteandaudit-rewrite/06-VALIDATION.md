---
phase: 6
slug: promoteandaudit-rewrite
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (root) — `environment: 'jsdom'` global since Phase 5 |
| **Quick run command** | `npx vitest run src/lib/release-promotion src/app/api/platform/promote-callback src/app/api/projects/\[slug\]/releases/\[releaseId\]/approve src/lib/__tests__/release-concurrent src/lib/__tests__/slack-notify` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds (Phase 6 subset), ~120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run the Phase 6 subset command
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds (Phase 6 subset)

---

## Per-Task Verification Map

> Task IDs populated by planner. Test files and verification commands below are pre-bound to requirements per RESEARCH.md §"Validation Architecture".

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | 06-01 | 1 | RC-04 | unit | `npx vitest run src/lib/release-promotion.test.ts` | ✅ extend | ⬜ pending |
| TBD | 06-02 | 1 | RC-05 (server) | unit | `npx vitest run src/app/api/projects/\[slug\]/releases/\[releaseId\]/approve/route.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 06-02 | 1 | RC-05 (slack) | unit | `npx vitest run src/lib/__tests__/slack-notify.test.ts` | ❌ W0 | ⬜ pending |
| TBD | 06-03 | 2 | RC-06 | unit | `npx vitest run src/app/api/platform/promote-callback/route.test.ts` | ✅ extend | ⬜ pending |
| TBD | 06-04 | 2 | RC-08 | integration | `npx vitest run src/lib/__tests__/release-concurrent.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts` (NEW) — assert `notifyReleaseApproved` called with `branch` field; mock `@/lib/slack`
- [ ] `src/lib/__tests__/slack-notify.test.ts` (NEW) — unit-test `notifyReleaseApproved` message header format with branch + null branch fallback
- [ ] `src/lib/__tests__/release-concurrent.test.ts` (NEW) — two parallel `approveRelease` calls on different branches; assert independent state
- [ ] No new devDeps — RTL/jsdom/Vitest already installed from Phase 5 Wave 0

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `promote-branch.yml` dispatched against a consumer repo with the local stub | RC-04 | Requires GitHub App + a consumer repo with `.github/workflows/promote-branch.yml` stub | Phase 8 Truth+Treason pilot — UAT |
| OttoBot Slack message with branch name visible in `#release-approvals` | RC-05 | Requires real Slack workspace + bot token | Trigger an approval in admin UI; verify Slack render |
| Conflict threaded reply visible in Slack thread when promote-branch.yml returns conflict | RC-06 | Requires real workflow run hitting a conflict | Phase 8 pilot — seed two branches with conflicting changes |
| Two parallel approvals end-to-end leave main with both feature commits | RC-08 | Requires real GitHub merge + CI runs | Phase 8 pilot — PILOT-02 explicit test scenario |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s (Phase 6 subset)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
