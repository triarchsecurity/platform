# Phase 7: OttoBot Dispatcher Hardening - Context

**Gathered:** 2026-05-05 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden OttoBot's Slack control plane in three layered concerns:

1. **Audit (OTTOBOT-01):** Every `/api/slack/interact` button click writes a `slack_action_audit` row capturing action_id, actor email, Slack user_id, payload hash, response status, and dispatcher latency. The schema already exists from Phase 3 (SCHEMA-02); this phase wires the writes.

2. **Slash commands & app mentions (OTTOBOT-02..05):** New endpoints accept `/triarch deploy <project> <version>`, `/triarch status <project>`, and `@OttoBot status <project>`. Slash commands and app mentions are handled by Slack's Events/Commands APIs (separate from interact). Slack App scope upgrade (OTTOBOT-02) is a HUMAN action — toggle scopes in api.slack.com Slack App settings, then re-authorize the workspace; the plan documents but does not automate this.

3. **Audit viewer (OTTOBOT-06):** New staff-only page at `/admin/platform/slack-audit` — paginated, filterable table of audit rows. Non-staff get a 403.

**Out of scope:**
- New schema changes — `slack_action_audit` table already shipped in Phase 3
- Vault changes — SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_USER_MAP already in `triarch-vault`
- Per-project Slack channel routing (NOTIF-V3-01) — v3
- Automation of the OTTOBOT-02 scope upgrade — remains HUMAN action
- Email lifecycle notifications (NOTIF-V3-02) — v3

</domain>

<decisions>
## Implementation Decisions

### Slash command endpoint design (OTTOBOT-03, OTTOBOT-04)

- **D-01:** New endpoint `POST /api/slack/commands` — single route handler that branches on Slack's `command` field + first positional arg (`deploy` / `status`). Mirrors the single-endpoint pattern used by `/api/slack/interact` for buttons.
- **D-02:** HMAC verification reuses `verifySlackSignature` from `src/lib/slack-crypto.ts` with the same `SLACK_SIGNING_SECRET` (already in `triarch-vault` from Phase 1).
- **D-03:** Response timing — return 200 + ephemeral acknowledgement WITHIN the Slack 3-second rule. Workflow dispatch (for `deploy`) and status fetch (for `status`) run BEFORE returning IF they fit in the window; otherwise return immediate ack and post follow-up via `chat.postMessage` to the same channel.
- **D-04:** Empty `/triarch` (no args) returns ephemeral help text:
  ```
  *OttoBot — Triarch deploy automation*

  • `/triarch deploy <project> <version>` — Promote `<version>` of `<project>` to production. Staff only.
  • `/triarch status <project>` — Show current dev/prod release status for `<project>`.

  Tip: also try `@OttoBot status <project>` in any channel.
  ```

### Slash command authorization (OTTOBOT-03)

- **D-05:** `deploy` subcommand is staff-only. Authorization: resolve Slack `user_id` → email via `slackUserToEmail`; if email matches `@triarchsecurity.com` (existing staff bypass) OR appears in a project_members row with `role='staff'`, allow. Otherwise return ephemeral access-denied: `:no_entry: This command requires Triarch staff access.`
- **D-06:** `status` subcommand is open to any project member of the named project. Lookup: `slackUserToEmail` → check `project_members` for `(project_key, email)` membership. Non-members: ephemeral `:no_entry: You don't have access to '{project}'`.

### Audit row write strategy (OTTOBOT-01)

- **D-07:** New helper `recordSlackAudit(input)` in `src/lib/slack-audit.ts`. Called at the END of every Slack route handler (`/api/slack/interact`, `/api/slack/commands`, `/api/slack/events`) with `{actionId, actorEmail, actorSlackId, payloadHash, responseStatus, latencyMs}`. The helper inserts into `slack_action_audit` and never throws.
- **D-08:** Failure handling — if audit insert fails, `console.warn` and continue (do NOT block the Slack response). Slack 3-second rule wins; audit is best-effort. Mirrors the `D-15` Slack-best-effort pattern from Phase 6.
- **D-09:** `payload_hash` format — `crypto.createHash('sha256').update(rawBody).digest('hex')` of the raw HTTP body BEFORE any parsing. Deterministic and matches what Slack signed.
- **D-10:** `actor_email` lookup — use existing `slackUserToEmail(slackUserId)` from `src/lib/slack-identity.ts`. Returns `null` if unmapped; nullable column accepts that.
- **D-11:** `actor_slack_id` is the raw Slack user_id (`U0XXXXX`) and is ALWAYS present (notNull on schema). Extracted from `payload.user_id` (commands) / `payload.user.id` (interact) / `event.user` (events).
- **D-12:** `response_status` is the actual HTTP status the route handler returns to Slack (200, 4xx, 5xx). Captured just before `NextResponse.json(...)`.
- **D-13:** `latency_ms` — `Date.now() - requestReceivedAt` measured at the top of the handler. Always < 3000 per Slack contract; integer column type matches.

