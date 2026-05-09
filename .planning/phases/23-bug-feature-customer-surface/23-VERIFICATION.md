---
status: passed
phase: 23-bug-feature-customer-surface
generated: 2026-05-09T15:35:00Z
score: 35/35 must-haves verified
---

# Phase 23 Verification

## Goal Achievement Summary

Phase 23 achieves its goal: customers can view and submit bugs and features on the portal. All four plans (foundations, bug read, feature read, submission write) shipped end-to-end across the cross-repo workflow (admin docs-only, portal code+tests). All 35 must-have truths from per-plan PLAN frontmatter are observably true in the portal codebase. All 6 phase requirements (BUG-01..03 + FEAT-01..03) are verified Complete in REQUIREMENTS.md and substantiated in actual implementation. All 11 cross-cutting checks pass.

Portal `package.json` is at `0.4.0` (phase-close minor). Portal full vitest suite is **290 GREEN / 1 skipped** (matches the +123 cumulative delta documented in the per-plan SUMMARYs: 167 → 179 → 203 → 231 → 290). Phase 23 is checked off in `ROADMAP.md` (`[x] Phase 23: Bug + Feature Customer Surface ... completed 2026-05-09; portal v0.4.0`).

The customer-facing bug/feature CRUD primitive is now closed on portal. Phase 24+ unblocked.

## Must-Haves by Plan

### Plan 23-01: ReleasedInSidebar + StatusPill foundations (BUG/FEAT-01, BUG/FEAT-02 prerequisites)

| Truth                                                                                                | Status     | Evidence                                                                                                                |
|------------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------------------------|
| Sidebar Link href forks to `/projects/[slug]/releases?version=...` (Pitfall 5)                        | VERIFIED   | `ReleasedInSidebar.tsx` lines 62, 89; `grep -E 'href=.+/admin/modules/pipeline'` returns 0                              |
| StatusPill renders status pills with admin-verbatim color map                                         | VERIFIED   | `StatusPill.tsx` lines 16-37 — 8 bug statuses + 9 feature statuses match admin's reference verbatim                      |
| Both components are pure server components (no `'use client'`)                                        | VERIFIED   | First non-empty line of each file is an `import` (sidebar) or comment (pill); no `'use client'` directive               |
| Vitest tests prove no rendered href starts with `/admin/`                                             | VERIFIED   | `ReleasedInSidebar.test.tsx` Test 5 (`expect(a.getAttribute('href')).not.toMatch(/^\/admin/)`)                          |
| Vitest tests prove StatusPill renders distinct CSS classes per status; unknown gets fallback         | VERIFIED   | `StatusPill.test.tsx` 6 cases (8 bug + fallback / 9 feature + fallback)                                                 |
| No portal source files modified outside `portal/src/components/` and `portal/src/app/.../format.ts`  | VERIFIED   | Plan 01 commit (`c08bf42` + `575fc83`) modifies only those paths + `package.json` version bump                         |

**Artifacts**

| Artifact                                                                                | Status   | Details                                                                                       |
|-----------------------------------------------------------------------------------------|----------|-----------------------------------------------------------------------------------------------|
| `portal/src/components/ReleasedInSidebar.tsx`                                           | VERIFIED | 113 lines; exports `ReleasedInSidebar`; href fork applied at lines 62, 89                     |
| `portal/src/components/ReleasedInSidebar.test.tsx`                                      | VERIFIED | 6 cases; Pitfall 5 anchor (`expect(a.getAttribute('href')).not.toMatch(/^\/admin/)`) present  |
| `portal/src/components/StatusPill.tsx`                                                  | VERIFIED | 58 lines; exports `BugStatusPill` (8 statuses) + `FeatureStatusPill` (9 statuses)             |
| `portal/src/components/StatusPill.test.tsx`                                             | VERIFIED | 6 cases; readFileSync source-inspect for no-use-client                                        |
| `portal/src/app/projects/[slug]/releases/format.ts`                                     | VERIFIED | Reused unchanged (Phase 21-02 import path resolves byte-identically)                          |

