# Phase 6: promoteAndAudit Rewrite - Context

**Gathered:** 2026-05-05 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Modify the v1.14 approval/promotion flow so it dispatches the branch-aware `promote-branch.yml` workflow (Phase 4) instead of `deploy-prod.yml`, surfaces the branch name in OttoBot's approval Slack message, and posts a threaded `:warning:` reply when the rebase produces a conflict. Concurrent multi-branch approvals must leave `main` containing both feature sets — the actual rebase guarantee comes from `promote-branch.yml`, so admin's job here is to dispatch correctly and round-trip the conflict signal.

**In scope:**
- `src/lib/release-promotion.ts` — change `dispatchWorkflow` target from `deploy-prod.yml + {tag}` to `promote-branch.yml + {branch}` (RC-04)
- `src/lib/slack.ts notifyReleaseApproved` — include `branch` in approval Slack message (RC-05)
- `src/lib/release-promotion.ts promoteAndAudit` — store Slack `channel_id` + `message_ts` on `release_logs.metadata` at dispatch time so promote-callback can post threaded replies later
- `src/app/api/platform/promote-callback/route.ts` — when `result='conflict'`, post threaded `:warning:` reply with file list + rebase hint (RC-06); also (Claude's discretion) post `:white_check_mark:` for `merged` and `:no_entry:` for `ci_failed`
- Concurrent safety (RC-08) — verified via integration test / Phase 8 pilot; no admin code change required

**Out of scope:**
- Schema changes — none
- Customer-page UI — Phase 5 already shipped the conflict badge / hidden-approve / per-RC button
- shared-workflows changes — Phase 4 already shipped `promote-branch.yml@v3`
- Consumer repo's local `promote-branch.yml` stub — must be added per consumer; documented in onboarding-projects.md update (Claude's discretion whether to bundle this with Phase 6 or defer to Phase 8 pilot)
- OttoBot scope expansion (slash commands, app mentions) — Phase 7
- Audit log viewer — Phase 7

</domain>

<decisions>
## Implementation Decisions

### Dispatch target & inputs (RC-04)

