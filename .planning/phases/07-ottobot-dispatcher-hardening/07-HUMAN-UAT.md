---
phase: 07-ottobot-dispatcher-hardening
type: human-uat
covers: [OTTOBOT-02, OTTOBOT-06]
status: pending
created: 2026-05-05
---

# Phase 7 — HUMAN UAT Checklist

Complete every checkbox in this file before running `/gsd:verify-work` for Phase 7.

- **OTTOBOT-02** (Slack scope upgrade): Requires manual configuration in api.slack.com — cannot be automated. Follow Step 4 below to add the 3 required scopes, configure URLs, and reinstall the workspace.
- **OTTOBOT-06** (sidebar nav): Requires applying `scripts/seed-slack-audit-nav.sql` against the production CRDB — DATABASE_URL is a Firebase App Hosting secret, not available in CI. Follow Step 1 below.

## Prerequisites

- [ ] All Phase 7 plans 07-01 through 07-05 are merged to main
- [ ] Admin app is deployed (Firebase App Hosting rollout completed)
- [ ] You have access to api.slack.com OttoBot app settings
- [ ] You have access to Firebase App Hosting secrets for project `triarch-dev`

## Step 1 — Apply the menu_pages seed

Run the following commands to apply the nav seed and verify the row landed:

```bash
firebase apphosting:secrets:access DATABASE_URL --project triarch-dev > /tmp/.db_url
psql "$(cat /tmp/.db_url)" -f scripts/seed-slack-audit-nav.sql
psql "$(cat /tmp/.db_url)" -c "SELECT id, label, path, min_role, sort_order FROM menu_pages WHERE path='/admin/platform/slack-audit';"
```

Expected: 1 row with `label='Slack Audit'`, `path='/admin/platform/slack-audit'`, `min_role='staff'`.

If the verification SELECT returns 0 rows, the WHERE clause in the seed (`menu_sections.project='triarch-dev' AND key='platform'`) did not match production. Inspect the actual sections:

```bash
psql "$(cat /tmp/.db_url)" -c "SELECT id, project, key, label FROM menu_sections ORDER BY project, sort_order;"
```

Adjust the seed's WHERE clause to match the actual platform section row, then re-run.

- [ ] Seed applied
- [ ] Verification SELECT returns the expected row

## Step 2 — Confirm sidebar nav appears for staff

- [ ] Log in to admin as a staff user (your `mike@triarchsecurity.com` account)
- [ ] Navigate to admin home — confirm the **Platform** section in the sidebar now shows a **Slack Audit** entry
- [ ] Click the entry — confirm it navigates to `/admin/platform/slack-audit` and renders the audit table (may be empty until Step 4 generates rows)
- [ ] Sidebar entry visible
- [ ] Page renders without errors

## Step 3 — Confirm non-staff cannot see the nav or page

- [ ] In a private window, log in as a customer admin user (a `project_members` row with `role='admin'`, NOT `'staff'`)
- [ ] Confirm the sidebar does NOT show **Slack Audit**
- [ ] Manually navigate to `https://admin.triarch.dev/admin/platform/slack-audit` — confirm you are redirected to `/admin?error=forbidden` (or 403)
- [ ] Sidebar entry hidden for non-staff
- [ ] Direct URL access redirects/403s for non-staff

## Step 4 — Slack App scope upgrade

Follow `docs/onboarding-projects.md` Step 10 "OttoBot Slack App scope upgrade" exactly:

- [ ] Add scopes: `chat:write.public`, `app_mentions:read`, `commands`
- [ ] Register `/triarch` slash command with Request URL `https://admin.triarch.dev/api/slack/commands`
- [ ] Enable Events API at `https://admin.triarch.dev/api/slack/events`; subscribe to `app_mention` bot event
- [ ] Reinstall workspace
- [ ] Verify SLACK_BOT_TOKEN in vault matches Slack-displayed token (rotate only if changed — per CONTEXT D-22)

## Step 5 — End-to-end smoke test

- [ ] In Slack, type `/triarch` (no args) — see ephemeral help text with `deploy` and `status` subcommands listed
- [ ] Type `/triarch status admin` — see ephemeral Block Kit with Dev / Prod / Active RCs / Last 3 Deploys sections
- [ ] Type `/triarch deploy admin v0.0.0-fake` — as staff: see `:gear: Dispatching...` ack; as non-staff: see `:no_entry: This command requires Triarch staff access.`
- [ ] In a channel, type `@OttoBot status admin` — see threaded reply with same Block Kit as `/triarch status admin`
- [ ] Reload `/admin/platform/slack-audit` — confirm new audit rows for `slash_help`, `slash_status`, `event_app_mention_status`, `slash_deploy` (from the calls above)

## Step 6 — Filter + pagination smoke test

- [ ] On `/admin/platform/slack-audit`, type `mike` in the Actor Email filter — URL updates to `?email=mike`; rows narrow to your email
- [ ] Set From date to 7 days ago, To date to today — confirm rows respect the range
- [ ] If more than 50 rows match, click **Load more** — next page appends; button hides when no more pages
- [ ] Click any row — `payload_hash` appears in the expanded section

## Sign-off

Completed by: ___________________

Date: ___________________

All steps green: [ ]

Notes / deviations:

## Failure Handling

**Step 1 verification SELECT returns 0 rows after seed:**
Inspect `menu_sections` rows to find the actual platform section key and project value. Adjust the WHERE clause in `scripts/seed-slack-audit-nav.sql` and re-run.

```bash
psql "$(cat /tmp/.db_url)" -c "SELECT id, project, key, label FROM menu_sections ORDER BY project, sort_order;"
```

**Step 4 url_verification fails ("Your URL didn't respond with the value of the challenge parameter"):**
Check that `/api/slack/events` route is deployed AND that `body.type === 'url_verification'` is handled BEFORE `verifySlackSignature` (Phase 7 RESEARCH Pitfall 2 — the url_verification request has no signature).

**`@OttoBot status` works but in-channel mention does NOT reply:**
The `chat:write.public` scope may not have been added to the Slack App, or the workspace reinstall was skipped. Re-check Slack OAuth & Permissions scopes and reinstall the workspace.

**`/triarch deploy` ack appears but no GitHub Actions run starts:**
The GitHub App `Triarch Release Gate` may not have `contents:write` permission on the target repo (Phase 3 SCHEMA-03 prerequisite). Re-authorize the GitHub App installation via Settings in the GitHub org.

**Slack Bot Token changed after reinstall:**
Rotate `SLACK_BOT_TOKEN` in triarch-vault using the new token value, then wait 300 seconds for the in-process cache to expire (or redeploy admin):

```bash
gcloud secrets versions add SLACK_BOT_TOKEN \
  --data-file=- \
  --project=triarch-vault \
  <<< 'xoxb-NEW-TOKEN-VALUE'
```