**Key links**

| From                                | To                                                                       | Pattern                                                                        | Status   |
|-------------------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------|----------|
| `ReleasedInSidebar.tsx`             | `releases/format.ts.formatRelativeTime`                                  | `import { formatRelativeTime } from '@/app/projects/[slug]/releases/format'`   | VERIFIED |
| `ReleasedInSidebar.tsx`             | `@myalterlego/triarch-shared/release-history.ReleaseHistoryRow`          | `import type { ReleaseHistoryRow } from '@myalterlego/triarch-shared/...'`     | VERIFIED |
| `ReleasedInSidebar.tsx` (Link href) | portal `/projects/[slug]/releases` route                                 | `href={\`/projects/${row.projectKey}/releases?version=...\`}`                  | VERIFIED |

### Plan 23-02: Bug read surface (BUG-01 list + BUG-02 detail)

| Truth                                                                                                 | Status     | Evidence                                                                                                            |
|-------------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------------------------------|
| Authenticated customer browsing list sees only that project's bugs                                    | VERIFIED   | `bugs/page.tsx` line 66-69 (`eq(bugReports.project, project.key)`)                                                  |
| Non-member browsing list receives 404 (PORTAL-03)                                                     | VERIFIED   | `bugs/page.tsx` line 61 (`if (!ctx || (!ctx.isStaff && !membership)) notFound()`)                                   |
| Status filter via URL `?status=` narrows the query (server-side, no client fetch)                     | VERIFIED   | `bugs/page.tsx` lines 49-50 + 64-69 (and `BugListClient.tsx` calls `router.replace`, never `fetch`)                 |
| URL `?project=other` is ignored (Pitfall 4)                                                           | VERIFIED   | `bugs/page.tsx` line 47-48 — only `project.key` (URL slug) passed to `eq(bugReports.project, ...)`                  |
| PAGE_SIZE=20 + LIMIT(PAGE_SIZE+1) sentinel + hasMore boolean                                          | VERIFIED   | `bugs/page.tsx` lines 19, 76-79 (`limit(PAGE_SIZE + 1)` + slice)                                                    |
| Detail page renders bug fields + ReleasedInSidebar                                                    | VERIFIED   | `bugs/[id]/page.tsx` lines 60, 144 (`getReleaseHistoryForBug` + `<ReleasedInSidebar releaseHistory={...} />`)       |
| Detail page HIDES `triarchNotes` and `fixCommitSha`                                                   | VERIFIED   | `grep -F 'bug.triarchNotes' [id]/page.tsx` → 0; `grep -F 'bug.fixCommitSha' [id]/page.tsx` → 0                      |
| Detail page returns 404 if bug.project ≠ URL slug (cross-project lookup)                              | VERIFIED   | `bugs/[id]/page.tsx` line 57 (`if (bug.project !== project.key) notFound()`)                                        |
| Both pages use `BugStatusPill` from StatusPill.tsx                                                    | VERIFIED   | `bugs/[id]/page.tsx` line 10 + JSX line 80; `BugListClient.tsx` line 4 + JSX line 80                                |
| Both pages are server components (no 'use client')                                                    | VERIFIED   | First non-empty line of `bugs/page.tsx` and `[id]/page.tsx` is `import`                                             |

**Artifacts**