### Status command response format (OTTOBOT-04, OTTOBOT-05)

- **D-14:** Slack message uses simple Block Kit blocks: header section + fields, dividers between sections. No images, no buttons.
- **D-15:** Data sections (in order):
  1. **Dev** — current dev release `version` + `deployed_at` (humanized: "2 hours ago")
  2. **Prod** — current prod release `version` + `deployed_at`
  3. **Active RCs** — feature branches with non-terminal status (in `dev/pending_approval/approved`), capped at 5; render as `{branch} {version} — {status}`. If >5, append `+ N more`.
  4. **Last 3 deploys** — most recent 3 release_logs rows for the project across all branches/envs
- **D-16:** Unknown project → ephemeral error message: `:warning: Project '{name}' not found. Try: ` + comma-separated list of up to 5 project keys from `projects` table.
- **D-17:** Visibility — always ephemeral (`response_type: 'ephemeral'`). Status is per-person curiosity, not a channel announcement.

### App mention handler (OTTOBOT-05)

- **D-18:** New endpoint `POST /api/slack/events` — handles Slack Events API payloads (subscribed via `app_mentions:read` after OTTOBOT-02 scope upgrade). On `event.type === 'app_mention'`:
  - Parse mention text after the bot mention: e.g. `<@UBOT> status feat-website` → `status` + `feat-website`
  - For unsupported text (e.g. `@OttoBot hi`), reply with help text in-thread
  - For `status <project>`, post the same response as `/triarch status <project>` but as a public threaded reply (since the user mentioned in a public channel — implied public visibility)
- **D-19:** Slack `url_verification` challenge handler — when Slack sends `type: 'url_verification'`, respond with the `challenge` token. Required by Slack to verify the events endpoint.
- **D-20:** Event deduplication — Slack retries deliveries on 5xx. Track recent `event_id`s for ~5 minutes via in-memory `Set` (capped, FIFO eviction). On duplicate, return 200 immediately, no-op.

### Slack App scope upgrade (OTTOBOT-02)

- **D-21:** Required scopes (added to existing OttoBot Slack App):
  - `chat:write.public` — post to channels the bot isn't a member of (for help/status replies in random channels)
  - `app_mentions:read` — receive `app_mention` events
  - `commands` — receive slash commands
- **D-22:** OTTOBOT-02 is a HUMAN action: navigate to api.slack.com → OttoBot app → OAuth & Permissions → add scopes → reinstall workspace → record bot user OAuth token. Plan emits a HUMAN-UAT step rather than automating. The bot token in `triarch-vault` (`SLACK_BOT_TOKEN`) does NOT need rotation IF reinstall preserves the token; rotate only if Slack issues a new one (HUMAN-UAT step verifies).

### Audit log viewer UX (OTTOBOT-06)

- **D-23:** New page at `/admin/platform/slack-audit/page.tsx`. Server component fetches first page; client component handles filters + load-more.
- **D-24:** Auth — `getCurrentUserContext` + staff-only check (`ctx.isStaff`). Non-staff get 403 (NextResponse.json or redirect to /admin with toast).
- **D-25:** Filters at top of page:
  - `action_id` — text input, exact match
  - `actor_email` — text input, ILIKE substring match
  - Date range — `from` + `to` date inputs (defaults: last 7 days from / today to)
- **D-26:** Pagination — load-more button, 50 rows per page (matches Phase 5 `/projects/{slug}/releases` pagination semantics — fetch +1 to detect `hasMore`).
- **D-27:** Row layout — collapsed table row shows `created_at`, `action_id`, `actor_email or '—'`, `actor_slack_id`, `response_status` (color-coded by 2xx/4xx/5xx), `latency_ms`. Click row to expand: shows `payload_hash` and any wider context.
- **D-28:** Default sort — `created_at DESC` (matches `slack_action_audit_created_at_idx`). No client-side flip; date range filter is the user's primary navigation tool.

### Claude's Discretion

