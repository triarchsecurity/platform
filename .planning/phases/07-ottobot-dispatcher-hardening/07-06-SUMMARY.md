---
phase: 07-ottobot-dispatcher-hardening
plan: "06"
subsystem: seed-docs
tags: [slack-audit, nav-seed, onboarding, human-uat, ottobot]
dependency_graph:
  requires: [07-05]
  provides: [OTTOBOT-02-docs, OTTOBOT-06-nav-seed]
  affects: [phase-07-verify-work]
tech_stack:
  added: []
  patterns:
    - "Idempotent SQL seed via INSERT INTO ... SELECT ... ON CONFLICT DO NOTHING"
    - "DB-driven nav: menu_pages row required to surface page in AdminSidebar (no component edit needed)"
    - "HUMAN-UAT runbook pattern for Slack App scope upgrades"
key_files:
  created:
    - scripts/seed-slack-audit-nav.sql
    - .planning/phases/07-ottobot-dispatcher-hardening/07-HUMAN-UAT.md
  modified:
    - docs/onboarding-projects.md
decisions:
  - "AdminSidebar is DB-driven: nav entry added via SQL INSERT not component edit (RESEARCH §10 + Pitfall 10)"
  - "min_role='staff' on menu_pages row — DynamicSidebar role gate + page-level isStaff check are defense in depth"
  - "Seed uses SELECT from menu_sections WHERE project='triarch-dev' AND key='platform' — zero-row-safe (ON CONFLICT handles duplicates; no rows on WHERE mismatch = zero error but zero-row SELECT triggers visible failure in verify query)"
  - "SLACK_BOT_TOKEN does NOT need rotation on workspace reinstall unless Slack issues a new token (CONTEXT D-22)"
  - "Task 3 checkpoint auto-approved (auto chain active) — HUMAN-UAT items deferred to manual operator runbook"
metrics:
  duration: "~5 minutes"
  completed: "2026-05-05T18:38:00Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
  tests_added: 0
  tests_turned_green: 0
---

# Phase 07 Plan 06: Nav Seed + Docs + HUMAN-UAT Summary

One-liner: Idempotent SQL seed for OTTOBOT-06 sidebar nav, onboarding Step 10 documenting OttoBot scope upgrade, and Phase 7 HUMAN-UAT checklist covering all manual verification items.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create scripts/seed-slack-audit-nav.sql | 1de85c2 | scripts/seed-slack-audit-nav.sql |
| 2 | Update docs/onboarding-projects.md with OttoBot scope upgrade procedure | 5041276 | docs/onboarding-projects.md |
| 3 | Create 07-HUMAN-UAT.md (auto-approved — checkpoint deferred to operator runbook) | 993184f | .planning/phases/07-ottobot-dispatcher-hardening/07-HUMAN-UAT.md |

## Files Created / Modified

| File | Role |
|------|------|
| `scripts/seed-slack-audit-nav.sql` | Idempotent INSERT for OTTOBOT-06 menu_pages nav row; Mike applies post-merge via Firebase secret + psql |
| `docs/onboarding-projects.md` | Added Step 10: OttoBot scope upgrade procedure (75 lines) covering 3 scopes, slash cmd URL, Events API URL, reinstall, token rotation, smoke test |
| `.planning/phases/07-ottobot-dispatcher-hardening/07-HUMAN-UAT.md` | 6-step manual checklist covering seed apply, staff nav, non-staff gate, scope upgrade, e2e smoke, filter pagination |

## Seed File Details

- **Path:** `scripts/seed-slack-audit-nav.sql`
- **Idempotency token:** `ON CONFLICT (section_id, key) DO NOTHING`
- **Unique index targeted:** `menu_pages_section_key_idx` on `(section_id, key)`
- **Section lookup:** `SELECT id FROM menu_sections WHERE project='triarch-dev' AND key='platform'`
- **Nav entry seeded:** path=`/admin/platform/slack-audit`, label=`Slack Audit`, icon=`shield-check`, min_role=`staff`, sort_order=100

## Onboarding Doc Step Added

- **Step number:** Step 10 (next sequential after existing Step 9)
- **Heading:** "OttoBot Slack App scope upgrade + endpoint URL configuration"
- **Contains:** 8-sub-step procedure (scopes, slash cmd, events API, reinstall, token rotation, smoke test, audit row confirmation)
- **Scopes documented:** `chat:write.public`, `app_mentions:read`, `commands`
- **URLs documented:** `/api/slack/commands`, `/api/slack/events`
- **D-22 note:** Token rotation only required if Slack issues a new token on reinstall

## HUMAN-UAT Checklist Summary

File: `.planning/phases/07-ottobot-dispatcher-hardening/07-HUMAN-UAT.md`

| Step | Action | Covers |
|------|--------|--------|
| 1 | Apply seed-slack-audit-nav.sql via Firebase secret + psql | OTTOBOT-06 |
| 2 | Confirm staff user sees Slack Audit nav in sidebar | OTTOBOT-06 |
| 3 | Confirm non-staff cannot see nav or access page directly | OTTOBOT-06 |
| 4 | Upgrade OttoBot Slack App scopes per onboarding Step 10 | OTTOBOT-02 |
| 5 | End-to-end smoke test (/triarch, @OttoBot, audit rows) | OTTOBOT-02/03/04/05 |
| 6 | Filter + pagination smoke test on /admin/platform/slack-audit | OTTOBOT-06 |

## No Production Source Code Changes

This plan emits documentation and seed files only. Zero changes in `src/`. All 126 prior tests remain GREEN (20 test files).

## Checkpoint Handling

Task 3 (`checkpoint:human-verify`) was **auto-approved** per auto-chain mode. HUMAN-UAT items are deferred to the operator runbook in `07-HUMAN-UAT.md`. Mike completes the 6-step checklist post-merge and updates `status: pending` to `status: complete` before running `/gsd:verify-work` for Phase 7.

## Handoff Note

Phase 7 plans are complete. All 6 OTTOBOT code deliverables have been implemented across plans 07-01 through 07-05. This final plan (07-06) provides the human runbook. After Mike completes the HUMAN-UAT checklist, `/gsd:verify-work 7` can close all 6 OTTOBOT requirements.

## Deviations from Plan

None — plan executed exactly as written. Task 3 checkpoint auto-approved per auto-chain mode (documented in success criteria).

## Known Stubs

None. This plan contains no production source code.

## Self-Check: PASSED

Files exist:
- FOUND: scripts/seed-slack-audit-nav.sql
- FOUND: docs/onboarding-projects.md (modified)
- FOUND: .planning/phases/07-ottobot-dispatcher-hardening/07-HUMAN-UAT.md

Commits verified:
- FOUND: 1de85c2 (chore(07-06): add idempotent menu_pages seed for /admin/platform/slack-audit nav entry)
- FOUND: 5041276 (docs(07-06): add Step 10 OttoBot Slack App scope upgrade procedure to onboarding runbook)
- FOUND: 993184f (docs(07-06): create Phase 7 HUMAN-UAT checklist for OTTOBOT-02 and OTTOBOT-06)