| Artifact                                                       | Status   | Details                                                                  |
|----------------------------------------------------------------|----------|--------------------------------------------------------------------------|
| `portal/src/app/projects/[slug]/bugs/page.tsx`                 | VERIFIED | 114 lines; 2 `notFound()` calls; PAGE_SIZE+1 sentinel; Pitfall 4 guard   |
| `portal/src/app/projects/[slug]/bugs/BugListClient.tsx`        | VERIFIED | 'use client'; `router.replace` (3 occurrences); 0 `fetch` calls          |
| `portal/src/app/projects/[slug]/bugs/[id]/page.tsx`            | VERIFIED | 4 `notFound()` calls; `<ReleasedInSidebar` rendered; staff fields hidden |
| `portal/src/app/projects/[slug]/bugs/page.test.tsx`            | VERIFIED | 8 vitest cases (auth/member/filter/scope/pagination)                      |
| `portal/src/app/projects/[slug]/bugs/[id]/page.test.tsx`       | VERIFIED | 12 vitest cases (incl. Test 7 + Test 8 staff-field-hidden via renderToStaticMarkup) |
| `portal/src/app/projects/[slug]/bugs/BugListClient.test.tsx`   | VERIFIED | 4 RTL cases (chip URL replace + globalThis.fetch spy)                    |
| `portal/package.json` v0.3.6 stage                             | VERIFIED | `package.json` reached 0.3.6 at end of plan 02 (now 0.4.0 at phase close) |

**Key links**: All 5 key_links pass — `BugStatusPill` import + `bugReports` schema import + `getCurrentUserContext` import + `<ReleasedInSidebar` JSX + `getReleaseHistoryForBug(` call all present in source.

### Plan 23-03: Feature read surface (FEAT-01 list + FEAT-02 detail)

| Truth                                                                                                   | Status     | Evidence                                                                                                              |
|---------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------------------|
| Authenticated customer browsing list sees only that project's features                                  | VERIFIED   | `features/page.tsx` line 72-75 (`eq(featureRequests.project, project.key)`)                                           |
| Non-member browsing list receives 404                                                                   | VERIFIED   | `features/page.tsx` line 67                                                                                            |
| Status filter via URL narrows query (9 statuses incl. plan_generated/shipped/declined)                  | VERIFIED   | `features/page.tsx` lines 26-36 ALLOWED_STATUSES + 70-75                                                              |
| URL `?project=other` ignored                                                                            | VERIFIED   | `features/page.tsx` line 53 (Pitfall 4 guard comment + scope keyed only on `project.key`)                              |
| PAGE_SIZE=20 + sentinel                                                                                  | VERIFIED   | `features/page.tsx` line 24 + 82                                                                                       |
| Detail renders feature fields + ReleasedInSidebar                                                        | VERIFIED   | `features/[id]/page.tsx` line 65 + line 129                                                                            |
| Detail HIDES `triarchNotes`, `buildPlan`, `buildPlanStatus`, `estimatedEffort`                          | VERIFIED   | `grep -F 'feature.{triarchNotes,buildPlan,buildPlanStatus,estimatedEffort}' [id]/page.tsx` → 0 each                    |
| Detail returns 404 if feature.project ≠ URL slug                                                        | VERIFIED   | `features/[id]/page.tsx` line 62                                                                                       |
| Both pages use `FeatureStatusPill` from StatusPill.tsx                                                   | VERIFIED   | `features/[id]/page.tsx` line 10; `FeatureListClient.tsx` line 4                                                      |
| Both pages are server components                                                                         | VERIFIED   | First non-empty line of each is `import`                                                                              |
| `useCase` rendered when set                                                                              | VERIFIED   | `features/[id]/page.tsx` line 107-116 (conditional render: `{feature.useCase ? ... : null}`)                          |

**Artifacts**