- Exact layout of the help text (free to refine wording while preserving the listed subcommands)
- Block Kit block composition for status response (exact `fields` arrangement)
- Where the slash-command dispatch implementation lives (single-file vs split per-subcommand)
- In-memory event-dedup TTL exact value (5 min recommended; Claude can refine to 10 min if logs show longer Slack retry windows)
- Whether to add a small "Refresh" link on the audit page or just rely on browser refresh
- Color tokens for status badges (match existing palette in `STATUS_BADGE_COLORS` from `ReleasesClient.tsx`)
- Exact error formatting on Slack (single line vs block) — Slack mrkdwn rendering varies; pick what reads cleanest in clients

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 7: OttoBot Dispatcher Hardening" — five success criteria
- `.planning/REQUIREMENTS.md` — OTTOBOT-01..06 (all in scope this phase)

### Prior-phase context constraining Phase 7
- `.planning/phases/03-schema-github-app-permissions/03-CONTEXT.md` — `slack_action_audit` schema (action_id, actor_email nullable, actor_slack_id notNull, payload_hash hex, response_status int, latency_ms int < 3000, created_at indexed DESC)
- `.planning/phases/06-promoteandaudit-rewrite/06-CONTEXT.md` — Slack-best-effort try/catch pattern (D-15), establishes precedent for D-08
- `.planning/phases/01-central-secrets-vault/01-CONTEXT.md` — `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_USER_MAP` available via `getSecret(...)` from `@myalterlego/secrets`

### Existing code (modification targets / reuse)
- `src/app/api/slack/interact/route.ts` — existing button-click dispatcher; extend with `recordSlackAudit` call
- `src/lib/slack.ts` — `chat.postMessage`, `chat.update`, `postSlackThreadedReply`, `notifyReleaseApproved`
- `src/lib/slack-crypto.ts` — `verifySlackSignature` (HMAC-SHA256 with `SLACK_SIGNING_SECRET`)
- `src/lib/slack-identity.ts` — `slackUserToEmail`, `slackUserToStaffEmail` (vault-sourced SLACK_USER_MAP)
- `src/lib/slack-actions/index.ts` — action_id router for buttons (model for command-name router pattern)
- `src/lib/github-app.ts` — `dispatchWorkflow` for the `deploy` subcommand
- `src/db/schema.ts` — `slackActionAudit`, `releaseLogs`, `projects`, `projectMembers`
- `src/lib/auth-context.ts` — `getCurrentUserContext`, `ctx.isStaff` for the audit viewer page
- `src/app/admin/platform/projects/page.tsx` (and siblings) — pattern for admin-platform pages

### Tests to extend / add
- `src/app/api/slack/interact/route.test.ts` (if exists) — add audit-row assertion after each handler
- `src/app/api/slack/commands/route.test.ts` (NEW) — slash-command verification, deploy authz, status response shape, help text
- `src/app/api/slack/events/route.test.ts` (NEW) — `url_verification` challenge, app_mention parse, event dedup
- `src/lib/__tests__/slack-audit.test.ts` (NEW) — payload_hash determinism, audit insert semantics, failure swallow
- `src/app/admin/platform/slack-audit/page.test.ts` (NEW) — staff vs non-staff access, filter URL params, load-more behavior

### Slack platform docs (for planner reference)
- Slack Events API: `https://api.slack.com/apis/events-api` — `app_mention` event shape, `url_verification` handshake
- Slack Slash Commands: `https://api.slack.com/interactivity/slash-commands` — payload format, response_type
- Slack Block Kit: `https://api.slack.com/block-kit` — section/fields/divider blocks
- Slack 3-second rule: ack within 3000ms; further messages via `chat.postMessage` or response_url

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`verifySlackSignature`** (src/lib/slack-crypto.ts) — already used by `/api/slack/interact`. Extract into a shared HMAC helper if it isn't already, then reuse for `/commands` and `/events`.
- **`slackUserToEmail` / `slackUserToStaffEmail`** (src/lib/slack-identity.ts) — vault-sourced SLACK_USER_MAP lookup; staff bypass via `@triarchsecurity.com` email check is established (v1.14 Phase 1.1).
- **`getCurrentUserContext` + `ctx.isStaff`** (src/lib/auth-context.ts) — admin-page staff gate; reuse for `/admin/platform/slack-audit`.
- **`dispatchWorkflow`** (src/lib/github-app.ts) — JWT-signed workflow dispatch; reuse for the `deploy` subcommand.
- **`slack_action_audit` table** (Phase 3 SCHEMA-02) — schema already in place, indexed `(created_at desc)`.
- **`projects.appUrl` / `projects.deployedUrl`** — current dev/prod URLs; useful for status response footer (link to admin page).

### Established Patterns

