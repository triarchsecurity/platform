---
phase: 7
slug: ottobot-dispatcher-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` (root) — `environment: 'jsdom'` global since Phase 5 |
| **Setup file** | `vitest.setup.ts` — `@testing-library/jest-dom/vitest` + `afterEach(cleanup)` |
| **Quick run command** | `npx vitest run src/lib/__tests__/slack-audit src/lib/__tests__/slack-interact src/app/api/slack src/app/admin/platform/slack-audit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (Phase 7 subset), ~120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run the Phase 7 subset command
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds (Phase 7 subset)

---

## Per-Task Verification Map

> Task IDs populated by planner. Test files and verification commands are pre-bound to requirements per RESEARCH.md §"Validation Architecture".

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | Audit | 1 | OTTOBOT-01 (helper) | unit | `npx vitest run src/lib/__tests__/slack-audit.test.ts` | ❌ W0 | ⬜ pending |
| TBD | Audit | 1 | OTTOBOT-01 (interact wiring) | unit | `npx vitest run src/lib/__tests__/slack-interact.test.ts` | ✅ extend | ⬜ pending |
| TBD | Commands | 2 | OTTOBOT-03/04 | unit | `npx vitest run src/app/api/slack/commands/route.test.ts` | ❌ W0 | ⬜ pending |
| TBD | Events | 2 | OTTOBOT-05 | unit | `npx vitest run src/app/api/slack/events/route.test.ts` | ❌ W0 | ⬜ pending |
| TBD | Viewer | 3 | OTTOBOT-06 (page auth) | RTL | `npx vitest run src/app/admin/platform/slack-audit/page.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | Viewer | 3 | OTTOBOT-06 (filters/load-more) | RTL | `npx vitest run src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | Scope | 3 | OTTOBOT-02 | manual | Slack App settings — staff verifies scope upgrade in api.slack.com | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/__fixtures__/slack.ts` (NEW) — `makeSlashCommandPayload`, `makeEventPayload`, `makeSlackInteractPayload` factories with HMAC-signed variant per RESEARCH §"Test Helper Design"
- [ ] `src/lib/__tests__/slack-audit.test.ts` (NEW) — covers OTTOBOT-01 helper (hash determinism + insert + failure swallow)
- [ ] `src/app/api/slack/commands/route.test.ts` (NEW) — covers OTTOBOT-03/04 (deploy authz + dispatch, status block kit, unknown project, help)
- [ ] `src/app/api/slack/events/route.test.ts` (NEW) — covers OTTOBOT-05 (url_verification, app_mention parse, dedup)
- [ ] `src/app/admin/platform/slack-audit/page.test.tsx` (NEW) — covers OTTOBOT-06 server-side staff gate
- [ ] `src/app/admin/platform/slack-audit/SlackAuditClient.test.tsx` (NEW) — covers OTTOBOT-06 client-side filters + load-more
- [ ] No new devDeps — RTL/jsdom/Vitest installed in Phase 5 Wave 0

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OttoBot Slack App scopes upgraded (`chat:write.public`, `app_mentions:read`, `commands`) | OTTOBOT-02 | Slack App settings UI; cannot be automated | api.slack.com → OttoBot → OAuth & Permissions → add scopes → reinstall workspace; verify all three scopes present in installed token |
| `/triarch deploy` from a real staff Slack user dispatches the correct workflow | OTTOBOT-03 | Requires real Slack workspace + GitHub App | Type `/triarch deploy <project> <version>` in Slack; verify ephemeral ack with run URL + GitHub Actions shows new `promote-branch.yml` run |
| `/triarch deploy` from a non-staff user receives access-denied ephemeral | OTTOBOT-03 | Requires real Slack non-staff user | Have a non-staff Slack member type the command; verify ephemeral `:no_entry:` |
| `/triarch status` returns Block Kit sections with current dev/prod/RCs/recent deploys | OTTOBOT-04 | Requires real Slack render | Type `/triarch status <project>`; verify all 4 sections render correctly |
| `@OttoBot status <project>` mirrors `/triarch status` | OTTOBOT-05 | Requires real Slack channel mention + Events API delivery | Mention the bot in any public channel; verify same Block Kit response as slash command |
| Slack Events API URL verified at api.slack.com | OTTOBOT-05 | Requires Slack Events config + HTTPS endpoint | After deploy, paste `https://admin.triarch.dev/api/slack/events` into Slack Event Subscriptions → verify checkmark |
| `/admin/platform/slack-audit` accessible to staff, 403 to non-staff | OTTOBOT-06 | Requires real session + role | Log in as staff → page renders; log in as customer admin → 403 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (1 fixtures + 5 new test files)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s (Phase 7 subset)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