| Artifact                                                                | Status   | Details                                                                  |
|-------------------------------------------------------------------------|----------|--------------------------------------------------------------------------|
| `portal/src/app/projects/[slug]/features/page.tsx`                      | VERIFIED | 122 lines; 2 `notFound()`; 9-status ALLOWED_STATUSES; PAGE_SIZE+1 sentinel |
| `portal/src/app/projects/[slug]/features/FeatureListClient.tsx`         | VERIFIED | 'use client'; `router.replace` (3 occurrences); 0 `fetch` calls          |
| `portal/src/app/projects/[slug]/features/[id]/page.tsx`                 | VERIFIED | 4 `notFound()` calls; staff fields hidden; `<ReleasedInSidebar` rendered |
| `portal/src/app/projects/[slug]/features/page.test.tsx`                 | VERIFIED | 8 vitest cases                                                            |
| `portal/src/app/projects/[slug]/features/[id]/page.test.tsx`            | VERIFIED | 16 vitest cases (incl. 4 staff-field-hidden + useCase conditional)       |
| `portal/src/app/projects/[slug]/features/FeatureListClient.test.tsx`    | VERIFIED | 4 RTL cases                                                               |
| `portal/package.json` v0.3.7 stage                                      | VERIFIED | Reached 0.3.7 at end of plan 03 (now 0.4.0 at phase close)               |

**Key links**: All 5 key_links pass — `FeatureStatusPill` import + `featureRequests` schema import + `getCurrentUserContext` import + `<ReleasedInSidebar` JSX + `getReleaseHistoryForFeature(` call all present.

### Plan 23-04: Submission write surface (BUG-03 + FEAT-03 + Slack helpers + apphosting)

| Truth                                                                                                                  | Status     | Evidence                                                                                                                  |
|------------------------------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------------------------------------|
| POST /api/projects/[slug]/bugs creates `bug_reports` row with reportedByUserId=session email + project=URL slug         | VERIFIED   | `bugs/route.ts` lines 105-120 (INSERT with `reportedByUserId: ctx.email`, `project: project.key`)                          |
| POST /api/projects/[slug]/features creates `feature_requests` row with requestedByUserId=session email                  | VERIFIED   | `features/route.ts` lines 79-91                                                                                            |
| Both POST routes fire Slack notification BEFORE returning response                                                      | VERIFIED   | `bugs/route.ts` lines 122-151 (Slack call) before line 169 (response); same shape in `features/route.ts`. Tests 11 + FEAT-11 use `mock.invocationCallOrder` |
| Slack failure does NOT roll back the INSERT (fire-and-forget try/catch)                                                 | VERIFIED   | `bugs/route.ts` lines 125-151 (try/catch around Slack post; INSERT already committed); same in features/route.ts          |
| Cross-project POST (member of A submitting to B) returns 404, no row, no Slack post                                     | VERIFIED   | `bugs/route.ts` lines 65-68; route.test.ts Test 6 (FEAT-6 in features/route.test.ts) explicitly tests this                 |
| Non-member POST returns 404                                                                                              | VERIFIED   | Same code path as cross-project (membership check at line 65-68)                                                          |
| Unauthenticated POST returns 401                                                                                          | VERIFIED   | `bugs/route.ts` lines 39-47                                                                                                |
| Title and description required; missing → 400 with NO row created                                                       | VERIFIED   | `bugs/route.ts` lines 77-82                                                                                                |
| Submit button disabled while in-flight (Pitfall 7)                                                                       | VERIFIED   | `BugForm.tsx` line 33-34 + 195 (`disabled={!canSubmit}` where `canSubmit` includes `!submitting`); same FeatureForm        |
| After successful submit, client redirects to detail page                                                                | VERIFIED   | `BugForm.tsx` line 70 (`router.push(\`/projects/${projectSlug}/bugs/${bugId}\`)`); FeatureForm line 54                    |
| Customer strings sanitized via sanitizeForSlack before composing Slack body (Pitfall 10)                                | VERIFIED   | `portal-slack.ts` lines 242-248 + 332-338 (sanitizeForSlack on title, desc, reporter, project name)                        |
| Slack messages contain NO admin-only Block Kit action_ids                                                                | VERIFIED   | `grep -E '(approve_fix\|defer_fix\|approve_feature\|discuss_feature\|decline_feature)' portal-slack.ts` → 0                |
| Email-length guard: ctx.email > 128 chars returns 400 invalid_email (Pitfall 2)                                          | VERIFIED   | `bugs/route.ts` line 50-52 + `features/route.ts` line 36-38; tests 3 + FEAT-3 verify                                       |
| slack_message_ts + slack_channel_id columns updated on INSERTed row after Slack post succeeds (RESEARCH OQ-2)            | VERIFIED   | `bugs/route.ts` lines 154-166 (best-effort UPDATE inside try/catch); same in features/route.ts                            |
| Phase-close version bump portal package.json 0.3.7 → 0.4.0 (minor)                                                       | VERIFIED   | `grep '"version"' portal/package.json` returns `"0.4.0"`                                                                   |

