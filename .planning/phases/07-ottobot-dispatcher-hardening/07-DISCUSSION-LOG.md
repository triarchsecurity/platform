# Phase 7: OttoBot Dispatcher Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 07-ottobot-dispatcher-hardening
**Mode:** auto (all 4 gray areas auto-resolved with recommended defaults)
**Areas discussed:** Slash command endpoint design, Audit row write strategy, Status response format, Audit log viewer UX

---

## Slash command endpoint design (OTTOBOT-03, OTTOBOT-04)

| Question | Options | Selected |
|----------|---------|----------|
| Endpoint structure | Single `/api/slack/commands` with internal switch ✓ / per-subcommand routes / shared `/api/slack/all` | Single endpoint |
| HMAC verification | Reuse `verifySlackSignature` + `SLACK_SIGNING_SECRET` ✓ / new secret / per-command secret | Reuse existing |
| Response timing | 200 + ephemeral ack within 3s; defer dispatch ✓ / sync dispatch with risk of timeout / queue all to background | 3s ack + defer |
| Empty `/triarch` | Help text ephemeral ✓ / no-op / error | Help text |

## Audit row write strategy (OTTOBOT-01)

| Question | Options | Selected |
|----------|---------|----------|
| Capture location | `recordSlackAudit()` helper called at end of every Slack route ✓ / per-handler inline / Next.js middleware | End of handler |
| Failure handling | console.warn + return 200 anyway ✓ / fail handler / retry async | Best-effort swallow |
| payload_hash | sha256 hex of raw body ✓ / md5 / first 256 chars | sha256 hex |
| actor_email lookup | `slackUserToEmail` from existing slack-identity ✓ / new per-route lookup / cache layer | Reuse existing |

## Status response format (OTTOBOT-04, OTTOBOT-05)

| Question | Options | Selected |
|----------|---------|----------|
| Block kit complexity | Simple sections + dividers ✓ / rich w/ images and buttons / plain mrkdwn | Simple Block Kit |
| Data shown | dev + prod + active RCs (5 capped) + last 3 deploys ✓ / dev/prod only / full release_logs page | All four sections |
| Unknown project | Ephemeral error + top 5 suggestions ✓ / silent / 404 | Error + suggestions |
| Visibility | Ephemeral always ✓ / public always / `--public` flag | Ephemeral |

## Audit log viewer UX (OTTOBOT-06)

| Question | Options | Selected |
|----------|---------|----------|
| Filter dimensions | action_id + actor_email + date range ✓ / just action_id / all columns | Three filters |
| Pagination | Load-more 50/page (Phase 5 pattern) ✓ / numbered pages / infinite scroll | Load-more |
| Row detail | Collapsed; click to expand ✓ / always expanded / drawer panel | Collapsed + expand |
| Default sort | created_at DESC fixed ✓ / asc / user-toggleable | DESC fixed |

---

## Claude's Discretion

- Help text exact wording (preserves listed subcommands)
- Block Kit fields arrangement
- Single-file vs split slash-command implementation
- Event-dedup TTL exact value (~5 min recommended)
- Audit page "Refresh" link or browser-only
- Status badge color tokens (match existing palette)

## Deferred Ideas

- Per-project Slack channel routing — v3
- Email lifecycle notifications — v3
- Prod deploy Slack notification — v3
- Multi-org Slack workspaces — single workspace
- Bulk approve via Slack — out of scope
- `/triarch logs` — out of scope
- AI-summarized status — defer
- Audit log export (CSV/JSON) — backlog
- Interactive Promote button on status — v3
- Per-action_id rate limits — pre-pilot N/A
