# Phase 23: Bug + Feature Customer Surface - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the customer-facing portal surface for bugs and features: list, detail, and submission for both primitives. Each route is membership-scoped (404, not 403, for non-members). Submissions create rows in `bug_reports` / `feature_requests` (already in `@myalterlego/triarch-shared/schema`) with `reporter_email` and `reportedByUserId` derived from session, and `project` derived from URL slug. Customers cannot edit or withdraw submissions in v2.2 — staff triages via admin.

Out of scope for this phase: customer comment threads, edit/delete flows, admin staff UI changes (admin's existing `/admin/modules/bug-reports` and `/admin/modules/feature-requests` pages stay as-is).

</domain>

<decisions>
## Implementation Decisions

### Visibility (what customers see)
- Bug/feature list shows ALL statuses (submitted, triaged, approved, in_progress, fixed, verified, closed, deferred) with status pills — matches admin precedent; customer mentally filters
- Detail pages HIDE staff-only fields (`triarchNotes`, `fixCommitSha`) — read-only customer view, no internal notes leaked
- No discussion / comment thread on detail page in v2.2 — customers use Slack/feedback for follow-up
- No reporter-only filter ("show only my submissions") in v2.2 — keep list simple; customer can scroll

### Submission UX
- Bug submit required fields: `title` + `description` only. `severity` (default "medium"), `stepsToReproduce`, `expectedBehavior`, `actualBehavior` all optional
- Feature submit required fields: `title` + `description` only. `useCase` optional
- Single-page form layout (not multi-step, not modal) — title at top, description, optional fields below, submit button at bottom
- After successful submit → redirect to the just-created bug/feature's detail page (URL copyable, confirmation visible)

### Lifecycle & Notifications
- Customers cannot EDIT their own submission in v2.2 — submission is immutable from customer side
- Customers cannot DELETE/withdraw their own submission in v2.2 — staff triages
- Portal-owned Slack notification fires on customer-origin submission. New `PORTAL_BUG_REPORTS_CHANNEL` / `PORTAL_FEATURE_REQUESTS_CHANNEL` bindings (or shared channel). Mirrors Phase 22's portal-Slack pattern: `portal-slack.ts` gets new helpers `postBugSubmissionNotification` + `postFeatureSubmissionNotification`. Same `PORTAL_SLACK_BOT_TOKEN` secret as Phase 22.
- `reportedByUserId` and `requestedByUserId` populated as `session.user.email` (string, NOT NULL) — same convention as Phase 22's `release_feedback.author_email`. Maintains customer-origin consistency. NOT the OAuth `sub` (different identity dimension; staff-side rows use `sub`, customer-side uses email).

### Claude's Discretion
- All visual styling: status-pill colors match admin's `STATUS_COLORS` map (port via shared package or duplicate small map in portal — Claude picks based on whether other components need them)
- Pagination: PAGE_SIZE=20 with `hasMore` sentinel via PAGE_SIZE+1 fetch (Phase 21 precedent — not negotiable, but how Claude wires it is discretionary)
- Mobile-responsive layout: standing rule, Claude implements without asking
- API route paths follow `/api/projects/[slug]/bugs/...` and `/api/projects/[slug]/features/...` (Phase 21/22 pattern — not a question)
- Drizzle direct via `@myalterlego/triarch-shared/schema` (Phase 21 pattern — not a question)
- `ReleasedInSidebar` component reuse: extract to shared package OR duplicate in portal — Claude decides based on whether other portal pages need it

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@myalterlego/triarch-shared/schema`: `bugReports` (line 305) and `featureRequests` (line 332) tables — both keyed by `project` varchar, NOT `project_key` (note schema convention)
- `@myalterlego/triarch-shared/auth-context`: `getCurrentUserContext({ user: { email } })` — used in Phase 21 portal release page for membership check
- `portal/src/lib/portal-slack.ts` (from Phase 22): factory pattern for portal-owned Slack posts; extend with bug/feature submission helpers
- `portal/src/lib/internal-dispatch.ts` (from Phase 22): HMAC sender — not needed for this phase (no admin-side dispatch required for bug/feature submission)
- `admin/src/components/ReleasedInSidebar.tsx`: existing component used by admin's bug-reports and feature-requests detail pages; consider extracting to shared package if portal needs it (most likely yes per BUG-02 + FEAT-02 success criteria)
- `admin/src/app/admin/modules/bug-reports/page.tsx` and `/[id]/page.tsx`: visual reference for status pills, severity colors, layout — not for direct port (those are staff-edit pages with controls customers shouldn't see)

### Established Patterns
- Membership 404-not-403: `getCurrentUserContext` → check `ctx.memberships.find(m => m.project_key === project.key)` → if not member, `notFound()`. Phase 21 PORTAL-03 precedent
- Pagination: `PAGE_SIZE=20`, `hasMore` sentinel via `LIMIT (PAGE_SIZE + 1)` fetch and slice. Phase 21 release page precedent
- Customer write paths (Phase 22): atomic INSERT with NOT NULL invariants, fire-and-forget Slack post BEFORE response, 404 on cross-project attempt — same pattern applies to bug/feature submission
- Portal route handlers query directly via `getDb()` from `@myalterlego/triarch-shared/db`, no helper layer required
- Tests: Vitest 4.x with `@/` alias, colocated `route.test.ts` next to `route.ts`. Mock `getCurrentUserContext`, mock `getDb()`'s drizzle chain via `vi.fn()` returning mock data

### Integration Points
- Portal nav: portal currently has `/projects/[slug]/releases` from Phase 21 — add `/projects/[slug]/bugs` and `/projects/[slug]/features` as siblings. Update portal's project sub-nav (likely a `<nav>` block in `projects/[slug]/layout.tsx` if it exists, otherwise add)
- New env bindings in portal `apphosting.yaml` + `apphosting.dev.yaml`: `PORTAL_BUG_REPORTS_CHANNEL`, `PORTAL_FEATURE_REQUESTS_CHANNEL` (or one combined channel — Claude picks). `PORTAL_SLACK_BOT_TOKEN` already bound from Phase 22
- Admin remains the staff surface for triaging; no admin code changes in this phase

</code_context>

<specifics>
## Specific Ideas

- Match status-pill colors from admin's `bug-reports/page.tsx` (top of file: SEVERITY_COLORS, STATUS_COLORS maps). Customer-facing pills should look identical to staff so vocabulary is consistent across the dev → customer divide.
- For the customer detail page, `ReleasedInSidebar` MUST show `fixVersion` (bugs) / `shippedVersion` (features) when set — this is the headline value-add of the customer detail page (BUG-02 + FEAT-02). When unset, sidebar shows "Not yet released" rather than being absent.

</specifics>

<deferred>
## Deferred Ideas

- Customer comment thread / discussion on bug or feature detail (deferred to a future milestone — not v2.2)
- Customer edit / withdraw / delete of own submissions (deferred — adds 24h-window logic + audit complexity)
- Customer "show only my submissions" filter (deferred — adds query param plumbing)
- Customer upvote on feature requests (admin's schema has `upvotes` int but no customer-side increment path — deferred)
- File / screenshot attachment on bug submission (admin's schema has `screenshotUrls` but signed-upload flow is non-trivial — deferred)
- Customer notification when their submission status changes (e.g. moved to "fixed") — deferred; customer would re-poll the detail page

</deferred>