**Artifacts**

| Artifact                                                                | Status   | Details                                                                                                  |
|-------------------------------------------------------------------------|----------|----------------------------------------------------------------------------------------------------------|
| `portal/src/lib/portal-slack.ts`                                        | VERIFIED | 396 lines; exports `postBugSubmissionNotification`, `postFeatureSubmissionNotification`, plus 2 from 22-04 |
| `portal/src/app/api/projects/[slug]/bugs/route.ts`                      | VERIFIED | 170 lines; full Phase 22-04 envelope                                                                      |
| `portal/src/app/api/projects/[slug]/features/route.ts`                  | VERIFIED | 141 lines; mirror envelope                                                                                |
| `portal/src/app/projects/[slug]/bugs/new/page.tsx`                      | VERIFIED | Server shell; 2 `notFound()`; renders `<BugForm projectSlug={project.key} />`                            |
| `portal/src/app/projects/[slug]/bugs/new/BugForm.tsx`                   | VERIFIED | 'use client'; controlled inputs; submit-disabled-while-in-flight; router.push redirect                    |
| `portal/src/app/projects/[slug]/features/new/page.tsx`                  | VERIFIED | Server shell mirror                                                                                       |
| `portal/src/app/projects/[slug]/features/new/FeatureForm.tsx`           | VERIFIED | 'use client'; mirror with useCase                                                                         |
| `portal/apphosting.yaml`                                                | VERIFIED | Contains `PORTAL_BUG_REPORTS_CHANNEL` + `PORTAL_FEATURE_REQUESTS_CHANNEL`                                 |
| `portal/apphosting.dev.yaml`                                            | VERIFIED | Contains both channels with `-test` overlay                                                               |
| `portal/package.json`                                                   | VERIFIED | `"version": "0.4.0"`                                                                                       |

**Key links**

| From                                                  | To                                                                  | Status   | Detail                                                            |
|-------------------------------------------------------|---------------------------------------------------------------------|----------|-------------------------------------------------------------------|
| `bugs/route.ts`                                       | `portal-slack.ts.postBugSubmissionNotification`                     | VERIFIED | `postBugSubmissionNotification(` called at line 126                |
| `features/route.ts`                                   | `portal-slack.ts.postFeatureSubmissionNotification`                 | VERIFIED | `postFeatureSubmissionNotification(` called at line 97             |
| `bugs/route.ts`                                       | `bugReports` schema (db.insert)                                     | VERIFIED | `db.insert(bugReports)` at line 105                                |
| `features/route.ts`                                   | `featureRequests` schema (db.insert)                                | VERIFIED | `db.insert(featureRequests)` at line 79                            |
| `BugForm.tsx`                                         | `/api/projects/[slug]/bugs` (fetch POST)                            | VERIFIED | `fetch(\`/api/projects/${projectSlug}/bugs\`, ...)` at line 42     |
| `FeatureForm.tsx`                                     | `/api/projects/[slug]/features` (fetch POST)                        | VERIFIED | `fetch(\`/api/projects/${projectSlug}/features\`, ...)` at line 29 |
| `portal-slack.ts.postBugSubmissionNotification`       | `sanitize-commit.sanitizeForSlack`                                  | VERIFIED | `sanitizeForSlack` called 4× in helper (title/desc/reporter/proj)  |

