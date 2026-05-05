---
phase: 07-ottobot-dispatcher-hardening
plan: "04"
subsystem: slack-events-webhook
tags: [slack, events-api, app-mention, dedup, audit, ottobot]
dependency_graph:
  requires: [07-02, 07-03]
  provides: [POST /api/slack/events]
  affects: [slack-audit rows, slack-status shared module]
tech_stack:
  added: []
  patterns: [url_verification-before-hmac, in-memory-dedup-map, slack-3-second-rule, fire-and-forget-reply]
key_files:
  created:
    - src/app/api/slack/events/route.ts
  modified: []
decisions:
  - "url_verification bypasses HMAC entirely — Slack sends it before signing relationship exists (D-19)"
  - "Dedup short-circuits BEFORE recordSlackAudit — duplicate events must not write duplicate audit rows (RESEARCH §7)"
  - "postSlackThreadedReply uses thread_ts parameter name (confirmed from slack.ts line 49)"
  - "req.text() called exactly once at entry point; JSON.parse(rawBody) used everywhere after"
metrics:
  duration_minutes: 5
  completed_date: "2026-05-05"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 07 Plan 04: POST /api/slack/events — OTTOBOT-05 Summary

Implements `POST /api/slack/events`: the Slack Events API webhook that lets `@OttoBot status <project>` mentions in any channel return the same Block Kit as `/triarch status` (unified data path via `src/lib/slack-status.ts` from plan 07-03).

## Response Paths Table

| Trigger | Status | Audit actionId | Notes |
|---|---|---|---|
| JSON parse failure | 400 | `_parse_failed` | Malformed body |
| `type=url_verification` | 200 | `event_url_verification` | Challenge returned; HMAC bypassed (D-19) |
| HMAC signature invalid | 401 | `_sig_failed` | tampered/stale/missing sig |
| `type!=event_callback` or no event | 200 | `event_unsupported` | Polite ack |
| Duplicate `event_id` | 200 | _none_ | Dedup short-circuit before audit |
| `app_mention status <project>` (found) | 200 | `event_app_mention_status` | Threaded reply with Block Kit |
| `app_mention status <project>` (not found) | 200 | `event_app_mention_status` | Threaded reply with hint |
| `app_mention status` (no project arg) | 200 | `event_app_mention_help` | Usage hint in thread |
| `app_mention <unknown>` | 200 | `event_app_mention_help` | Help text in thread |
| Other event types | 200 | `event_unsupported` | Polite ack |

## Dedup Behavior

- Map: `Map<string, number>` — key = `event_id`, value = insertion timestamp
- Capacity: `DEDUP_MAX = 1000` entries
- Eviction: FIFO via `Map.keys().next()` (insertion order preserved by JS Map)
- On duplicate: return `{ ok: true, dedup: true }` immediately — no handler invoked, no audit row
- Export: `resetDedupForTests()` clears the map for deterministic vitest runs

## url_verification Placement (CONTEXT D-19)

Line 117: `if (body.type === 'url_verification')` check
Line 120: `verifySlackSignature(...)` call

`url_verification` is handled **7 lines before** the HMAC verify call. The JSON parse (which extracts `body.type`) is the only prerequisite.

## Shared Status Module Confirmation

```
import { fetchProjectStatus, buildStatusBlocks, listProjectKeys } from '@/lib/slack-status';
```

No Block Kit builder logic is duplicated. Both `/triarch status` (slash command) and `@OttoBot status` (events) consume the same `src/lib/slack-status.ts` module from plan 07-03.

## Test Counts

| Suite | Result |
|---|---|
| `src/app/api/slack/events/route.test.ts` (07-04) | 5 / 5 PASSED |
| `src/lib/__tests__/slack-audit.test.ts` (07-02) | all PASSED |
| `src/lib/__tests__/slack-interact.test.ts` (07-01) | all PASSED |
| `src/app/api/slack/commands/route.test.ts` (07-03) | all PASSED |

**Total regression tests: 23 passed, 0 failed.**

TypeScript errors at `npx tsc --noEmit` are limited to `src/app/admin/platform/slack-audit/SlackAuditClient` — the parallel agent (07-05) RED stubs awaiting implementation. No errors in `src/app/api/slack/events/route.ts`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `postSlackThreadedReply` wired to real `@/lib/slack` helper; `fetchProjectStatus` + `buildStatusBlocks` wired to real DB-backed `@/lib/slack-status`; all audit calls use real `@/lib/slack-audit`.

## Handoff Note

OTTOBOT-05 closed. `/admin/platform/slack-audit` UI + `/api/admin/slack-audit` API (plan 07-05) and onboarding doc + sidebar seed (plan 07-06) remain.

## Self-Check: PASSED

- `src/app/api/slack/events/route.ts` — EXISTS
- Commit `a64bc6d` — EXISTS (feat(07-04): implement POST /api/slack/events — OTTOBOT-05)
- 5 tests GREEN — CONFIRMED
- 23 regression tests GREEN — CONFIRMED
- `url_verification` at line 117, `verifySlackSignature` at line 120 — CONFIRMED
- `DEDUP_MAX = 1000` — CONFIRMED
- `from '@/lib/slack-status'` import — CONFIRMED
- `void recordSlackAudit` at 9 call sites — CONFIRMED
- `req.text()` called once (line 74; count of 2 includes a comment) — CONFIRMED