- **D-01:** `promoteAndAudit` calls `dispatchWorkflow({ owner, repo, workflowFile: 'promote-branch.yml', ref: 'main', inputs: { branch: release.branch ?? 'main' } })`. The `tag: release.version` input is removed (was deploy-prod.yml's contract; promote-branch.yml takes branch instead).
- **D-02:** `ref: 'main'` — the consumer's `main` branch holds the local `promote-branch.yml` stub that calls `MyAlterLego/shared-workflows/.github/workflows/promote-branch.yml@v3` via `workflow_call`.
- **D-03:** If the consumer repo doesn't have the local `promote-branch.yml` stub, `dispatchWorkflow` returns 404. The existing failure path (`postSlackThreadedReply` + `updateSlackMessage` with `PROMOTION_FAILED_MSG_TEMPLATE`) handles this — no special pre-flight check needed.
- **D-04:** Keep the existing `releaseLogs.promotionDispatchedAt` + `promotionDispatchedBy` audit columns and write them at dispatch time (matches v1.14 behavior). The `promote_attempts` table (Phase 4) holds per-attempt detail; these two are per-approval audit.

### Branch in approval Slack message (RC-05)

- **D-05:** Update `notifyReleaseApproved` signature to accept `branch: string | null`. Render branch in the message header: `{branch} {version} approved by {approverEmail}`. Null branch → render as `main`.
- **D-06:** The OttoBot dispatch button payload (`value` JSON in the Slack action block) must include the `branch` field so when staff clicks "Promote to Production" in Slack, `/api/slack/interact` can pass `branch` through to `promoteAndAudit` without re-querying the DB.
- **D-07:** `notifyReleaseApproved` extension is a single function update (not a new function) — preserves the single notification entrypoint.

### Slack thread tracking for conflict reply

- **D-08:** Persist Slack `channel_id` + `message_ts` on `release_logs.metadata` JSONB. Field names: `metadata.dispatch.slackChannelId`, `metadata.dispatch.slackMessageTs`, `metadata.dispatch.dispatchedAt`. **No schema change** — Phase 5 already established the `metadata` JSONB usage precedent (`metadata.previewUrl`).
- **D-09:** Write happens inside `promoteAndAudit` immediately after the dispatch attempt (success or failure). The `channelId` + `messageTs` come from the inbound Slack interact payload that already exists in `PromoteAndAuditInput`.
- **D-10:** Promote-callback lookup: query `release_logs` filtered by `(project, branch)` ordered by `deployed_at desc, released_at desc` and take the first row. Read `metadata.dispatch.slackChannelId` + `metadata.dispatch.slackMessageTs` for the threaded reply target.
- **D-11:** If the metadata fields are missing on callback (e.g., a workflow_dispatch fired manually outside the admin flow), log a warning and skip the Slack reply but still record the `promote_attempts` row. Promote-callback's primary job (record the attempt) must never fail because Slack metadata is missing.

### Conflict result reply behavior (RC-06)

- **D-12:** Conflict reply text:
  ```
  :warning: Cannot promote {branch} — conflicts with main:
  ```
  followed by a code-block file list (capped at 50 paths; if the list is longer, append `\n+ N more files` after the cap), followed by a blank line, followed by `Rebase manually on main, push as a new RC to retry.`
- **D-13:** Symmetric replies for the other two result values (Claude's discretion — useful follow-ups even though not RC-06 strict scope):
  - `result='merged'` → `:white_check_mark: Promoted {branch} to main (sha: {merge_sha[:7]})`
  - `result='ci_failed'` → `:no_entry: CI failed for {branch} — see {ci_run_url}`
- **D-14:** Threaded reply target: `channel = metadata.dispatch.slackChannelId`, `thread_ts = metadata.dispatch.slackMessageTs`. Uses the existing `postSlackThreadedReply` helper from `src/lib/slack.ts`.
- **D-15:** Slack reply is **best effort** — `try/catch` around the post; on failure, log a warning and continue. The `promote_attempts` row insertion is the source of truth for the result; the Slack reply is a notification.

### Concurrent approval safety (RC-08)

- **D-16:** No admin code changes required. The `promote-branch.yml` workflow's `git rebase origin/main` step ensures the second branch is rebased on the updated main (which contains the first branch's commits). Existing `approveRelease` in `src/lib/release-actions.ts` is per-row idempotent (keyed by `release.id`).
- **D-17:** Verification: integration test seeding two release rows on different branches, simulating two approve POSTs in quick succession, asserting both produce independent `promote_attempts` insertions and both `releaseLogs.promotionDispatchedAt` columns are populated. End-to-end multi-branch validation is the Phase 8 Truth+Treason pilot (PILOT-02).

### Claude's Discretion

- Exact lookup query for promote-callback's metadata read (one-shot SELECT vs Drizzle relational helper)
- Whether to add a small `dispatchPromote` extraction in `release-promotion.ts` to keep the function under ~150 lines, or keep the inline path
- Whether to also surface the merged/ci_failed threaded reply when `metadata.dispatch.*` is missing (skip Slack but record attempt — covered by D-11)
- Slack message formatting (rich blocks vs plain text) — recommend keeping plain-text consistent with the existing `:rocket:` dispatched-message format
- Where to update `onboarding-projects.md` runbook to document the consumer's local `promote-branch.yml` stub (recommend a new step appended after vault step from Phase 1)
- Whether to bundle a stub injection helper for the consumer repo, or document manual creation (recommend documentation only — Phase 8 pilot will exercise once)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 6: promoteAndAudit Rewrite" — four success criteria
- `.planning/REQUIREMENTS.md` — RC-04 (dispatch target), RC-05 (branch in Slack message), RC-06 (conflict reply), RC-08 (concurrent safety)

### Prior-phase context constraining Phase 6
- `.planning/phases/03-schema-github-app-permissions/03-CONTEXT.md` — `release_logs.branch` (nullable, default 'main'); `slack_action_audit` table (Phase 7 will use)
- `.planning/phases/04-promote-branch-workflow/04-CONTEXT.md` — `promote-branch.yml` workflow shape; `promote_attempts` schema; D-15 (callback contract); workflow versioning v3
- `.planning/phases/04-promote-branch-workflow/04-SUMMARY.md` (when read by planner) — Phase 4 deliverables
- `.planning/phases/05-customer-page-rc-ui/05-CONTEXT.md` — `metadata.previewUrl` precedent for storing JSONB extras on release_logs
- `.planning/STATE.md` — accumulated decisions including v1.14 promoteAndAudit fire-and-forget pattern

### Existing code to modify (the modification targets)
- `src/lib/release-promotion.ts` — `promoteAndAudit` function (currently dispatches deploy-prod.yml)
- `src/lib/slack.ts` — `notifyReleaseApproved`, `postSlackThreadedReply`, `updateSlackMessage`
- `src/app/api/slack/interact/route.ts` — calls `promoteAndAudit`; passes channelId + messageTs from Slack payload
- `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` — calls `notifyReleaseApproved` (signature change required)
- `src/app/api/platform/promote-callback/route.ts` — Phase 4 endpoint; extend to post threaded Slack reply
- `src/lib/github-app.ts` — `dispatchWorkflow` helper (no changes; just call with new inputs)
- `src/db/schema.ts` — `releaseLogs.metadata` JSONB (already in place); `promoteAttempts` (already in place)
- `src/lib/release-actions.ts` — `approveRelease` helper (idempotent; no changes for concurrent safety)

### Tests to extend
- `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts` (if exists) — extend to assert branch passed to notifyReleaseApproved
- `src/app/api/platform/promote-callback/route.test.ts` — extend to assert threaded reply on conflict; mock postSlackThreadedReply
- `src/lib/release-promotion.test.ts` (new) — unit-test new dispatch target + metadata write

### Stack
- Next.js 16 App Router, React 19, Drizzle ORM (CockroachDB), Vitest 4.x
- next-auth v4 + JWT for the customer page; jose nowhere in this phase
- Slack: existing `chat.postMessage` / `chat.update` / threaded-reply pattern via the bot token from `@myalterlego/secrets`
- GitHub App: existing JWT signer + token cache; `dispatchWorkflow` helper unchanged

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`promoteAndAudit`** (src/lib/release-promotion.ts) — fire-and-forget orchestrator with built-in failure handling (`postSlackThreadedReply` + `chat.update`). Already takes `channelId` + `messageTs` + `actorEmail` + `slackUserName` from the interact payload. Just swap the workflow target + add the metadata write.
- **`dispatchWorkflow`** (src/lib/github-app.ts:126) — JWT-signed POST to GitHub. Already handles 4xx errors. Generic over workflow file.
- **`postSlackThreadedReply` / `updateSlackMessage`** (src/lib/slack.ts) — existing helpers used by promoteAndAudit's failure path. Promote-callback can reuse `postSlackThreadedReply`.
- **`notifyReleaseApproved`** (src/lib/slack.ts:237) — existing approval-notification function called from `/api/projects/[slug]/releases/[releaseId]/approve/route.ts`. Extend signature with `branch`.
- **`releaseLogs.metadata`** JSONB column — Phase 5 already used it for `previewUrl`; safe to add `dispatch.slackChannelId` + `dispatch.slackMessageTs` + `dispatch.dispatchedAt`.
- **`promote_attempts`** table — Phase 4 schema already exists with `branch`, `result`, `mergeSha`, `conflictFiles`, `rebaseError`, `ciRunUrl`. Phase 6 doesn't extend it.

### Established Patterns

- **Fire-and-forget Slack notifications** (Phase 04 v1.14 decision in STATE.md) — `try { await ... } catch { console.warn(...) }` around all Slack calls. `promoteAndAudit` already follows this. Phase 6 keeps it.
- **`requireApiKey` Bearer auth** for platform ingest endpoints — promote-callback already uses it. No auth changes.
- **snake_case wire payloads** for callbacks (`/api/releases/promoted`, `/api/platform/promote-callback`). Established in v1.14 / Phase 04. Phase 6 doesn't change wire format — only adds Slack-side rendering.
- **Drizzle camelCase TS / snake_case DB column** mapping. `metadata.dispatch.slackChannelId` is JSONB so it's stored as JSON; the property names inside the JSON are TypeScript-style (camelCase) for consistency with existing `metadata.previewUrl`.

### Integration Points

- **`/api/slack/interact` → `promoteAndAudit`** — line 192 of `src/app/api/slack/interact/route.ts`. Phase 6 needs to ensure the `branch` is extracted from the Slack action `value` JSON and stored before calling promoteAndAudit (via release lookup, since `release.branch` is already on the row from Phase 3).
- **`/api/platform/promote-callback` → Slack** — current implementation only inserts the promote_attempts row. Phase 6 adds: lookup release by `(project, branch)` → read metadata → post threaded reply.
- **`/api/projects/[slug]/releases/[releaseId]/approve` → `notifyReleaseApproved`** — line 85. Phase 6 changes the call site to pass `release.branch` (already available on the release row).

</code_context>

<specifics>
## Specific Ideas

- **Dispatch failure path is already strong** — promoteAndAudit's existing PROMOTION_FAILED_MSG_TEMPLATE + chat.update covers 404s when consumer lacks the local stub. No new error handling needed.
- **Metadata field naming** — use `dispatch` as the namespace key (`metadata.dispatch.slackChannelId`) so future fields can co-exist (e.g., `metadata.previewUrl`, `metadata.dispatch.*`, `metadata.releasedBy`).
- **Conflict file list cap** — match the cap chosen in Phase 5 BranchSection.tsx (50). Keeps customer-page UI and Slack reply consistent.
- **Slack message format** for the conflict reply: use `mrkdwn` blocks with a `code_block` element for the file list. Falls back to plain text if blocks API is unavailable.
- **The dispatch happens AFTER the customer clicks Approve in admin UI AND staff clicks the Slack Promote button.** Customer's approve POST writes the audit + posts notifyReleaseApproved. Staff's Slack click calls /api/slack/interact which calls promoteAndAudit. RC-04 changes the second step. RC-05 changes the first step.
- **Phase 8 pilot exercises RC-08** — concurrent approve of feat/change-font and feat/add-audio. Phase 6's job is to make sure dispatch + Slack flow doesn't introduce serialization. Both branches dispatch independently to their own `promote-branch.yml` runs.
- **Migration plan** — old approval Slack messages still in flight may have button payloads without `branch`. Backwards compat: if branch missing in payload, fall back to `release.branch ?? 'main'` lookup at handler time.

</specifics>

<deferred>
## Deferred Ideas

- **OttoBot Slack scope expansion** (slash commands, app mentions) — Phase 7 / OTTOBOT-02..05
- **slack_action_audit row writes** — Phase 7 / OTTOBOT-01 (every interact action gets an audit row; Phase 6 doesn't add this)
- **Audit log viewer at /admin/platform/slack-audit** — Phase 7 / OTTOBOT-06
- **Consumer repo `promote-branch.yml` stub injection automation** — keep manual / documentation for now; if many projects onboard, automate as a backlog item
- **AI-mediated conflict resolution** — v3 (CONFLICT-V3-01)
- **Customer-page conflict resolution UI** — v3 (CONFLICT-V3-02)
- **Per-project Slack channel routing** — v3 (NOTIF-V3-01); current `#release-approvals` global channel stays
- **Email notifications on lifecycle events** — v3 (NOTIF-V3-02)
- **Slack notification on prod deploy completion** — v3 (NOTIF-V3-03); round-trip is silent today
- **Admin-side reconciliation cron for missed callbacks** — out of scope; promote-callback's `continue-on-error` is sufficient

</deferred>

---

*Phase: 06-promoteandaudit-rewrite*
*Context gathered: 2026-05-05 via auto mode (all 4 gray areas auto-resolved with recommended defaults)*