## Requirements Trace

| Req     | Plan(s)        | Status     | Evidence                                                                                                                                                |
|---------|----------------|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| BUG-01  | 23-01 + 23-02  | SATISFIED  | `bugs/page.tsx` (membership-scoped list); `BugStatusPill` (status pills); `BugListClient.tsx` (filter chips). REQUIREMENTS.md line marks Complete.       |
| BUG-02  | 23-01 + 23-02  | SATISFIED  | `bugs/[id]/page.tsx` renders detail + `<ReleasedInSidebar>`; staff fields hidden; cross-project 404. REQUIREMENTS.md Complete.                          |
| BUG-03  | 23-04          | SATISFIED  | `bugs/new/page.tsx` shell + `BugForm.tsx` + `bugs/route.ts` POST handler creates bug_reports row with reporter_email=session email + project=URL slug. |
| FEAT-01 | 23-01 + 23-03  | SATISFIED  | `features/page.tsx` (membership-scoped list); `FeatureStatusPill` (9-status pills). REQUIREMENTS.md Complete.                                            |
| FEAT-02 | 23-01 + 23-03  | SATISFIED  | `features/[id]/page.tsx` renders detail + `<ReleasedInSidebar>`; 4 staff fields hidden; cross-project 404. REQUIREMENTS.md Complete.                    |
| FEAT-03 | 23-04          | SATISFIED  | `features/new/page.tsx` shell + `FeatureForm.tsx` + `features/route.ts` POST handler creates feature_requests row with reporter_email + project_key.   |

No orphaned requirements: REQUIREMENTS.md maps BUG-01..03 + FEAT-01..03 to Phase 23, and each is claimed by at least one PLAN frontmatter `requirements:` field.

## Cross-Cutting Checks

| # | Check                                                                                                       | Status   | Detail                                                                                                                                                       |
|---|-------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Membership 404-not-403 across all 6 customer routes                                                         | VERIFIED | All 4 GET pages + 2 POST routes call `notFound()` / `return 404` on missing project AND on `!ctx.isStaff && !membership`. Code paths inspected; tests cover. |
| 2 | Staff-only field hiding (bug detail: triarchNotes, fixCommitSha; feature detail: 4 fields)                  | VERIFIED | `grep -F` returns 0 in source for all 6 forbidden field references; tests 7-10 in detail tests assert via renderToStaticMarkup that sentinel values absent.  |
| 3 | Slack-before-response ordering (auth → INSERT → Slack → response)                                            | VERIFIED | `bugs/route.ts` and `features/route.ts` both order Slack before final NextResponse.json; tests use `mock.invocationCallOrder` (5 occurrences in bugs.test, 4 in features.test). |
| 4 | Schema NOT NULL invariants populated: `bug_reports.reportedByUserId` = session email; `feature_requests.requestedByUserId` = session email | VERIFIED | `grep -F 'reportedByUserId: ctx.email' bugs/route.ts` → 1; `grep -F 'requestedByUserId: ctx.email' features/route.ts` → 1.                                |
| 5 | Cross-project POST returns 404 with no row, no Slack post                                                    | VERIFIED | Tests `Test 6` in bugs/route.test.ts and `FEAT-6` in features/route.test.ts assert this; route source has membership check at lines 65-68 (bugs) / 51-53 (features). |
| 6 | Customer redirect to detail page on submit (router.push)                                                     | VERIFIED | `BugForm.tsx` line 70: `router.push(\`/projects/${projectSlug}/bugs/${bugId}\`)`. `FeatureForm.tsx` line 54: `router.push(\`/projects/${projectSlug}/features/${featureId}\`)`. |
| 7 | No double-Slack-posting risk — admin's notifyBugReport / notifyFeatureRequest remain orphaned; portal helpers post to NEW channels | VERIFIED | `grep -rn -E 'notifyBugReport\|notifyFeatureRequest' admin/src` returns ONLY the 2 definitions in `slack.ts:194,255` — no callers. Portal channels (`PORTAL_BUG_REPORTS_CHANNEL`, `PORTAL_FEATURE_REQUESTS_CHANNEL`) distinct from `SLACK_RELEASE_APPROVAL_CHANNEL`. |
| 8 | No admin-only Block Kit action_ids in portal Slack messages                                                  | VERIFIED | `grep -E '(approve_fix\|defer_fix\|approve_feature\|discuss_feature\|decline_feature)' portal/src/lib/portal-slack.ts` → 0. Plain section blocks only.        |
| 9 | 128-char email length guard (Pitfall 2)                                                                      | VERIFIED | `EMAIL_MAX = 128` constant in both routes; `if (ctx.email.length > EMAIL_MAX) return 400 invalid_email`. Tests 3 + FEAT-3 verify (5 invalid_email test occurrences). |
| 10 | Form double-submit prevention (Pitfall 7)                                                                    | VERIFIED | Both forms: `disabled={!canSubmit}` where `canSubmit = title.trim() && description.trim() && !submitting`. Tests T4 + F4 click submit twice in rapid succession and assert exactly 1 fetch call. |
| 11 | A-3 architectural — ReleasedInSidebar populates via `release_log_links` join, NOT freeform `bug.fixVersion` / `feature.shippedVersion` columns | VERIFIED | Detail pages call `getReleaseHistoryFor{Bug,Feature}` (Phase 11 join mechanism). `bug.fixVersion` and `feature.shippedVersion` appear ONLY inside docstring comments (line 20 of each detail page) — never rendered. When join empty, sidebar shows "Not released yet". |

