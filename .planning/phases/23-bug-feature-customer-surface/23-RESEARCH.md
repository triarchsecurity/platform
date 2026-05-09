# Phase 23: Bug + Feature Customer Surface - Research

**Researched:** 2026-05-08
**Domain:** Customer-facing bug/feature CRUD on portal — list, detail, new submission — across two repos (admin owns schema + reference UI; portal owns customer routes)
**Confidence:** HIGH (all questions resolved against live code; one Open Question on `slackChannelId` field reuse policy is documented but doesn't block the plan)

## Summary

Phase 23 ships the two net-new customer primitives (bugs and features) on the portal, mirroring exactly the patterns already proven in Phases 21 (read) and 22 (write). The schema is in place since v1.14 and is fully usable as-is — `bug_reports.project` (varchar 64, NOT NULL), `bug_reports.reportedByUserId` (varchar 128, NOT NULL), `bug_reports.reportedByEmail` (varchar 256, nullable), and the feature-side analogues are dimensioned to accept email values for both columns. The CONTEXT.md decision to populate `reportedByUserId` with `session.user.email` is schema-safe (128-char column easily accommodates a 256-cap email; downstream consumers — Slack handlers and workflow_transitions logging — treat the column as opaque). No migration is needed.

Portal has no `/projects/[slug]/layout.tsx` today — every existing page (`releases`, `projects`) does its own membership check via `getPortalSession() → getCurrentUserContext({ user: { email } }) → ctx.memberships.find(m => m.project_key === slug) → notFound()`. Phase 23 follows that pattern verbatim across 6 new server components and 3 new POST routes (15 routes/pages total: 6 read pages + 6 corresponding `route.ts` files + 1 form-page client island per primitive — see Implementation Approach). One important nuance discovered: `getCurrentUserContext` returns `{ email, isStaff, memberships }` where `memberships` is a flat array; the helper does NOT 404 leak project existence — the route handler must.

The reference admin pages (`/admin/modules/bug-reports/{,[id]/}page.tsx` and feature-requests counterparts) are NOT a direct port — they're staff-edit pages with PATCH controls (status select, priority toggle, triarch_notes). The customer view strips all of that. The detail page becomes a pure read-only render of bug fields (with `triarchNotes` and `fixCommitSha` HIDDEN per CONTEXT.md), the `ReleasedInSidebar` component (already a server component, props-driven, drop-in reusable), and a back-link to the list. The list mirrors admin's expandable row UI but without the inline status-edit controls. `STATUS_COLORS` and `SEVERITY_COLORS` maps duplicate cleanly into portal — they're 8-line objects; making them shared package exports would be premature abstraction since admin's already-shipped detail pages have their own copies (12-CONTEXT.md note "reused inline per plan; no shared util yet").

Submission Slack notifications are a *new* wiring, not a port. Admin's `src/lib/slack.ts` exports `notifyBugReport()` and `notifyFeatureRequest()` (with full Block Kit including `approve_fix`/`defer_fix` and `approve_feature`/`discuss_feature`/`decline_feature` action_ids). **Critical finding:** these admin helpers are ORPHANED — no source file calls them. The submission code paths (`/api/platform/bug-reports POST`, `/api/platform/feature-requests POST`, `/api/platform/ingest/bug-reports POST`, `/api/platform/ingest/feature-requests POST`) all go straight from `db.insert(bugReports).values(...).returning()` to the response with zero Slack post in between. Phase 23 establishes the precedent: portal posts to Slack from the customer-origin route via a *new* `portal-slack.ts` helper pair (`postBugSubmissionNotification` / `postFeatureSubmissionNotification`) — plain section blocks only, no admin-owned action_ids (Pitfall 9 from Phase 22 directly applies).

The existing admin ingest routes (`/api/platform/ingest/bug-reports`, `/api/platform/ingest/feature-requests`) are NOT customer-portal entry points and must NOT be repurposed — they're API-key-authed embedded-widget endpoints used by `<BugReportForm>` and `<BugReportWidget>` shared-ui components that get embedded inside customer projects (e.g., darksouls-rpg). They keep working unchanged. Phase 23 builds entirely portal-native routes with NextAuth session auth (per CONTEXT.md decision); the admin ingest routes serve a different surface entirely (third-party-app embed → admin via project apiKey).

**Primary recommendation:** Mirror Phase 21+22 verbatim. Three plan waves: (1) port `release-history.ts` exports + `ReleasedInSidebar.tsx` to portal (via shared package re-export for the lib, copy for the component since it's UI); (2) ship 4 read pages + portal-slack helpers; (3) ship 2 POST routes + 2 new-submission form pages + apphosting Slack channel bindings. Portal version `v0.3.4 → v0.4.0`. Admin version unchanged (no admin code edits — schema is already in place; reference admin pages are not modified).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visibility (what customers see):**
- Bug/feature list shows ALL statuses (submitted, triaged, approved, in_progress, fixed, verified, closed, deferred) with status pills — matches admin precedent; customer mentally filters
- Detail pages HIDE staff-only fields (`triarchNotes`, `fixCommitSha`) — read-only customer view, no internal notes leaked
- No discussion / comment thread on detail page in v2.2 — customers use Slack/feedback for follow-up
- No reporter-only filter ("show only my submissions") in v2.2 — keep list simple; customer can scroll

**Submission UX:**
- Bug submit required fields: `title` + `description` only. `severity` (default "medium"), `stepsToReproduce`, `expectedBehavior`, `actualBehavior` all optional
- Feature submit required fields: `title` + `description` only. `useCase` optional
- Single-page form layout (not multi-step, not modal) — title at top, description, optional fields below, submit button at bottom
- After successful submit → redirect to the just-created bug/feature's detail page (URL copyable, confirmation visible)

**Lifecycle & Notifications:**
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

### Deferred Ideas (OUT OF SCOPE)
- Customer comment thread / discussion on bug or feature detail (deferred to a future milestone — not v2.2)
- Customer edit / withdraw / delete of own submissions (deferred — adds 24h-window logic + audit complexity)
- Customer "show only my submissions" filter (deferred — adds query param plumbing)
- Customer upvote on feature requests (admin's schema has `upvotes` int but no customer-side increment path — deferred)
- File / screenshot attachment on bug submission (admin's schema has `screenshotUrls` but signed-upload flow is non-trivial — deferred)
- Customer notification when their submission status changes (e.g. moved to "fixed") — deferred; customer would re-poll the detail page

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-01 | Portal route `/projects/[slug]/bugs` renders membership-scoped bug list with status pills + filter UI | Schema `bugReports` shipped (schema.ts:305); `STATUS_COLORS`/`SEVERITY_COLORS` maps proven in `admin/src/app/admin/modules/bug-reports/page.tsx`; Phase 21's `/projects/[slug]/releases/page.tsx` is the membership+notFound() template; pagination pattern (PAGE_SIZE+1 sentinel) ports verbatim |
| BUG-02 | Portal route `/projects/[slug]/bugs/[id]` renders bug detail with `ReleasedInSidebar` reused from admin (read-only, no staff edit controls) | `ReleasedInSidebar` is a pure server component (no `'use client'`) taking `releaseHistory: ReleaseHistoryRow[]` — drop-in reusable; `getReleaseHistoryForBug` already lives in `@myalterlego/triarch-shared/release-history`; `triarchNotes`/`fixCommitSha` strip is a JSX omission |
| BUG-03 | Portal route `/projects/[slug]/bugs/new` provides customer submission form; POST creates `bug_reports` row with reporter_email + project_key | All NOT NULL columns satisfied: `project` (from URL slug), `reportedByUserId` (session email), `title`/`description` (form-required), `severity` (default 'medium'), `priority` (default 'fix_later'), `status` (default 'submitted'). Slack-before-response ordering pattern from Phase 22-04 approve route applies |
| FEAT-01 | Portal route `/projects/[slug]/features` renders membership-scoped feature list with status pills | Same template as BUG-01; schema `featureRequests` (schema.ts:332) has feature-specific columns (`useCase`, `targetVersion`, `shippedVersion`, `upvotes`); STATUS_COLORS map differs from bugs (9 statuses incl. `plan_generated`/`shipped`/`declined`) — see Code Examples |
| FEAT-02 | Portal route `/projects/[slug]/features/[id]` renders feature detail with `ReleasedInSidebar` (read-only) | `getReleaseHistoryForFeature` exported from same shared module as bugs counterpart; sidebar shows `targetVersion` (from `feat.targetVersion`) + `shippedVersion` (from `feat.shippedVersion`) — ReleasedInSidebar already handles dev/prod split |
| FEAT-03 | Portal route `/projects/[slug]/features/new` provides customer submission form; POST creates `feature_requests` row with reporter_email + project_key | Required: `project`, `requestedByUserId`, `title`, `description`. `useCase` optional. `priority` defaults 'normal'. `status` defaults 'submitted'. Same Slack-before-response pattern |

## Standard Stack

### Already in place (no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.2 | App Router server components + route handlers | Already inherited from portal scaffold (Phase 18) |
| React | 19.2.4 | Form state in `'use client'` submit pages | Inherited |
| `@myalterlego/triarch-shared` | ^0.3.0 | `schema`, `auth`, `release-history`, `db` | Inherited from Phase 21+22 |
| `@myalterlego/secrets` | ^0.1.0 | `getSecret('PORTAL_SLACK_BOT_TOKEN')` | Inherited from Phase 22-04 |
| Drizzle ORM | ^0.45.2 | Direct query against shared schema | Inherited (DB-01 verified) |
| Vitest | ^4.1.5 (jsdom) | RTL component tests + route handler tests | Inherited setup |
| Tailwind CSS | ^4 | Utility-first styling | Inherited |
| `lucide-react` | ^1.7.0 | `<Bug>`, `<Lightbulb>`, icons | Inherited (admin uses these for the same modules) |
| `next-auth` | ^4.24.13 | Customer session via `getPortalSession()` | Inherited |

### Verified versions (npm registry)
- Portal `package.json` v0.3.4 → bumps to v0.4.0 at phase close (minor — net-new customer surface). All deps already pinned at the versions Phase 22 shipped; no new packages required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct Drizzle query in route handler | Helper layer in `portal/src/lib/bug-mutations.ts` | Phase 22 used `release-mutations.ts` because INSERT had a non-trivial UPDATE-then-INSERT atomic pattern. Bug/feature submission is a single INSERT — the `release-mutations.ts` precedent is overkill. Recommend keeping route-handler-direct |
| Server actions (`'use server'`) for form POST | Pure POST routes + client `fetch` | Server actions add complexity for negligible benefit at one form. Phase 22 used `fetch` from client islands consistently — match that |
| Custom React Hook Form / Zod | Plain controlled `useState` | Two-field-required forms don't need a form library. Match `BugReportForm.tsx`'s plain controlled-input pattern |

**Installation:** None — all deps already in portal's package.json.

## Architecture Patterns

### Recommended Project Structure (portal additions only)
```
portal/src/
├── app/
│   └── projects/[slug]/
│       ├── bugs/
│       │   ├── page.tsx              # BUG-01 — server component, list
│       │   ├── BugListClient.tsx     # client island for status filter dropdown
│       │   ├── new/
│       │   │   ├── page.tsx          # BUG-03 — server component shell
│       │   │   └── BugForm.tsx       # client island ('use client', useState fields)
│       │   └── [id]/
│       │       └── page.tsx          # BUG-02 — server component, detail (no client island needed)
│       └── features/                 # mirror structure for FEAT-01..03
│           ├── page.tsx
│           ├── FeatureListClient.tsx
│           ├── new/
│           │   ├── page.tsx
│           │   └── FeatureForm.tsx
│           └── [id]/page.tsx
├── app/api/projects/[slug]/
│   ├── bugs/
│   │   └── route.ts                  # POST handler — INSERT + Slack-before-response
│   └── features/
│       └── route.ts                  # POST handler — INSERT + Slack-before-response
├── components/
│   └── ReleasedInSidebar.tsx         # COPY from admin (server component, server-rendered)
└── lib/
    └── portal-slack.ts               # ADD postBugSubmissionNotification + postFeatureSubmissionNotification
```

### Pattern 1: Server Component Page with Membership Guard (BUG-01, BUG-02, FEAT-01, FEAT-02)
**What:** Every `/projects/[slug]/*` server component starts with the same five-line guard.
**When to use:** Every read-path page in this phase.
**Example (verbatim from Phase 21 `releases/page.tsx`, lines 21–45):**
```typescript
// Source: portal/src/app/projects/[slug]/releases/page.tsx:15-46
const session = await getPortalSession();
if (!session?.user?.email) redirect('/login');
const ctx = await getCurrentUserContext({ user: { email: session.user.email } });

const { slug } = await params;

const [project] = await db
  .select({ key: projects.key, name: projects.name })
  .from(projects)
  .where(eq(projects.key, slug));
if (!project) notFound();

const membership = ctx?.memberships.find((m) => m.project_key === project.key);
const isMember = !!ctx && (ctx.isStaff || !!membership);
if (!isMember) notFound();   // PORTAL-03 — 404 not 403, no project-existence leak
```

### Pattern 2: List Page with PAGE_SIZE+1 Sentinel (BUG-01, FEAT-01)
**What:** Fetch `LIMIT (PAGE_SIZE + 1)`, slice off the sentinel, set `hasMore` boolean. Client island handles status filter URL-mirrored chips.
**When to use:** All list pages in v2.2 portal — Phase 21 release page, Phase 23 bug + feature lists.
**Example:**
```typescript
const PAGE_SIZE = 20;
const rows = await db
  .select()
  .from(bugReports)
  .where(eq(bugReports.project, project.key))   // membership-scoped (project guaranteed by guard above)
  .orderBy(desc(bugReports.createdAt))
  .limit(PAGE_SIZE + 1);
const hasMore = rows.length > PAGE_SIZE;
const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
```

### Pattern 3: Submit Route with Slack-before-Response (BUG-03, FEAT-03)
**What:** Identical envelope to Phase 22-04 approve route. Auth ladder → INSERT (atomic, single statement) → fire Slack notification fire-and-forget → return 201 with the new row's id so the client can `redirect(\`/projects/[slug]/bugs/${id}\`)`.
**When to use:** Both submission POST handlers.
**Example:**
```typescript
// Mirror of: portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts:54-203
export async function POST(req, { params }) {
  // 1. Auth
  const session = await getPortalSession();
  if (!session?.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { slug } = await params;
  const ctx = await getCurrentUserContext({ user: { email: session.user.email } });
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 2. Project + membership
  const [project] = await db.select({ key: projects.key, name: projects.name })
    .from(projects).where(eq(projects.key, slug));
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const membership = ctx.memberships.find((m) => m.project_key === project.key);
  const isMember = ctx.isStaff || !!membership;
  if (!isMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // NOTE: viewers CAN submit bugs (BUG-03 doesn't gate by role). Skip the 403 viewer check.

  // 3. Body validation
  const body = await req.json();
  const { title, description, severity, stepsToReproduce, expectedBehavior, actualBehavior } = body;
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'title and description required' }, { status: 400 });
  }

  // 4. INSERT — all NOT NULL columns satisfied
  const [bug] = await db.insert(bugReports).values({
    project: project.key,
    reportedByUserId: ctx.email,    // CONTEXT.md: customer-origin uses email as user-id
    reportedByEmail: ctx.email,
    reportedByName: session.user.name ?? null,
    title: title.trim(),
    description: description.trim(),
    severity: severity ?? 'medium',
    stepsToReproduce: stepsToReproduce?.trim() || null,
    expectedBehavior: expectedBehavior?.trim() || null,
    actualBehavior: actualBehavior?.trim() || null,
    // priority defaults 'fix_later', status defaults 'submitted' (schema)
  }).returning();

  // 5. Workflow transition log (mirror admin's pattern)
  await db.insert(workflowTransitions).values({
    entityType: 'bug_report',
    entityId: bug.id,
    fromStatus: null,
    toStatus: 'submitted',
    transitionedBy: ctx.email,
  });

  // 6. Slack post FIRST — same 3-sec budget reasoning as approve route
  try {
    const slackResult = await postBugSubmissionNotification({
      bug,
      projectName: project.name,
      reporterEmail: ctx.email,
    });
    if (!slackResult.ok) {
      console.warn('[portal-bugs] Slack notification failed', { bugId: bug.id, error: slackResult.error });
    }
  } catch (err) {
    console.warn('[portal-bugs] Slack notification threw', { bugId: bug.id, error: String(err) });
  }

  return NextResponse.json({ ok: true, bug }, { status: 201 });
}
```

### Pattern 4: ReleasedInSidebar Drop-In (BUG-02, FEAT-02)
**What:** `ReleasedInSidebar` from admin (`src/components/ReleasedInSidebar.tsx`) is a pure server component (NO `'use client'`). Props: `{ releaseHistory: ReleaseHistoryRow[] }`. Empty state: "Not released yet". Dev-only / prod-only / both states all render correctly. Version Links currently point at `/admin/modules/pipeline/<projectKey>?release=<version>`.
**When to use:** Both detail pages.
**Discretion:** Decide whether to copy verbatim or fork the Link href. Customer detail does NOT have a portal pipeline page to deep-link to (and shouldn't — staff route). Two clean choices:
1. **Copy + fork the href:** point Link to `/projects/[slug]/releases?version=<version>` (releases page exists; query param is informational).
2. **Copy verbatim and accept that the Link goes to admin** — but admin/projects/* routes will be deleted in Phase 26 (sunset). Choice 2 creates a Phase-26 obligation.

**Recommend Choice 1.** Fork the href in the portal copy; leave admin's untouched.

**Why copy not share:** ReleasedInSidebar imports `formatRelativeTime` from a per-app file (`@/app/projects/[slug]/releases/format`). Sharing the component requires sharing format.ts too — and admin's already uses its own copy. The component is 101 lines; copying is cheaper than untangling the import dependency. CONTEXT.md flags this as Claude's discretion; recommend duplicate (Phase 21 chose duplicate for client islands for the same reason).

### Anti-Patterns to Avoid
- **Server actions for form submit:** Phase 22 used pure POST routes; consistency wins. Don't introduce server actions.
- **Calling admin's `/api/platform/bug-reports POST` from portal:** that's the staff-edit endpoint with `requireSignedIn()` (admin's NextAuth instance, NOT portal's). Will fail because portal's session cookie is host-only `__Host-` scoped to `portal.triarch.dev`. Build portal-native routes only.
- **Repurposing `/api/platform/ingest/bug-reports` for portal:** that's API-key-authed (Bearer-equivalent via `requireApiKey`) and is consumed by `BugReportWidget`/`BugReportForm` shared-ui components for embedded forms in third-party Triarch apps. Different surface. Leave it alone.
- **Hard-coding the Slack channel in `portal-slack.ts`:** mirror Phase 22-04 pattern — read `PORTAL_BUG_REPORTS_CHANNEL` / `PORTAL_FEATURE_REQUESTS_CHANNEL` env at call time, default to a sensible value (recommend `#triarch-bugs` and `#triarch-features` to match admin's `SLACK_BUG_CHANNEL`/`SLACK_FEATURE_CHANNEL` defaults). Allow dev overlay to redirect to `-test` channels.
- **Including admin-only Block Kit action_ids (`approve_fix`, `defer_fix`, `approve_feature`, `discuss_feature`, `decline_feature`) in portal's Slack message:** those buttons need `SLACK_PAYLOAD_SECRET` for signature validation when Slack POSTs back to admin's `/api/slack/interact`. Portal does NOT have that secret (Pitfall 9). Plain section blocks only — same convention as Phase 22-04.
- **Blocking response on Slack post:** fire-and-forget pattern from Phase 22-04 approve route. Slack is `await`-but-try/catch'd; failure logs and proceeds.
- **Querying for the new row's id by `where(eq(reportedByUserId, email)).orderBy(desc(createdAt)).limit(1)`:** race condition under load. Use Drizzle's `.returning()` (admin already does this).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email validation on form input | Custom regex | Trust `session.user.email` (already validated by Google OAuth) | The form doesn't COLLECT an email; it derives one from session |
| Markdown rendering of description | mdx parser, marked, rehype | Plain `<p className="whitespace-pre-wrap">` | Customer descriptions are plain text. Admin's reference uses `whitespace-pre-wrap` — match it |
| Form field state machine | Multi-step wizard, Formik, RHF | Plain `useState` + controlled inputs | 2 required fields; mirroring `BugReportForm.tsx` |
| Status pill color logic | Generic styled-component theming | Lookup map `STATUS_COLORS[bug.status]` with fallback | Admin's pattern, 8-line literal, zero abstraction tax |
| Pagination | Cursor-based, offset+page-number | PAGE_SIZE+1 sentinel + `hasMore` boolean | Phase 21 precedent — proven, simple, idiomatic for customer scrolling |
| Confirmation toast | toast library (react-hot-toast, sonner) | Existing portal `Toast.tsx` (Phase 21 ported it) | Already in portal codebase |
| Slack message formatting | Custom Block Kit builder | Inline-defined `blocks: unknown[]` (Phase 22-04 pattern) | Two messages — JSON literal is clearer than abstraction |
| ReleasedInSidebar reimplementation | Custom "released in" display | Copy admin's component | 101 lines, server component, drop-in |

**Key insight:** This phase is structurally a *copy-and-strip* operation. The complex pieces (atomic INSERT, Slack-before-response ordering, membership 404, pagination sentinel, ReleasedInSidebar) are all proven by Phase 21+22 — Phase 23's job is to apply those patterns to two new primitives, not to invent new ones.

## Common Pitfalls

### Pitfall 1: Schema NOT NULL on `reportedByUserId` / `requestedByUserId`
**What goes wrong:** INSERT fails with `null value in column "reported_by_user_id" violates not-null constraint`.
**Why it happens:** Schema declares the column NOT NULL (varchar 128); customer-origin code might pass `null`/`undefined` if it reads from `ctx.email` after a session expiry race.
**How to avoid:** Always populate from `ctx.email` (not nullable in `UserContext`). Validate in the auth ladder — if `!ctx` or `!ctx.email`, return 401 BEFORE the INSERT. Vitest test: insert with explicit `null` → expect `NOT_NULL_VIOLATION` from `pg`.
**Warning signs:** TypeScript would catch this at compile time IF Drizzle's type system is strict — but `.values({ reportedByUserId: ctx.email })` where `ctx` could be null bypasses the check. Mitigate with the auth ladder.

### Pitfall 2: Email column truncation under length pressure
**What goes wrong:** A long Google email (some workspace addresses can exceed 128 chars) into `reportedByUserId varchar(128)` triggers `value too long for type character varying(128)` from CockroachDB.
**Why it happens:** `reportedByUserId` is varchar(128) but `reportedByEmail` is varchar(256). Reusing email as user-id reverses the asymmetry.
**How to avoid:** Defensive guard in the route handler: `if (ctx.email.length > 128) return 400 invalid_email`. In practice, Google OAuth emails are bounded by RFC 5321 to 254 chars — the column was sized for OAuth `sub` (24 chars). Document the assumption and add the guard.
**Warning signs:** No `@triarchsecurity.com` user has hit this; risk is for customer admins on long workspace domains. Add the guard pre-emptively; it's 2 lines.

### Pitfall 3: Slack notification posting from non-member route
**What goes wrong:** Customer with stale browser (membership revoked between page-load and submit-click) submits, INSERT fires (membership re-checked), Slack post fires — but the customer admin reading `#triarch-bugs` sees a notification from an ex-customer.
**Why it happens:** This isn't actually a pitfall — the membership re-check at submit-time prevents it. But a UI pitfall: if the form page renders for a member then membership is revoked, the form is still functional client-side. Either Phase 23 doesn't worry about this (`window.location.reload` mitigates) or the route returns 404 on submit and the form must handle that.
**How to avoid:** Membership check inside the POST route is the gate. If client receives 404 from POST, redirect to `/no-memberships`. Standard pattern.
**Warning signs:** Test case in route handler test: `not-a-member submits → expect 404, no INSERT, no Slack post`.

### Pitfall 4: Cross-project row leak via list filter URL params
**What goes wrong:** Customer browses to `/projects/foo/bugs?project=bar`. The list query trusts the URL query param.
**Why it happens:** Naive port of admin's `BugReportsPage.tsx` which has a `projectFilter` state. Admin can see ALL projects (staff). Customer cannot.
**How to avoid:** Customer list page IGNORES any `project` URL param. The query is always scoped by `where(eq(bugReports.project, project.key))` from the URL slug. URL slug is the immutable scope; query params are status-only.
**Warning signs:** Vitest assertion: `?project=other-customer-project` → list still shows only the slug's project's rows.

### Pitfall 5: ReleasedInSidebar Link to admin URL after sunset
**What goes wrong:** Phase 26 deletes admin's `/admin/modules/pipeline/[slug]` page. Customer detail page's ReleasedInSidebar still links there → broken Link.
**Why it happens:** ReleasedInSidebar.tsx line 51 hard-codes `href={\`/admin/modules/pipeline/${row.projectKey}?release=...\`}`. If the portal copies this verbatim, it creates a Phase-26 cleanup obligation.
**How to avoid:** Fork the href when copying to portal. Recommend `href={\`/projects/${row.projectKey}/releases?version=${encodeURIComponent(row.version)}\`}` — points to portal's own release page, query param is informational (release page can scroll-to later if needed).
**Warning signs:** Vitest: render `<ReleasedInSidebar />` with mock data → assert anchor href starts with `/projects/`, not `/admin/`.

### Pitfall 6: `'use client'` accidentally on detail page (BUG-02 / FEAT-02)
**What goes wrong:** Detail page becomes a client component to inherit some interactive behavior; `db.select()` server-only call breaks at build time.
**Why it happens:** Mistakenly importing the list page's client island pattern into the detail.
**How to avoid:** BUG-02 / FEAT-02 detail pages are pure server components — no interaction needed for read-only display. Match admin's `bug-reports/[id]/page.tsx` (no `'use client'`).
**Warning signs:** `next build` error "Server Component cannot import client-only module" or vice versa.

### Pitfall 7: Form re-submit creates duplicate rows
**What goes wrong:** Customer clicks Submit twice quickly; two INSERT calls; two bug rows; two Slack notifications.
**Why it happens:** Form button doesn't disable during the in-flight POST.
**How to avoid:** `disabled={submitting || !title.trim() || !description.trim()}` on submit button (mirror `BugReportForm.tsx` pattern). Also: client-side POST-then-redirect (don't navigate from server response — that creates a window for double-submit).
**Warning signs:** RTL test — click submit twice in rapid succession → only ONE fetch call.

### Pitfall 8: Workflow transition INSERT failure rolls back the bug row
**What goes wrong:** `db.insert(workflowTransitions).values(...)` throws (e.g., column constraint, FK race). The bug row was inserted in a separate statement — DB-state is now bug-without-transition-log.
**Why it happens:** Two separate INSERTs without an explicit transaction.
**How to avoid:** Either (a) wrap both in `db.transaction(async (tx) => { ... })`, or (b) follow admin's pattern (admin doesn't transact either — same risk; document as accepted because workflow_transitions is observability, not authoritative state). Recommend (b) for parity with admin's existing pattern; accept the residual risk.
**Warning signs:** Error log `[portal-bugs] workflow_transitions insert failed` without correlated bug-id error → bug row exists, transition log doesn't. Acceptable given the table's role.

### Pitfall 9: Status filter URL-mirroring race with router.replace
**What goes wrong:** Filter chip clicks fire `router.replace(?status=triaged, { scroll: false })`; but if the click handler also kicks off a fetch, both run concurrently and the fetch result clobbers the URL state.
**Why it happens:** Phase 21 already proved this — status filter is server-side (`?status=` query param consumed by the page component, page re-renders with new data on `router.replace`).
**How to avoid:** Make the filter URL-driven: client island calls `router.replace({ pathname, query: { status: 'triaged' } }, { scroll: false })`; the server component re-reads `searchParams.status` and re-queries. No client-side fetch at all.
**Warning signs:** Multiple in-flight fetches, stale UI, status chip flicker. Match Phase 21's pattern strictly.

### Pitfall 10: Email leakage in Slack notifications
**What goes wrong:** Customer email rendered into Slack message reaches third-party Slack workspaces; leaked across ecosystems.
**Why it happens:** No sanitization at boundary.
**How to avoid:** `sanitizeForSlack(ctx.email)` in `portal-slack.ts` BEFORE composition (Pitfall 11 from Phase 22 directly applies). Already imported from `@myalterlego/triarch-shared/sanitize-commit`.
**Warning signs:** Vitest assertion: customer email containing `<!channel>` or `<@U…>` injection vectors → sanitized in the posted message body.

### Pitfall 11: PRIORITY_COLORS / EFFORT_COLORS map drift between bug list and bug detail
**What goes wrong:** `STATUS_COLORS` has 8 entries on list, 9 on detail — visual inconsistency on the same status.
**Why it happens:** Admin's reference files have inline duplicates (each file copies the map). Phase 12 SUMMARY explicitly noted "reused inline per plan; no shared util yet" — this is technical debt admin accepted.
**How to avoid:** Define ONCE per primitive (one file each in portal, e.g., `bugs/colors.ts` or top of `bugs/page.tsx`) and re-export. Or: extract to `@/components/status-pill.tsx`. Recommend the latter — encapsulate the map + the JSX-render into a single component used by list AND detail.
**Warning signs:** Ad-hoc grep: same `bg-red-500/20` literal repeated in 4 places.

### Pitfall 12: Customer admin with revoked membership sees stale list
**What goes wrong:** Customer logs in (membership exists), browses bug list (server-rendered with their data), staff revokes membership, customer clicks bug detail Link — sees 404, but list page is cached.
**Why it happens:** Next.js App Router server component caching.
**How to avoid:** Mark detail/list pages `export const dynamic = 'force-dynamic'` (Phase 21 release page does this implicitly via `db` calls). Verify behavior matches Phase 21 — release page does NOT explicitly set `dynamic = 'force-dynamic'` and relies on database calls implicitly disabling caching. Match this.
**Warning signs:** Stale data after membership revoke. Mitigated by Next.js's Force-Dynamic-on-DB-call default.

## Code Examples

Verified patterns from existing portal/admin source:

### Server component shell with membership guard (BUG-01 list)
```typescript
// Source: portal/src/app/projects/[slug]/releases/page.tsx (verbatim Phase 21 pattern)
import { notFound, redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { getCurrentUserContext } from '@myalterlego/triarch-shared/auth';
import { projects, bugReports } from '@myalterlego/triarch-shared/schema';
import { db } from '@/lib/db';
import { getPortalSession } from '@/lib/session';

const PAGE_SIZE = 20;

export default async function BugListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getPortalSession();
  if (!session?.user?.email) redirect('/login');
  const ctx = await getCurrentUserContext({ user: { email: session.user.email } });
  const { slug } = await params;
  const { status } = await searchParams;

  const [project] = await db.select({ key: projects.key, name: projects.name })
    .from(projects).where(eq(projects.key, slug));
  if (!project) notFound();

  const membership = ctx?.memberships.find((m) => m.project_key === project.key);
  if (!ctx || (!ctx.isStaff && !membership)) notFound();

  const where = status
    ? and(eq(bugReports.project, project.key), eq(bugReports.status, status))
    : eq(bugReports.project, project.key);

  const rows = await db.select().from(bugReports)
    .where(where)
    .orderBy(desc(bugReports.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return (
    <main>
      <CustomerHeader projectName={project.name} />
      <BugListClient
        projectSlug={project.key}
        bugs={pageRows}
        hasMore={hasMore}
        statusFilter={status ?? null}
      />
    </main>
  );
}
```

### POST submission route (BUG-03)
See Pattern 3 above — full handler walk-through.

### portal-slack.ts new helper (Slack post for new bug)
```typescript
// New addition to: portal/src/lib/portal-slack.ts
// Mirrors postReleaseApprovalNotification structure (lines 70-133)

const SLACK_BUG_REPORTS_CHANNEL =
  process.env.PORTAL_BUG_REPORTS_CHANNEL ?? '#triarch-bugs';

export type PostBugSubmissionInput = {
  bug: {
    id: string;
    title: string;
    description: string;
    severity: string;
    project: string;
  };
  projectName: string;
  reporterEmail: string;
};

export async function postBugSubmissionNotification(
  input: PostBugSubmissionInput,
): Promise<SlackPostResult> {
  const token = await getPortalBotToken();
  if (!token) {
    console.warn('[portal-slack] PORTAL_SLACK_BOT_TOKEN not set — skipping bug submission notification');
    return { ok: false, error: 'no_token' };
  }

  const safeTitle = sanitizeForSlack(input.bug.title);
  const safeDesc = sanitizeForSlack(input.bug.description.slice(0, 300));
  const truncatedDesc = input.bug.description.length > 300 ? `${safeDesc}…` : safeDesc;
  const safeReporter = sanitizeForSlack(input.reporterEmail);
  const severityEmoji =
    input.bug.severity === 'critical' ? ':red_circle:' :
    input.bug.severity === 'high'     ? ':large_orange_circle:' :
    input.bug.severity === 'medium'   ? ':large_yellow_circle:' :
                                        ':white_circle:';

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `:bug: *Bug submitted (via portal): ${safeTitle}*\n` +
          `*Project:* ${input.projectName}\n` +
          `*Severity:* ${severityEmoji} ${input.bug.severity}\n` +
          `*Reported by:* ${safeReporter}`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${truncatedDesc}` },
    },
    // NO action buttons — portal does not have SLACK_PAYLOAD_SECRET
  ];

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: SLACK_BUG_REPORTS_CHANNEL,
      text: `Bug Submitted (via portal): ${input.projectName} — ${safeTitle}`,
      blocks,
    }),
  });
  const data = (await res.json()) as { ok: boolean; ts?: string; error?: string };
  if (!data.ok) console.warn(`[portal-slack] bug submission notification failed: ${data.error}`);
  return data;
}

// postFeatureSubmissionNotification mirrors with :bulb: emoji,
// PORTAL_FEATURE_REQUESTS_CHANNEL (default '#triarch-features'), and feature fields
```

### apphosting bindings (Phase 23 additions to portal)
```yaml
# portal/apphosting.yaml — add to existing env: list
- variable: PORTAL_BUG_REPORTS_CHANNEL
  value: '#triarch-bugs'
  availability:
    - RUNTIME
- variable: PORTAL_FEATURE_REQUESTS_CHANNEL
  value: '#triarch-features'
  availability:
    - RUNTIME

# portal/apphosting.dev.yaml — dev override
- variable: PORTAL_BUG_REPORTS_CHANNEL
  value: '#triarch-bugs-test'
  availability:
    - RUNTIME
- variable: PORTAL_FEATURE_REQUESTS_CHANNEL
  value: '#triarch-features-test'
  availability:
    - RUNTIME
```

### Status pill component (encapsulate the map per Pitfall 11)
```typescript
// portal/src/app/projects/[slug]/bugs/StatusPill.tsx (new — encapsulate the map)
const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-zinc-700 text-zinc-300',
  triaged: 'bg-blue-500/20 text-blue-400',
  approved: 'bg-teal-500/20 text-teal-400',
  in_progress: 'bg-amber-500/20 text-amber-400',
  fixed: 'bg-green-500/20 text-green-400',
  verified: 'bg-green-600/20 text-green-300',
  closed: 'bg-zinc-800 text-zinc-500',
  deferred: 'bg-purple-500/20 text-purple-400',
};

export function BugStatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-zinc-700 text-zinc-400';
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Slack post from admin (orphaned `notifyBugReport` in slack.ts) | Portal posts customer-side via `portal-slack.ts` helpers; admin Slack helpers stay orphaned (or get deleted in Phase 26) | Phase 23 establishes the wire-up | Customer-origin Slack posts come from portal's `PORTAL_SLACK_BOT_TOKEN`, not admin's `SLACK_BOT_TOKEN` (Pitfall 9 separation) |
| Pages 11–12 admin precedent: shared status maps inlined per file | Encapsulate STATUS_COLORS + JSX into a `<StatusPill>` component | Phase 23 | Ergonomic — single source of truth for both list and detail |
| `release_log_links` joining bugs/features to releases (Phase 11–12) | Same join — ReleasedInSidebar reads via `getReleaseHistoryFor{Bug,Feature}` from shared package | Phase 21 promoted these to shared@0.2.0 | No changes — already done |

**Deprecated/outdated:**
- Admin's `notifyBugReport()` and `notifyFeatureRequest()` in `src/lib/slack.ts` lines 194–290+: orphaned (zero callers in admin source). Recommendation: leave alone in Phase 23; Phase 26 sunset can prune. Risk: zero — code is dead-code path, no call sites.

## Open Questions

1. **Should `PORTAL_BUG_REPORTS_CHANNEL` and `PORTAL_FEATURE_REQUESTS_CHANNEL` be a single combined channel or two separate channels?**
   - What we know: CONTEXT.md says "or shared channel" with Claude's discretion. Admin's existing convention is two channels (`#triarch-bugs` and `#triarch-features`).
   - What's unclear: whether the portal-origin volume (one customer initially) justifies separate channels. With T+T pilot scale, both channels would be near-empty.
   - Recommendation: TWO channels to match admin's convention. If volume is low, customer admins can mute one. Splitting later is cheaper than merging later. Plan should propose both bindings.

2. **Should we populate the schema's `slackMessageTs` and `slackChannelId` columns on `bug_reports` / `feature_requests` after a successful Slack post?**
   - What we know: Schema has both columns (varchar 64) on both tables (schema.ts:322-323, 346-347). Admin's `notifyBugReport` doesn't write back. Phase 22 release-approvals path doesn't either.
   - What's unclear: whether anything CONSUMES these columns. Likely intent: future "Slack-button-clicked → admin updates bug → reuse ts to thread the response."
   - Recommendation: Populate them in Phase 23. Capture `slackResult.ts` and `channel` from the Slack post and `UPDATE bug_reports SET slack_message_ts=$ts, slack_channel_id=$channel WHERE id=$bug.id` after the Slack post. Best-effort — failure logs but doesn't roll back. This sets up a clean foundation for v2.3 admin-side Slack-thread updates without requiring re-posting. **Plan should include this as a 2-line addition to the route handler.**

3. **Should `BugForm` / `FeatureForm` be `'use client'` islands or use Next.js Server Actions?**
   - What we know: Phase 22 explicitly chose `'use client'` + POST routes for consistency. Server Actions would inline the mutation into the page. Form is simple (2 required fields).
   - What's unclear: whether Phase 23 should diverge.
   - Recommendation: Match Phase 22. Use `'use client'` form + POST route. Consistent across the milestone; Server Actions migration can be a v2.3+ refactor.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + jsdom + RTL 16.3.2 |
| Config file | `portal/vitest.config.ts` (alias `@`, env jsdom, setup `vitest.setup.ts`) |
| Quick run command | `npx vitest run --root /Users/mikegeehan/claude/triarch/development/portal` |
| Full suite command | `npx vitest run` (from portal repo) + `npx next build` |
| Phase commit gate | `npx vitest run` GREEN + `npx next build` clean before each task commit |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | List page renders all bugs for project | RTL component | `npx vitest run src/app/projects/[slug]/bugs/page.test.tsx` | ❌ Wave 0 |
| BUG-01 | Non-member access returns notFound() (404) | server component test (next/navigation mocked) | same | ❌ Wave 0 |
| BUG-01 | Status filter URL param (`?status=triaged`) filters query | server component test | same | ❌ Wave 0 |
| BUG-01 | Project-scoping prevents cross-project leak (URL param `?project=other` ignored) | server component test | same | ❌ Wave 0 |
| BUG-01 | Pagination: PAGE_SIZE+1 fetch, hasMore sentinel | unit test on query result slicing | same | ❌ Wave 0 |
| BUG-02 | Detail page renders bug fields | RTL | `npx vitest run src/app/projects/[slug]/bugs/[id]/page.test.tsx` | ❌ Wave 0 |
| BUG-02 | Detail page HIDES `triarchNotes` and `fixCommitSha` | RTL grep (`queryByText` returns null) | same | ❌ Wave 0 |
| BUG-02 | ReleasedInSidebar renders with releaseHistory data | RTL with mock data | same | ❌ Wave 0 |
| BUG-02 | Bug-not-belongs-to-project returns 404 | server component test | same | ❌ Wave 0 |
| BUG-03 | Form-submit POSTs to /api/projects/[slug]/bugs | RTL + fetch mock | `npx vitest run src/app/projects/[slug]/bugs/new/BugForm.test.tsx` | ❌ Wave 0 |
| BUG-03 | Submit button disabled while in-flight (Pitfall 7) | RTL | same | ❌ Wave 0 |
| BUG-03 | Title + description required; severity defaults 'medium' | RTL | same | ❌ Wave 0 |
| BUG-03 | POST handler INSERTs with reportedByUserId=email + project=slug | route test (db mocked) | `npx vitest run src/app/api/projects/[slug]/bugs/route.test.ts` | ❌ Wave 0 |
| BUG-03 | POST handler returns 404 for non-member, 401 for unauthenticated | route test | same | ❌ Wave 0 |
| BUG-03 | POST handler fires Slack post BEFORE response (Pitfall 3 + Phase 22-04 ordering) | route test with `vi.fn().mock.invocationCallOrder` | same | ❌ Wave 0 |
| BUG-03 | Slack post failure does NOT roll back the INSERT | route test | same | ❌ Wave 0 |
| BUG-03 | After successful submit, redirect to /projects/[slug]/bugs/[id] | RTL | `BugForm.test.tsx` | ❌ Wave 0 |
| FEAT-01 | List page renders all feature requests for project | RTL | `npx vitest run src/app/projects/[slug]/features/page.test.tsx` | ❌ Wave 0 |
| FEAT-01 | Same status-filter, pagination, project-scoping invariants as BUG-01 | server component test | same | ❌ Wave 0 |
| FEAT-02 | Detail page renders feature fields including `useCase` | RTL | `npx vitest run src/app/projects/[slug]/features/[id]/page.test.tsx` | ❌ Wave 0 |
| FEAT-02 | Detail page HIDES `triarchNotes`, `buildPlan` (staff-internal) | RTL | same | ❌ Wave 0 |
| FEAT-02 | ReleasedInSidebar renders with `getReleaseHistoryForFeature` data | RTL | same | ❌ Wave 0 |
| FEAT-03 | Form + POST handler analogous to BUG-03 | RTL + route test | `FeatureForm.test.tsx` + `route.test.ts` | ❌ Wave 0 |
| Cross-cutting | Slack messages omit admin-only action_ids (`approve_fix`, `defer_fix`, `approve_feature`, `discuss_feature`, `decline_feature`) | unit test against `portal-slack.ts` post body | `npx vitest run src/lib/portal-slack.test.ts` | ⚠️ EXTEND |
| Cross-cutting | sanitizeForSlack applied to title, description, reporterEmail (Pitfall 10) | unit test | same | ⚠️ EXTEND |
| Cross-cutting | ReleasedInSidebar Link href starts with `/projects/` (Pitfall 5 portal-fork verification) | RTL | `src/components/ReleasedInSidebar.test.tsx` | ❌ Wave 0 |
| Cross-cutting | TypeScript guard on email length > 128 (Pitfall 2) | route test | included with route.test.ts | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (target: < 10s for portal full suite). Each new test file should run isolated first via `npx vitest run path/to/file`.
- **Per wave merge:** `npx vitest run` (full portal suite, currently 167 tests + new from Phase 23 = ~200) + `npx next build` clean.
- **Phase gate:** Full suite GREEN before `/gsd:verify-work`. Plus admin re-run from admin repo (`npx vitest run`) to confirm nothing in admin broke (Phase 23 doesn't edit admin code, so this should be a sanity check).

### Wave 0 Gaps
- [ ] `portal/src/app/projects/[slug]/bugs/page.test.tsx` — covers BUG-01 (server component + non-member 404)
- [ ] `portal/src/app/projects/[slug]/bugs/[id]/page.test.tsx` — covers BUG-02 (detail render + ReleasedInSidebar + staff-field hiding)
- [ ] `portal/src/app/projects/[slug]/bugs/new/BugForm.test.tsx` — covers BUG-03 client (form state + submit + redirect)
- [ ] `portal/src/app/api/projects/[slug]/bugs/route.test.ts` — covers BUG-03 server (auth + INSERT + Slack-before-response)
- [ ] `portal/src/app/projects/[slug]/features/page.test.tsx` — covers FEAT-01
- [ ] `portal/src/app/projects/[slug]/features/[id]/page.test.tsx` — covers FEAT-02
- [ ] `portal/src/app/projects/[slug]/features/new/FeatureForm.test.tsx` — covers FEAT-03 client
- [ ] `portal/src/app/api/projects/[slug]/features/route.test.ts` — covers FEAT-03 server
- [ ] `portal/src/components/ReleasedInSidebar.test.tsx` — covers Pitfall 5 (Link href forks to portal URL)
- [ ] EXTEND `portal/src/lib/portal-slack.test.ts` — add 4–6 cases for `postBugSubmissionNotification` + `postFeatureSubmissionNotification` (no action_ids, sanitization, channel routing)
- [ ] No framework install needed — Vitest 4.1.5 already in portal devDependencies
- [ ] No new shimMap entries needed — `auth-context`, `release-history`, `schema` already in shared package and consumed by Phase 21+22

### HUMAN-VERIFY (deferred to post-merge live test)
- Customer signs in to portal-dev → navigates to `/projects/<slug>/bugs/new` → submits a real bug → row appears in CRDB `bug_reports` with `reportedByUserId = customer email` + `project = <slug>` + `status='submitted'`; Slack message lands in `#triarch-bugs-test` (or shared channel) within 3 sec; redirect to `/projects/<slug>/bugs/<new-id>` shows the bug detail; ReleasedInSidebar shows "Not released yet"
- Customer admin views bug list at `/projects/<slug>/bugs`, status filter chips work via URL `?status=submitted`
- Bug created via portal then staff-triage in admin (`/admin/modules/bug-reports/[id]` PATCH status to 'fixed', set fix_version='v1.5.2') → customer detail page reflects new status pill + ReleasedInSidebar shows "Released in v1.5.2 dev/prod" once `release_log_links` row stamps via Phase 11 commit-parser
- Mobile (375px viewport): list page renders correctly; submission form usable; detail page sidebar collapses below main content (lg: breakpoint)
- Cross-project read attempt: customer for project A navigates to `/projects/B/bugs` → 404 (membership 404-not-403)

## Sources

### Primary (HIGH confidence) — file:line citations
- `admin/.planning/phases/23-bug-feature-customer-surface/23-CONTEXT.md` — phase boundaries + locked decisions
- `admin/.planning/REQUIREMENTS.md:89-94` — BUG-01..03 / FEAT-01..03 acceptance criteria
- `admin/packages/triarch-shared/src/schema.ts:305-330` — `bugReports` table definition
- `admin/packages/triarch-shared/src/schema.ts:332-354` — `featureRequests` table definition
- `admin/packages/triarch-shared/src/schema.ts:356-366` — `workflowTransitions` (used by submission INSERTs)
- `admin/packages/triarch-shared/src/release-history.ts` — `getReleaseHistoryForBug/Feature` exports (already in @myalterlego/triarch-shared@0.3.0, no new package version needed)
- `admin/packages/triarch-shared/src/auth-context.ts:1-50` — `getCurrentUserContext` shape (`{email, isStaff, memberships}`); proves `isStaff` and per-project membership are flat-array fields
- `admin/src/components/ReleasedInSidebar.tsx` — server component, 101 lines, drop-in reusable (with href fork)
- `admin/src/app/admin/modules/bug-reports/page.tsx:25-41` — `SEVERITY_COLORS` + `STATUS_COLORS` maps (verbatim port targets)
- `admin/src/app/admin/modules/bug-reports/[id]/page.tsx` — staff detail layout (reference for portal customer detail structure, MINUS staff-only fields)
- `admin/src/app/admin/modules/feature-requests/page.tsx:28-45` — feature-side STATUS_COLORS + EFFORT_COLORS
- `admin/src/app/admin/modules/feature-requests/[id]/page.tsx` — feature detail layout reference
- `admin/src/app/api/platform/bug-reports/route.ts` — admin staff CRUD (NOT customer entry; reference only)
- `admin/src/app/api/platform/feature-requests/route.ts` — admin staff CRUD (NOT customer entry)
- `admin/src/app/api/platform/ingest/bug-reports/route.ts` — API-key-authed embed widget endpoint (NOT for portal use); confirmed via grep that consumers are `BugReportForm.tsx` and `BugReportWidget.tsx` shared-ui components
- `admin/src/app/api/platform/ingest/feature-requests/route.ts` — API-key-authed counterpart (NOT for portal use)
- `admin/src/components/shared-ui/BugReportForm.tsx:23-130` — embedded form's POST shape (reference for portal's portal-native form fields)
- `admin/src/lib/slack.ts:194-300` — `notifyBugReport` and `notifyFeatureRequest` Block Kit shape; ORPHANED — zero callers in admin (verified via `grep -rn "notifyBugReport\|notifyFeatureRequest"` returning only the definitions). Block Kit format reference for portal's mirror with action buttons stripped (Pitfall 9 — admin-only)
- `admin/src/lib/slack-actions/bug.ts` — Block Kit action_ids (`approve_fix`, `defer_fix`) — proves these are routed through admin's `/api/slack/interact` with `SLACK_PAYLOAD_SECRET`; portal does NOT have the secret (Phase 22-04 Pitfall 9)
- `admin/src/lib/slack-actions/feature.ts` — Block Kit action_ids (`approve_feature`, `discuss_feature`, `decline_feature`) — same Pitfall 9 inheritance
- `portal/src/lib/portal-slack.ts:1-192` — existing helpers + factory pattern; new helpers to add follow same shape
- `portal/src/lib/internal-dispatch.ts` — proves shared `signRequest` is canonical-byte-equivalent (NOT relevant to Phase 23; bug/feature submission doesn't dispatch GitHub workflows; included only to confirm the cross-app pattern doesn't apply here)
- `portal/src/app/projects/[slug]/releases/page.tsx:15-46` — server component shell pattern + membership 404 verbatim template
- `portal/src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts:54-203` — Slack-before-dispatch ordering pattern; INSERT-then-Slack envelope
- `portal/src/app/projects/page.tsx:1-123` — pipeline tile list pattern (NOT directly relevant; confirms there's no `[slug]/layout.tsx` in portal)
- `portal/src/app/projects/CustomerHeader.tsx` — header reused on every customer page
- `portal/apphosting.yaml:62-68` — existing Slack channel binding pattern; lines 9-69 confirm two-file overlay convention (apphosting.yaml + apphosting.dev.yaml)
- `portal/apphosting.dev.yaml:32-44` — existing dev-channel override pattern (`-test` suffix convention)
- `portal/package.json` — v0.3.4 baseline; deps inventory confirms no new install needed
- `portal/vitest.config.ts` + `portal/vitest.setup.ts` — RTL+jsdom infrastructure already wired; Phase 23 needs no infrastructure additions
- `admin/.planning/phases/22-release-page-port-write/22-04-SUMMARY.md` — Slack-before-response pattern + `vi.fn().mock.invocationCallOrder` ordering test pattern + dual-render (BranchSection + ExpandedPanel) RTL pattern
- `admin/.planning/phases/22-release-page-port-write/22-VERIFICATION.md` — cross-cutting checks (HMAC parity, no-double-Slack, membership 404-not-403, schema NOT NULL invariants) all proven
- `admin/.planning/STATE.md` — accumulated decisions through Phase 22-05; portal v0.3.4 baseline; Phase 23 is "Not started"
- `~/claude/CLAUDE.md` — workspace rules: feature branch + PR + version bump (portal v0.3.4 → v0.4.0), `package.json` is the version-of-record for portal
- `admin/CLAUDE.md` — admin-specific conventions (NOT directly relevant for Phase 23 since admin code is untouched)

### Secondary (MEDIUM confidence)
- Inferred from grep across admin: `notifyBugReport` and `notifyFeatureRequest` are orphaned helpers (zero callers). This finding is structural — could be wrong if grep missed dynamic invocation, but admin's TypeScript is statically-imported throughout. Confidence boosted to HIGH after Phase 12 SUMMARY confirmed the bug/feature submission paths in admin do NOT post to Slack.
- Inferred from CONTEXT.md: portal v2.2 milestone has decided customer-origin uses `email` not OAuth `sub` (Phase 22 release_feedback.author_email precedent). Phase 23 reuses this convention.

### Tertiary (LOW confidence)
- *None.* Every claim in this research is grounded in either direct file:line citation or proven Phase 21+22 precedent.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package and version is already pinned in `portal/package.json`
- Architecture: HIGH — Pattern 1, 2, 3, 4 all have direct precedent in Phase 21 or 22 source code
- Pitfalls: HIGH (12 pitfalls all grounded in code-reading or Phase 22 SUMMARY/VERIFICATION; Pitfall 2 — email-length truncation — is the one most-likely to be wrong if Google introduces 128+ char workspace addresses, but the guard is cheap)
- Validation Architecture: HIGH — every test maps to a behavior with a runnable command; no manual-only tests except HUMAN-VERIFY items that are intrinsically live-deploy
- Open Questions: 3 questions, all with recommended answers; none block planning

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 days; portal stack is stable, schema unchanged in v2.2)
