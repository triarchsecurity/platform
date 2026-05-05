---
phase: "07"
plan: "01"
subsystem: "ottobot-dispatcher-hardening"
tags: [slack, testing, wave-0, fixtures, red-tests]
dependency_graph:
  requires: []
  provides:
    - "src/lib/__tests__/__fixtures__/slack.ts — shared Slack fixture factory (Wave 0 contract)"
    - "5 RED test stubs that turn GREEN in plans 07-02..07-05"
  affects:
    - "plans 07-02, 07-03, 07-04, 07-05 — each has a pre-existing RED test file"
tech_stack:
  added: []
  patterns:
    - "HMAC-signed Request builder (v0:ts:rawBody base string) matching verifySlackSignature contract"
    - "vi.mock factory stubs for Drizzle chainable db queries"
    - "Dynamic import pattern (await import()) for RED tests — defers resolution to runtime"
key_files:
  created:
    - "src/lib/__tests__/__fixtures__/slack.ts"
    - "src/lib/__tests__/slack-audit.test.ts"
    - "src/app/api/slack/commands/route.test.ts"
    - "src/app/api/slack/events/route.test.ts"
    - "src/app/admin/platform/slack-audit/page.test.tsx"
    - "src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx"
  modified: []
decisions:
  - "Wave 0 uses dynamic import (await import()) rather than static top-level import for production modules — this defers resolution to test runtime so tests fail with 'Failed to resolve import' rather than crashing at module parse time"
  - "redirectMock typed as vi.fn((_url: string) => ...) with explicit parameter to satisfy TypeScript; no type errors in test files"
  - "All 5 RED test files share vi.mock('@/lib/slack-audit') stubs — aligns with plan 07-02 being the first to create the real module"
metrics:
  duration: "3 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 6
  files_modified: 0
---

# Phase 07 Plan 01: Wave 0 Slack Test Infrastructure Summary

Wave 0 fixture factory + 5 RED test stubs for OttoBot dispatcher hardening — all source paths unresolved until plans 07-02..07-05 implement them.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create shared Slack fixture factory | `395d619` | `src/lib/__tests__/__fixtures__/slack.ts` |
| 2 | Create RED test stubs (5 files) | `60155db` | `slack-audit.test.ts`, `commands/route.test.ts`, `events/route.test.ts`, `page.test.tsx`, `SlackAuditClient.test.tsx` |

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/__tests__/__fixtures__/slack.ts` | 121 | Shared fixture factory: `makeSlashCommandPayload`, `makeEventPayload`, `makeSlackInteractPayload`, `buildSignedSlackRequest` |
| `src/lib/__tests__/slack-audit.test.ts` | 97 | RED — 3 tests for `recordSlackAudit` helper (plan 07-02 turns GREEN) |
| `src/app/api/slack/commands/route.test.ts` | 220 | RED — 6 tests for POST /api/slack/commands (plan 07-03 turns GREEN) |
| `src/app/api/slack/events/route.test.ts` | 175 | RED — 5 tests for POST /api/slack/events (plan 07-04 turns GREEN) |
| `src/app/admin/platform/slack-audit/page.test.tsx` | 93 | RED — 2 tests for SlackAuditPage RSC (plan 07-05 turns GREEN) |
| `src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` | 97 | RED — 4 tests for SlackAuditClient component (plan 07-05 turns GREEN) |

## RED State Verification

Each test file was run with `npx vitest run <path>` and confirmed to fail:

| File | Error |
|------|-------|
| `slack-audit.test.ts` | `Failed to resolve import "@/lib/slack-audit"` |
| `commands/route.test.ts` | `Failed to resolve import "@/app/api/slack/commands/route"` |
| `events/route.test.ts` | `Failed to resolve import "@/app/api/slack/events/route"` |
| `page.test.tsx` | `Failed to resolve import "@/app/admin/platform/slack-audit/page"` |
| `SlackAuditClient.test.tsx` | `Failed to resolve import "@/app/admin/platform/slack-audit/SlackAuditClient"` |

## TypeScript Check

`npx tsc --noEmit` — only "Cannot find module" errors for production source paths (the intended RED state). Zero type errors in the test files themselves.

## Existing Tests (no regression)

45 tests from prior phases still passing after both commits.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed TypeScript error in page.test.tsx**
- **Found during:** Task 2 TypeScript verification
- **Issue:** `redirectMock = vi.fn(() => { throw ... })` was inferred as `() => never` — TypeScript rejected the call `redirectMock(url)` with "Expected 0 arguments, but got 1"
- **Fix:** Changed to `vi.fn((_url: string) => { throw ... })` with explicit `_url` parameter
- **Files modified:** `src/app/admin/platform/slack-audit/page.test.tsx`
- **Commit:** Included in `60155db`

## Handoff Note

Wave 0 complete. Plans 07-02..07-05 may now turn their respective test files GREEN:
- **Plan 07-02:** Implement `src/lib/slack-audit.ts` → turns `slack-audit.test.ts` GREEN
- **Plan 07-03:** Implement `src/app/api/slack/commands/route.ts` → turns `commands/route.test.ts` GREEN
- **Plan 07-04:** Implement `src/app/api/slack/events/route.ts` → turns `events/route.test.ts` GREEN
- **Plan 07-05:** Implement `src/app/admin/platform/slack-audit/page.tsx` + `SlackAuditClient.tsx` → turns both viewer test files GREEN

## Self-Check: PASSED