## Test Suite Verification

Ran `npx vitest run` from `portal/`:

```
 Test Files  33 passed (33)
      Tests  290 passed | 1 skipped (291)
   Duration  2.81s
```

This matches the per-plan SUMMARY counts exactly: 167 (pre-23) → 179 (post-23-01) → 203 (post-23-02) → 231 (post-23-03) → **290 (post-23-04)**. Cumulative delta +123 cases.

## Portal Repo State

- `package.json` version: `"0.4.0"` (Phase 23 close)
- Last 4 commits on `main` (newest first):
  - `9137026  v0.4.0: bug + feature submission write surface (BUG-03, FEAT-03) — Phase 23 close (#19)`
  - `b48e974  v0.3.7: feature list + detail customer surface (FEAT-01, FEAT-02) (#18)`
  - `227c838  v0.3.6: bug list + detail customer surface (BUG-01, BUG-02) (#17)`
  - `c0d06cd  v0.3.5: bug/feature surface foundations (ReleasedInSidebar + StatusPill) (#16)`

## Anti-Patterns Found

None. All scans returned clean:
- No TODO / FIXME / placeholder / stub markers in shipped code
- No empty implementations (all routes/pages return real data)
- No hardcoded empty data flows to render in customer-visible paths
- No console.log-only handlers
- No accidental `'use client'` on server components (verified by readFileSync source-inspect tests)
- No accidental `'use server'` on client islands (`grep -F "'use server'"` on form files → 0)

## Human Verification Required

The following items are flagged for post-merge live testing (carried forward from per-plan SUMMARYs). They are not blockers — the codebase contract is verified — but they confirm end-to-end behavior on real infrastructure:

### 1. Customer bug submission round-trip on portal-dev

**Test:** Sign in to `https://portal-dev--triarch-dev-website.us-central1.hosted.app` as a customer admin of an existing project (e.g. `truth-treason`). Navigate to `/projects/truth-treason/bugs/new`. Fill in title + description. Click "Submit bug".

