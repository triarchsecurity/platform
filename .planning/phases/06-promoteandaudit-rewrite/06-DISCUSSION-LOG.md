# Phase 6: promoteAndAudit Rewrite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 06-promoteandaudit-rewrite
**Mode:** auto (all 4 gray areas auto-resolved with recommended defaults)
**Areas discussed:** Dispatch target & inputs, Branch in approval Slack message, Slack thread tracking, Conflict result reply behavior

---

## Dispatch target & inputs (RC-04)

| Question | Options | Selected |
|----------|---------|----------|
| Workflow file | `promote-branch.yml + {branch}` ✓ / `deploy-prod.yml + {tag}` (legacy) | `promote-branch.yml + {branch}` |
| Dispatch ref | `main` (consumer's branch with stub) ✓ / parameterised | `main` |
| Missing consumer stub | 404 → existing failure path ✓ / pre-flight check | 404 → existing failure path |
| `releaseLogs.promotionDispatchedAt/By` | Keep ✓ / remove (use promote_attempts only) | Keep |

**Auto-selected:** All recommended (RC-04 verbatim; reuses existing failure-path infrastructure; per-approval audit retained).

## Branch in approval Slack message (RC-05)

| Question | Options | Selected |
|----------|---------|----------|
| Branch placement | header `{branch} {version} approved by ...` ✓ / new field / footer | header |
| Null/main rendering | `main` literal ✓ / omit when null | `main` literal (consistency) |
| Promote button payload | include `branch` in `value` JSON ✓ / re-query in handler | include in payload |
| Function shape | extend `notifyReleaseApproved` ✓ / new function | extend |

**Auto-selected:** All recommended. Branch in header is most prominent; payload extension avoids re-query in /api/slack/interact.

## Slack thread tracking for conflict reply

| Question | Options | Selected |
|----------|---------|----------|
| Storage location | `releaseLogs.metadata` JSONB ✓ / new `slackThread` column / promote_attempts schema extension | `releaseLogs.metadata` |
| Write timing | inside `promoteAndAudit` after dispatch attempt ✓ / before dispatch / on Slack interact entry | after dispatch attempt |
| Promote-callback lookup | `(project, branch)` ordered by `deployed_at desc` ✓ / by `release.id` (need to thread through workflow) / via promote_attempts FK | `(project, branch)` lookup |
| Missing metadata on callback | log warning + skip Slack reply, still record attempt ✓ / fail callback / synthesize from project default channel | graceful skip |

**Auto-selected:** All recommended. JSONB avoids schema migration; matches Phase 5's `metadata.previewUrl` precedent. Branch+project lookup is unique enough for the most-recent attempt.

## Conflict result reply behavior (RC-06)

| Question | Options | Selected |
|----------|---------|----------|
| Conflict reply text | `:warning: Cannot promote {branch} — conflicts with main: {file list} Rebase manually...` ✓ (RC-06 verbatim) / minimal `:warning:` only / link to GitHub conflict editor | RC-06 verbatim |
| File list size guard | cap at 50 + `+ N more` ✓ / no cap / external paste link | cap at 50 |
| Symmetric replies for merged/ci_failed | yes — `:white_check_mark:` for merged, `:no_entry:` for ci_failed ✓ / no, only conflict per RC-06 | yes (Claude's discretion — useful symmetry) |
| Concurrent safety (RC-08) | no admin code change; covered by promote-branch.yml rebase + Phase 8 pilot ✓ / add server-side mutex | no admin code change |

**Auto-selected:** All recommended. RC-06 mandates conflict reply; merged/ci_failed are useful follow-ups consistent with the existing dispatch reply pattern.

## Claude's Discretion

- Exact lookup query for promote-callback's metadata read
- Whether to extract a small `dispatchPromote` helper to keep release-promotion.ts under ~150 lines
- Slack message formatting (rich blocks vs plain text)
- Where to update `onboarding-projects.md` for the consumer's local `promote-branch.yml` stub instructions
- Whether to bundle a stub injection helper for consumer repos vs documenting manual creation

## Deferred Ideas

- OttoBot scope expansion (slash commands, app mentions) — Phase 7
- slack_action_audit row writes — Phase 7
- Audit log viewer — Phase 7
- Consumer repo stub injection automation — backlog
- AI-mediated conflict resolution — v3
- Customer-page conflict resolver UI — v3
- Per-project Slack channel routing — v3
- Email lifecycle notifications — v3
- Prod deploy Slack notification — v3
- Reconciliation cron for missed callbacks — out of scope
