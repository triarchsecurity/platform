---
phase: "07"
plan: "02"
subsystem: "ottobot-dispatcher-hardening"
tags: [slack, audit, ottobot, wave-1, tdd]
dependency_graph:
  requires:
    - "07-01 — Wave 0 RED test stubs (slack-audit.test.ts was RED before this plan)"
  provides:
    - "src/lib/slack-audit.ts — recordSlackAudit helper (reusable by plans 07-03, 07-04)"
    - "OTTOBOT-01 closed — every /api/slack/interact return path writes a slack_action_audit row"
  affects:
    - "plans 07-03, 07-04 — can import recordSlackAudit from @/lib/slack-audit without any setup"
tech_stack:
  added: []
  patterns:
    - "Best-effort fire-and-forget audit write (void prefix, try/catch swallow per D-08)"
    - "sha256 hex hash of rawBody before parsing (D-09) — deterministic, bounded row size"
    - "requestReceivedAt = Date.now() at top of handler before req.text() (D-13 latency)"
key_files:
  created:
    - "src/lib/slack-audit.ts"
  modified:
    - "src/app/api/slack/interact/route.ts"
    - "src/lib/__tests__/slack-interact.test.ts"
decisions:
  - "void recordSlackAudit() placed directly before each return (not try/finally) — mechanical insertion avoids reshaping the handler and eliminates regression risk"
  - "Unsupported payload branch uses payload?.user?.id cast fallback before actionId is extracted — slackUserId not yet in scope at that check"
metrics:
  duration: "3 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 1
  files_modified: 2
---

# Phase 07 Plan 02: recordSlackAudit Helper + Interact Route Wiring Summary

Implement OTTOBOT-01: sha256-hashing audit helper and wire it into every return path of the Slack interact dispatcher using fire-and-forget void calls, turning 3 RED tests GREEN and extending the interact test suite with audit assertions.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Implement src/lib/slack-audit.ts (turn 3 RED tests GREEN) | `e4df7c3` | `src/lib/slack-audit.ts` |
| 2 | Wire recordSlackAudit into /api/slack/interact + extend tests | `af31532` | `src/app/api/slack/interact/route.ts`, `src/lib/__tests__/slack-interact.test.ts` |

## Helper File

| Metric | Value |
|--------|-------|
| File | `src/lib/slack-audit.ts` |
| Lines | 55 |
| Exports | `recordSlackAudit` (async function), `SlackAuditInput` (interface) |
| Error handling | try/catch + `console.warn('[slack-audit] audit insert failed...')` — never throws |
| Hash | `createHash('sha256').update(input.rawBody).digest('hex')` — computed before insert, original never stored |

## Interact Route: Audit-Wired Return Paths

| Branch | Synthetic/Extracted actionId | actorEmail | actorSlackId | responseStatus |
|--------|------------------------------|------------|--------------|----------------|
| Invalid Slack signature | `'_sig_failed'` | `null` | `'unknown'` | 401 |
| No payload field | `'_parse_failed'` | `null` | `'unknown'` | 400 |
| Malformed JSON payload | `'_parse_failed'` | `null` | `'unknown'` | 400 |
| Unsupported payload type | `'_parse_failed'` | `null` | `payload?.user?.id ?? 'unknown'` | 400 |
| Registry: unknown action | `actionId` | `null` | `slackUserId ?? 'unknown'` | 200 |
| Registry: handler result | `actionId` | `null` | `slackUserId ?? 'unknown'` | 200 |
| Registry: handler error | `actionId` | `null` | `slackUserId ?? 'unknown'` | 200 |
| Invalid payload signature | `actionId` | `null` | `slackUserId ?? 'unknown'` | 401 |
| Unmapped Slack user | `actionId` | `null` | `slackUserId ?? 'unknown'` | 200 |
| Release not found | `actionId` | `email` | `slackUserId ?? 'unknown'` | 200 |
| Terminal state (already promoted/rejected) | `actionId` | `email` | `slackUserId ?? 'unknown'` | 200 |
| Wrong status (cannot promote) | `actionId` | `email` | `slackUserId ?? 'unknown'` | 200 |
| Promote happy path | `actionId` | `email` | `slackUserId ?? 'unknown'` | 200 |
| Reject failure | `actionId` | `email` | `slackUserId ?? 'unknown'` | 200 |
| Reject success | `actionId` | `email` | `slackUserId ?? 'unknown'` | 200 |

Total `void recordSlackAudit` calls: **15** (>= 13 required by plan)

## Test Counts

| Suite | Before | After | Status |
|-------|--------|-------|--------|
| `slack-audit.test.ts` | 3 RED (Failed to resolve import) | 3 GREEN | Turned GREEN by Task 1 |
| `slack-interact.test.ts` | 12 GREEN | 14 GREEN | +1 sig-failure audit test, +audit assertions on promote happy path |
| Combined | — | 17 GREEN | No regressions |

Pre-existing RED stubs (commands, events, page, SlackAuditClient) unchanged — these are plans 07-03..07-05 scope.

## void Prefix Confirmation

`grep -c "void recordSlackAudit" src/app/api/slack/interact/route.ts` → **15**
`grep "await recordSlackAudit" src/app/api/slack/interact/route.ts` → **0 lines** (no blocking awaits)

## Deviations from Plan

None — plan executed exactly as written. The only minor adaptation was the `unsupported_payload` branch uses `(payload as SlackInteractivePayload | undefined)?.user?.id ?? 'unknown'` because `slackUserId` is not yet extracted at that validation guard (correct behavior per plan's branch table which calls for `slackUserId ?? 'unknown'` where possible).

## Known Stubs

None — all data paths are wired. The `actorEmail: null` fallback on early-return paths is intentional by design (D-10: nullable when user unmapped or not yet parsed).

## Handoff Note

OTTOBOT-01 closed. `recordSlackAudit` is available for:
- `/api/slack/commands` (plan 07-03) — import `{ recordSlackAudit } from '@/lib/slack-audit'`
- `/api/slack/events` (plan 07-04) — same import

The helper is unit-tested (3 GREEN), never throws (D-08 verified by test), and produces deterministic sha256 hashes (D-09 verified by test).

## Self-Check: PASSED