**Expected:** Within ~3 sec, redirect lands at `/projects/truth-treason/bugs/<new-id>` showing the bug detail page. ReleasedInSidebar shows "Not released yet". CRDB `bug_reports` row exists with `reportedByUserId = <customer email>`, `project = 'truth-treason'`, `status = 'submitted'`, `priority = 'fix_later'`, `severity = 'medium'`, `slack_message_ts != null`, `slack_channel_id != null`. Slack message lands in `#triarch-bugs-test` (dev overlay) with `:bug:` emoji + project name + severity emoji + reporter email + truncated description. NO action buttons.

**Why human:** Requires live OAuth + live CockroachDB write + live Slack post on dev backend.

### 2. Customer feature submission round-trip on portal-dev

**Test:** Same as #1 for `/projects/truth-treason/features/new`.

**Expected:** `feature_requests` row + Slack message in `#triarch-features-test`.

**Why human:** Same as #1.

### 3. Cross-project POST defense (curl)

**Test:** From terminal: `curl -X POST -H 'Cookie: <portal session cookie>' -H 'Content-Type: application/json' -d '{"title":"x","description":"y"}' https://portal-dev--triarch-dev-website.us-central1.hosted.app/api/projects/<project-B-slug>/bugs` where you're a member of project A but NOT project B.

**Expected:** HTTP 404 with `{"error":"Not found"}` body. NO row inserted in `bug_reports` for project B. NO Slack post in `#triarch-bugs-test`.

**Why human:** Requires authenticated portal session for project A + curl to project B's slug.

### 4. End-to-end staff triage round-trip

**Test:** After a portal bug submission, open admin `/admin/modules/bug-reports/[id]` and PATCH status to 'fixed' + set fix_version. Deploy a dev release referencing the bug commit. Verify the customer detail page on portal reflects the new status pill + ReleasedInSidebar populates from `release_log_links` once Phase 11's commit-parser stamps the row.

**Expected:** Status pill changes from "submitted" → "fixed"; ReleasedInSidebar shows "Released in v1.5.X dev" (or similar).

**Why human:** Requires multi-system orchestration (admin PATCH + dev deploy + commit-parser stamping).

### 5. Mobile (375px viewport)

**Test:** Chrome devtools at 375px width. Walk through `/projects/[slug]/bugs`, `/bugs/[id]`, `/bugs/new` (and feature equivalents) on portal-dev.

**Expected:** Layouts render without horizontal scroll; sidebar collapses below main content at lg breakpoint; submit button doesn't wrap awkwardly; `<details>` disclosure for optional bug fields toggles cleanly.

**Why human:** Visual verification on real mobile rendering.

### 6. Slack channel existence

**Test:** Confirm `#triarch-bugs-test` and `#triarch-features-test` exist in the Triarch Slack workspace and the portal Slack bot has access. (Production channels `#triarch-bugs` and `#triarch-features` similarly.)

**Expected:** Channels exist; bot is a member.

**Why human:** Requires Slack workspace admin access. If channels don't exist, `chat.postMessage` returns `{ ok: false, error: 'channel_not_found' }` — the INSERT still succeeds (fire-and-forget), but Slack notification is silently dropped.

## Gaps

None. All 35 must-haves pass; all 6 requirements satisfied; all 11 cross-cutting checks verified; test suite at 290 GREEN.

## Verdict

**passed** — Phase 23 achieves its goal. Customer-facing bug + feature CRUD primitive is end-to-end on portal: ReleasedInSidebar/StatusPill foundations (23-01), bug list+detail (23-02), feature list+detail (23-03), submission write paths with Slack notifications + apphosting bindings + phase-close v0.4.0 minor bump (23-04). All architectural pitfalls (4, 5, 6, 7, 9, 10, 11) anchored in tests with grep guards. Phase 22 invariants (no double-Slack-posting, admin helpers orphaned, channels distinct) preserved. Phase 24+ unblocked.

---

_Verified: 2026-05-09T15:35:00Z_
_Verifier: Claude (gsd-verifier)_