- **Single-endpoint Slack route + internal switch** — `/api/slack/interact` already routes by `action_id`. Apply the same pattern to `/api/slack/commands` (switch by `command` + first arg) and `/api/slack/events` (switch by `event.type`).
- **HMAC verification at the top of every Slack route** — return 401 if signature mismatch BEFORE doing any work. Pattern from `/api/slack/interact`.
- **Fire-and-forget background work** — promoteAndAudit pattern from Phase 6: return 200 to Slack first, do longer work in detached promise. Apply to `deploy` workflow_dispatch and `status` data fetch when they exceed the 3-second budget.
- **Bearer-auth admin pages** — `getCurrentUserContext` + role check at the server-component level. Extend the same pattern to `/admin/platform/slack-audit/page.tsx`.
- **JSONB metadata for ephemeral wide payloads** — established in Phase 5 (previewUrl) and Phase 6 (dispatch.*) — slack-audit raw payload could be hashed instead of stored verbatim (D-09 already chose hash approach).

### Integration Points

- **`/api/slack/interact`** — extend with `recordSlackAudit` call at the end of the handler. Capture `requestReceivedAt = Date.now()` at the top.
- **`/api/slack/commands`** (NEW) — Slack-app webhook target for slash commands. After scope upgrade, configure URL in Slack App settings to `https://admin.triarch.dev/api/slack/commands`.
- **`/api/slack/events`** (NEW) — Slack-app webhook target for events (app_mention). Configure in Slack App settings → Event Subscriptions → Request URL.
- **`/admin/platform/slack-audit`** (NEW route) — staff-only viewer page; nav entry added to admin sidebar.
- **`src/lib/slack-audit.ts`** (NEW helper) — single insert function used by all three Slack routes. Wraps schema insert with try/catch.
- **`src/components/AdminSidebar.tsx`** — add new nav link for `/admin/platform/slack-audit` under the platform section. Staff-only render guard.

</code_context>

<specifics>
## Specific Ideas

- **Help text** for `/triarch` should mention `@OttoBot status` so users discover the app-mention path naturally.
- **Active RCs** in status response = release_logs rows where `branch != 'main'` AND `status` in `('dev', 'pending_approval', 'approved')`. Cap at 5; if more, append `+ N more` line.
- **Last 3 deploys** = `release_logs` for project ordered by `coalesce(deployed_at, released_at) desc`, limit 3. Render `{branch} {version} → {env} ({when})`.
- **Audit viewer URL params** — filters mirror to query string (`?action_id=X&email=Y&from=...&to=...`) so a filtered view is shareable. `/loop` checks: query string is the source of truth; useState mirrors query string via `useSearchParams`.
- **Slack message length cap** — Slack rejects messages > 40000 chars. Cap field contents (e.g., active RCs list capped at 5) to stay well under.
- **Per-deploy hyperlinks** in status — render `<{deploy_url}|{version}>` Slack link syntax so users click straight to the prod app or admin release page.
- **Deduplication TTL** — Slack retries on 5xx within 5 min; we cap our in-memory `Set<string>` at 1000 entries with FIFO eviction to bound memory.
- **`/triarch deploy`** dispatches `promote-branch.yml` if branch is provided as third arg, OR just looks up the most-recent dev release_logs for `(project, version)` and dispatches against `release.branch ?? 'main'`. Recommend the first form (explicit branch) — but preserve the lookup as a fallback.
  - `/triarch deploy <project> <version>` → look up release by `(project, version)`, dispatch `promote-branch.yml` with `branch: release.branch ?? 'main'`.
  - `/triarch deploy <project> <version> <branch>` → explicit branch override (rare; for fixing an out-of-sync branch).

</specifics>

<deferred>
## Deferred Ideas

- **Per-project Slack channel routing** — NOTIF-V3-01; current global `#release-approvals` stays
- **Email notifications on lifecycle events** — NOTIF-V3-02; v3
- **Slack notification on prod deploy completion** — NOTIF-V3-03; round-trip silent today
- **Multi-org Slack workspaces** — single workspace this milestone
- **Bulk approve via Slack** — out of scope; Phase 8 may surface need
- **`/triarch logs <project>` to fetch recent CI logs** — useful but out of scope
- **AI-summarized status reports** — defer; raw status is sufficient
- **Audit log export (CSV/JSON)** — backlog; UI viewer suffices for v2.0
- **Slack interactive button on the status response (e.g. "Promote dev to prod")** — interesting but conflates status (read) with action (write); v3
- **Per-action_id quotas / rate limits** — not needed pre-pilot

</deferred>

---

*Phase: 07-ottobot-dispatcher-hardening*
*Context gathered: 2026-05-05 via auto mode (4 gray areas, all resolved with recommended defaults)*
