# Feature Research

**Domain:** B2B dev-shop client portal — service provider giving each customer a brand-aware view of their delivered project's release pipeline + bug/feature tracker
**Researched:** 2026-05-08
**Confidence:** HIGH

---

## Executive Summary

The v2.2 portal fork is **not greenfield**. The existing admin app already implements ~80% of what a customer portal needs (release page with two-step approve, branch preview, lifecycle timeline, bug/feature detail views, project_members role model, NextAuth Google OAuth). The work is **porting + customer-shaping**, not net-new feature invention.

**Opinionated stance:**

- Ship the **existing customer surface, ported faithfully**, plus the **two missing primitives** (project list landing page, customer-side bug/feature submission). Defer everything else.
- **Reuse Google OAuth** — the staff side already runs it, customer admins on Truth+Treason already authenticate with it, and adding magic links/email-password in a single-customer pilot milestone is yak-shaving. (Magic link is a v3 conversation when we onboard customers without Google Workspace.)
- **No white-label, no per-customer accent color, no PWA, no in-app notifications, no Slack integration** in v2.2. Each is a distraction from the "fork app, redirect customers, prove the seam" milestone.
- **Mobile-responsive: yes**, but only for read paths (release list, bug detail). Approve/reject is a desktop action — Slack notifications already cover the mobile-trigger case.
- **The Slack notifications stay in admin's domain** (admin app posts to customer Slack, Slack deep-links to portal). Portal is the *destination*, not a notification source, in v2.2.

The dependency map is heavy: every customer feature in portal depends on at least one shared infrastructure piece in the admin codebase (auth-context, schema, release-entry-summary, fah-rollout, slack-audit, release feedback APIs). v2.2 must move shared lib code into a place both apps can import (likely `@triarch/shared-portal` or vendored copies — to be decided in research/STACK.md).

---

## Feature Landscape

### TABLE STAKES (Must Ship in v2.2)

Features without which the portal is incomplete and customers will ping Mike/Triarch directly.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Google OAuth sign-in** | Already what customer admins use on admin.triarch.dev today; switching auth method mid-pilot creates support burden | S | NextAuth v4 (existing), Google OAuth client (new client ID for portal.triarch.dev origin) | Same provider, separate NextAuth secret + cookie domain. Reject on `email.endsWith('@triarchsecurity.com')` and redirect with "Switch to admin.triarch.dev" callout (per PROJECT.md staff bypass spec). |
| **Post-login project list landing page (`/projects`)** | First thing customer sees; without it, post-login lands somewhere arbitrary or 404s | S | `getCurrentUserContext()` (existing in `src/lib/auth-context.ts`) returns memberships array | Tile per membership. **If user has exactly 1 project membership, server-side redirect to `/projects/<key>/releases`** — saves a click for the 90% case (single-project customers). Empty state: "You haven't been invited to a project yet. Contact your Triarch contact." |
| **Project tile metadata** | Customer needs at-a-glance status; otherwise they click into every project | S | `pipeline-summary.ts` (existing in admin: prod/dev versions, pending approval count, what-changed one-liner) | Reuse `getProjectPipelineSummaries()` filtered to user's memberships. Tile shows: project name, prod version, dev version (if dev > prod), pending-approval amber pill (if any), open-bugs count, last-deploy relative time. Click → release page. |
| **Release page port (`/projects/[slug]/releases`)** | This IS the product — the v2.0/v2.1 work that justified the milestone | M | All of: `ReleasesClient.tsx`, `BranchSection.tsx`, `WhatsComingCard.tsx`, `FilterChips.tsx`, `BranchPreviewClient.tsx`, `Timeline.tsx`, `group-sections.ts`, `release-entry-summary.ts`, conflict query, approve/reject API routes (`/api/projects/[slug]/releases/[id]/approve|reject|feedback`), branch preview API routes (`/api/projects/[slug]/branch/preview` + status) | Lift-and-shift. The two-step approve, conflict badge, FilterChips, WhatsComingCard, BranchPreviewBanner+Button singleton split, lifecycle timeline — all already shipped in v2.1 Phase 14. **Delete the staff-only ExpandedPanel branches** (none exist today, but verify) and ensure `userRole='viewer'` path is read-only. |
| **Customer-readable bug detail page (`/bugs/[id]`)** | Customer needs to see status of bugs they reported AND bugs Triarch logged for their project | M | Existing `/admin/modules/bug-reports/[id]` page logic + `ReleasedInSidebar` component + `getReleaseHistoryForBug` (Phase 12) | Customer URL pattern differs: `/projects/[slug]/bugs/[id]` (membership-gated, 404 to non-members per GATE-01 leak prevention). Reuses `release_log_links` data, "Released in vX.Y dev / vA.B prod" sidebar, status badge, comments thread (read-only for customer viewer; comment-add for customer admin). |
| **Customer-readable feature detail page (`/features/[id]`)** | Same justification as bug detail | M | Existing `/admin/modules/feature-requests/[id]` + same sidebar + `getReleaseHistoryForFeature` | Same shape as bug detail. Status workflow visible to customer (open → in-progress → released). |
| **Customer-side bug submission form (`/projects/[slug]/bugs/new`)** | Customer admins file bugs against their project; without this, they email Mike | M | Existing `/api/admin/bug-reports` POST route (already exists, currently staff-form-driven) — needs project-scope guard so customer can only file against THEIR project | Fields (opinionated minimal set): title (required, 200ch), description (required, markdown, 5000ch), severity (low/medium/high/critical — dropdown, default medium), URL where seen (optional), reproduction steps (optional, free-text). **No attachments in v2.2** (file upload = S3 bucket = scope creep). On submit → POST → redirect to bug detail. |
| **Customer-side feature request submission form (`/projects/[slug]/features/new`)** | Same justification as bugs | M | Existing `/api/admin/feature-requests` POST + scope guard | Fields: title, description, "why this matters to us" (free-text — surfaces business value to Triarch). **No upvotes, no target dates, no priority field in v2.2** — customer admin saying "we want X" is the priority signal. |
| **Customer bug list (`/projects/[slug]/bugs`)** | Customer needs an index of "bugs we filed + bugs Triarch logged for us" without scrolling release pages | M | `bug_reports` table query filtered by project_key, status filter chips (open/in-progress/closed), pagination | Keep it simple: title, status badge, severity pill, "released in vX.Y" if linked, last-updated relative time. URL-mirrored `?status=open` filter. Same load-more pattern as ReleasesClient. |
| **Customer feature list (`/projects/[slug]/features`)** | Same justification as bug list | M | `feature_requests` table query, same pattern | Same shape. |
| **Customer-friendly post-login routing** | Post-login dead-end ("you don't have access") is the worst UX | S | `getCurrentUserContext()` membership lookup | If 0 memberships: empty state with "Contact your Triarch project lead — they'll invite you." If 1: redirect to `/projects/<key>/releases`. If 2+: project list at `/projects`. |
| **Login wall on `/`** | Unauthenticated users hitting portal.triarch.dev need a clear sign-in CTA | S | NextAuth `signIn('google')` button | Marketing copy NOT needed — portal is invitation-only. Page shows "Sign in with Google" + one-line "Triarch Customer Portal — invitation only. If you weren't invited, you're in the wrong place." |
| **301 redirects from admin's `/projects/[slug]/*` to portal** | v2.2 milestone explicitly calls for grace-period redirect | S | Next.js middleware OR per-route redirect on admin app | Implementation lives in admin app, not portal. Listed here for completeness — without it, Slack deep links from previous releases break. |
| **Mobile-responsive read paths** | Customer admin will check release status on phone after Slack notification | S | Existing components are Tailwind-built, mostly responsive already | Verify ReleasesClient, BranchSection, bug detail render below 640px. Approve flow can stay desktop-only (footnote: "approve releases from desktop"). |
| **Customer header (already exists: `CustomerHeader.tsx`)** | Project name + signed-in user must be visible on every page | S | Existing component | Port as-is. Add "Sign out" link. Optionally add a project switcher dropdown for multi-project customers (defer — link back to `/projects` is enough). |
| **404 → notFound() for non-members (GATE-01 leak prevention)** | Existing release page does this; portal must preserve it | S | Existing pattern in `page.tsx`: `if (!isMember) notFound();` | Apply to all `/projects/[slug]/*` routes. Project existence MUST NOT leak to non-members. |

### DIFFERENTIATORS (Nice in v2.2.x or v2.3, Skip for v2.2)

Features that distinguish a "good" customer portal from a "great" one. None block the v2.2 milestone.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Per-release email digest** | Customer admin gets daily/weekly "here's what's pending your approval" email even if they miss Slack | M | Email infra (SendGrid/Postmark — none currently wired), digest job (cron/GitHub Action) | v2.2.x. Slack notification already covers urgency. Email is the durability backstop. |
| **Customer admin can invite teammates** | Self-serve member management instead of Mike running SQL | M | New `/api/projects/[slug]/members` POST/DELETE endpoints, invite-flow page, reuse `project_members` table | v2.2.x. Today, Mike seeds members manually. Self-serve invite is the obvious next step but not a v2.2 blocker. |
| **Per-release threaded comment improvements** | Today: flat feedback list. Differentiator: threaded replies, @mentions, edit window beyond 24h | M | Schema additions to `release_feedback` (parent_id), UI changes | v2.3. Current 24h-delete + flat list is good enough. |
| **Calendar export of upcoming prod deploys (.ics feed)** | Customer admin imports into Google Calendar — visibility into approved-but-not-yet-deployed releases | S | New `/api/projects/[slug]/calendar.ics` endpoint, no auth (token-in-URL) | v2.3. Slack notifies on dispatch. Calendar is for planning. |
| **Project-scoped Slack workspace integration (customer's own Slack)** | Customer admin connects their workspace; portal posts release-ready notifications to their channel directly (instead of Triarch's Slack) | L | Slack OAuth app per customer, per-project Slack token storage, OttoBot multi-tenant routing | v3. Today, customer admin is on Truth+Treason's shared Slack with us. Multi-tenant Slack is a serious project. |
| **Bulk approve "approve all clean RCs"** | Customer admin batches approval across branches | S | Single button, multi-row PATCH | v2.3 if requested. Today's two-step single-row approve is intentionally friction-ful — bulk approve undermines the gating philosophy. |
| **Approval delegation** | Customer admin designates a backup approver | M | Schema: `project_members.delegated_to`, UI to set, audit trail | v3. Two customer admins per project (the v2.2 plan) covers this case organically. |
| **In-app notification bell** | Reduces Slack-dependency for customers without Slack | M | New `notifications` table, read/unread state, polling endpoint | v3. Slack + email cover this. |
| **Q&A / commenting threads on bugs** | Customer asks "what's the status?" without emailing | M | Reuse `release_feedback` pattern on `bug_reports` | v2.2.x — light lift if customer demand surfaces. |
| **Account settings page** | Customer self-serve: notification preferences, profile photo, email change | M | New routes, schema additions for prefs | v2.3. Profile is read-only-from-Google in v2.2; if customer wants email change, they change Google account. |
| **Activity feed across all customer's projects** | Multi-project customer sees one stream of "X released, Y bug filed, Z feature shipped" | M | Cross-project query, paginated feed | v3. Today's project-list landing covers the multi-project case adequately. |

### ANTI-FEATURES (Do NOT Build — They Distract from Core Value)

Features that *seem* good for a customer portal but would derail v2.2 specifically.

| Feature | Why Tempting | Why Problematic for v2.2 | What to Do Instead |
|---------|--------------|--------------------------|--------------------|
| **White-label per-customer (custom logo, accent color, subdomain like `truthandtreason.portal.triarch.dev`)** | "Customers love seeing their brand" — common B2B portal selling point | Adds DNS provisioning per customer, theming layer, asset hosting, brand-config schema. Fundamentally a v3 problem. **Triarch's brand = Triarch's quality**; customer admin signs in once a month, brand consistency is a *feature* not a bug. | Single Triarch-branded portal. Project name in header. Done. |
| **Email/password auth + signup form** | "What if customer doesn't have Google?" | Today's customer (Truth+Treason) uses Google. Building email/password = SMTP integration, password reset flow, rate limiting, account lockout, MFA — entire auth surface area. **You're not running an identity provider.** | Google OAuth only. If a future customer doesn't have Google, switch to magic link (in v3) or onboard them through their Google Workspace. |
| **PWA / offline support** | "Mobile feels like an app!" | Adds service worker, manifest, install prompt, offline cache invalidation strategy. Customer admin opens this once a week. **The mobile use case is "read on phone after Slack ping" — a responsive web page solves this with zero PWA cost.** | Tailwind responsive breakpoints. Done. |
| **Real-time updates (websockets / SSE) on release status** | "Approve happens, page updates instantly!" | SWR polling on branch-preview already covers the only flow where it matters (preview swap, ~5s interval). Approve is acted on by ONE customer admin who just clicked the button — they already saw the optimistic UI update. **No second-screen real-time problem exists.** | Optimistic updates + SWR poll on long-running flows. |
| **Customer-facing Triarch marketing copy on `/`** | "Sell the portal to prospects who land here!" | Portal is invitation-only. Prospects hit triarch.dev (the marketing site), not portal.triarch.dev. **Conflating marketing site and customer portal is a category error.** | One-line "Triarch Customer Portal — invitation only" + Sign in. |
| **Public docs / customer-facing changelog of the portal itself** | "Customers want to know what changed in the portal" | Changes to the portal are communicated by Triarch directly. A public changelog implies more product-management-style ownership than a 1-2 customer pilot warrants. **Versioning the portal is internal.** | Defer until 5+ active customers. |
| **Customer-side Triarch staff invitation / "request access" form** | "What if a teammate at Truth+Treason wants in?" | Email Triarch. Mike runs one INSERT statement. **Self-serve member invite is a v2.2.x feature, not v2.2.** | Documentation: "To invite a teammate, ask your Triarch project lead." |
| **Customer billing / usage dashboard** | "B2B portals usually show invoices" | Triarch's billing model (one-time + retainer) doesn't map to portal-style usage. **Out of scope per PROJECT.md.** | Stripe portal link or PDF invoice email. Out of v2.2 entirely. |
| **Customer-facing roadmap / "what's coming next" project-management board** | "Customer wants to see Triarch's roadmap for their project" | Roadmap UX = Trello/Linear surface. **WhatsComingCard already shows what's actually shipping (real release-driven data).** A separate product-management board is fiction; release flow is truth. | WhatsComingCard. Done. |
| **Voting / upvoting on feature requests** | "Common pattern in customer portals" | Triarch's customer count is 1 (Truth+Treason). **You can't crowdsource priority across 1 organization.** Adds schema, UI, controversy ("why didn't you build the upvoted one?"). | Customer admin says "this is important." Triarch builds it. The conversation IS the prioritization. |
| **File attachments on bug reports** | "Screenshots are useful!" | S3 / GCS bucket, signed URLs, malware scan, max-size limits, EXIF stripping, retention policy. Each = 4-8 hours. **Customer admin can paste a Loom URL or imgur link in description.** | Markdown description with image links. v2.2.x or v2.3 if pain emerges. |
| **Feature request "target date" customer-supplied input** | "Customer says when they need it!" | Triarch's date estimate is the source of truth, not customer's wishful date. **Customer's "we want it by Friday" → conflict with Triarch's "this is 2 weeks of work."** Surfaces the wrong negotiation in the wrong place. | Customer's "why this matters" free-text. Triarch responds with their estimate in a comment. |
| **Multi-customer admin "switch customer" dropdown** | "I work across 3 customers!" | Customer admins are scoped to ONE customer org by definition (they're at Truth+Treason; they don't also work at the next customer). **Triarch staff are the multi-customer users — they use admin.triarch.dev, which already has this.** | Customer admins see only their org's projects. Staff use admin app. |

---

## Feature Dependencies

```
[Google OAuth + cookie/session]
    └──requires──> [NextAuth v4 setup with portal-scoped client ID + secret]
            └──requires──> [Shared CockroachDB access — getCurrentUserContext()]

[Project list landing]
    └──requires──> [getCurrentUserContext()]
    └──requires──> [getProjectPipelineSummaries() — currently in admin/src/lib/pipeline-summary.ts]
    └──enhances──> [Post-login routing logic]

[Release page port]
    └──requires──> [getCurrentUserContext() + project membership check]
    └──requires──> [shared lib: release-entry-summary, release-history, group-sections]
    └──requires──> [API routes: approve, reject, feedback, branch/preview]
    └──requires──> [BranchPreviewClient + SWR]
    └──requires──> [FilterChips, WhatsComingCard, Timeline, BranchSection components]

[Bug detail (customer-readable)]
    └──requires──> [getReleaseHistoryForBug() + ReleasedInSidebar]
    └──requires──> [Project-scoped GET on /api/admin/bug-reports/[id] OR new /api/projects/[slug]/bugs/[id]]
    └──conflicts──> [Today's staff-only guard on /admin/modules/bug-reports/[id] — needs split]

[Bug submission form]
    └──requires──> [Existing POST /api/admin/bug-reports — must add project-scope check]
    └──requires──> [Customer admin role gate (viewer can't submit, debatable — see notes)]

[Bug list / Feature list]
    └──requires──> [bug_reports / feature_requests table queries scoped to project_key]
    └──requires──> [Pagination pattern (reuse load-more from ReleasesClient)]

[Feature detail / submission / list]
    └──mirrors──> [Bug detail / submission / list — same shape, different table]

[301 redirects from admin]
    └──requires──> [Next.js middleware in admin app (NOT portal)]
    └──conflicts──> [Existing /projects/[slug]/* routes in admin — must remove or 301]

[Customer header]
    └──requires──> [Project name lookup by slug]
    └──enhances──> [All /projects/[slug]/* pages]
```

### Dependency Notes

- **Shared lib code is the biggest unknown.** `pipeline-summary.ts`, `release-entry-summary.ts`, `release-history.ts`, `group-sections.ts`, `auth-context.ts`, `fah-rollout.ts`, `slack-audit.ts` all live in admin. Portal needs them too. Three options for STACK.md to decide: (1) extract to `@triarch/shared-portal` npm workspace package, (2) vendored copy in portal repo with a sync script, (3) git submodule. **Recommendation: Option 1 (npm workspace).** Most idiomatic; the admin and portal both check in to the same monorepo OR both consume a published package.
- **API routes split is non-trivial.** Today, `/api/projects/[slug]/releases/[id]/approve` lives in admin. Portal will call it from portal.triarch.dev. Two choices: (a) admin keeps the API, portal proxies (CORS pain), or (b) portal owns its own copy of the API route, both apps connect to the same DB. **Recommendation: (b)** — portal is its own app, owns its own routes, shared DB.
- **`isStaff` check on portal.** Staff users hitting portal must NOT see admin actions. The existing `userRole = ctx.isStaff || membership.role === 'admin' ? 'admin' : 'viewer'` line in `releases/page.tsx` conflates staff with customer-admin. **In portal, treat staff as viewer** (or block access entirely with a "Switch to admin" callout). This is a behavior change, not a code-port — call it out in roadmap.
- **`viewer` role for bug submission.** Today's `project_members.role` enum is `admin | viewer | staff`. Question: can a customer viewer file a bug? Opinion: **yes, viewers can file bugs and feature requests** (they need to report things they see), but they cannot approve releases or invite teammates. Read FEATURES.md anti-feature on member invite — customer admin only.

---

## MVP Definition

### Launch With (v2.2)

The minimum to fork the customer surface out and prove the seam. Each item is a **Phase candidate** for the roadmap.

- [ ] **Phase: Bootstrap** — New Next.js app at `~/claude/triarch/development/portal`, separate FAH backend, separate ci-cd.yml, DNS, NextAuth Google OAuth (portal-scoped client + secret + cookie domain), shared DB connection, `@triarch/shared-portal` package extracted from admin (or equivalent code-sharing decision)
- [ ] **Phase: Project list + post-login routing** — `/projects` landing page, single-project auto-redirect, empty state for non-members, login wall on `/`
- [ ] **Phase: Release page port** — full release page with FilterChips, WhatsComingCard, BranchPreviewBanner+Button, conflict badges, two-step approve, reject, feedback compose, lifecycle timeline. Staff users see a "Switch to admin.triarch.dev" callout instead of admin actions.
- [ ] **Phase: Bug list + detail (customer view)** — list, status filter, detail page with ReleasedInSidebar, comment thread (read for viewer, post for admin)
- [ ] **Phase: Bug submission form** — `/projects/[slug]/bugs/new`, customer-side fields, POST to scoped API, redirect to detail
- [ ] **Phase: Feature list + detail + submission** — same shape as bugs, different table
- [ ] **Phase: 301 redirects + admin route deprecation** — admin app's `/projects/[slug]/*` 301s to portal
- [ ] **Phase: Verify mobile responsive read paths** — manual QA pass on mobile breakpoint for releases / bug detail / project list

### Add After Validation (v2.2.x)

Customer asks for these post-pilot. Easy lifts on a working portal foundation.

- [ ] **Email digest** — daily/weekly "pending approvals" email (trigger: customer admin says "I miss Slack pings sometimes")
- [ ] **Customer admin self-serve teammate invite** — `/projects/[slug]/members` (trigger: Truth+Treason wants to add a 3rd person without Mike's involvement)
- [ ] **File attachments on bugs** — paste-to-upload with size cap (trigger: customer says "screenshots in URL form is awkward")
- [ ] **Bug Q&A thread** — comment thread on bug detail (trigger: customer asks status of bug X via email)
- [ ] **Calendar (.ics) feed of approved-pending-deploy releases** — token-URL endpoint (trigger: customer asks "when is X going live?")

### Future Consideration (v2.3+)

Real value but premature for a 1-customer-pilot codebase.

- [ ] **In-app notification bell** — defer until 5+ active customers using portal weekly
- [ ] **Per-customer Slack workspace integration** — defer until 3+ customers asking for it
- [ ] **Approval delegation** — defer until customer reports backup-approver friction
- [ ] **Account settings (notification prefs, profile)** — defer until customer asks for prefs
- [ ] **Bulk approve** — defer indefinitely; gating philosophy is intentionally friction-ful
- [ ] **White-label per customer** — v3+ when we have a brand-conscious customer like a Fortune 500
- [ ] **Magic link auth (alternate)** — v3+ when onboarding a customer without Google Workspace

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Google OAuth sign-in (portal-scoped) | HIGH | LOW | P1 |
| Project list landing + 1-project auto-redirect | HIGH | LOW | P1 |
| Release page port | HIGH | MEDIUM | P1 |
| Bug detail (customer-readable) | HIGH | MEDIUM | P1 |
| Bug submission form | HIGH | MEDIUM | P1 |
| Feature detail + submission | HIGH | MEDIUM | P1 |
| Bug list + Feature list | MEDIUM | MEDIUM | P1 |
| Customer header + sign-out | HIGH | LOW | P1 |
| 301 redirects from admin app | HIGH | LOW | P1 |
| Mobile responsive read paths | MEDIUM | LOW | P1 |
| Login wall on `/` | HIGH | LOW | P1 |
| 404 (not 403) for non-members | HIGH | LOW | P1 |
| Staff "switch to admin" callout on portal | MEDIUM | LOW | P1 |
| Email digest of pending approvals | MEDIUM | MEDIUM | P2 |
| Customer admin self-serve invite teammates | MEDIUM | MEDIUM | P2 |
| File attachments on bugs | LOW | MEDIUM | P2 |
| Bug Q&A thread | MEDIUM | LOW | P2 |
| Calendar (.ics) feed | LOW | LOW | P2 |
| In-app notification bell | LOW | MEDIUM | P3 |
| Per-customer Slack integration | MEDIUM | HIGH | P3 |
| Approval delegation | LOW | MEDIUM | P3 |
| Account settings page | LOW | MEDIUM | P3 |
| Bulk approve | LOW | LOW | P3 |
| White-label branding | LOW | HIGH | P3 |
| Magic link auth alternate | LOW | MEDIUM | P3 |
| PWA / offline | LOW | HIGH | P3 (anti) |
| Public marketing copy on `/` | NEGATIVE | LOW | NEVER |
| Multi-customer switcher dropdown | NEGATIVE | MEDIUM | NEVER (admin app's job) |
| Real-time websocket release updates | LOW | HIGH | NEVER (SWR poll covers) |
| Voting on feature requests | NEGATIVE | MEDIUM | NEVER for 1-customer-pilot |
| Customer billing dashboard | NEGATIVE | HIGH | OUT OF SCOPE per PROJECT.md |

**Priority key:**
- **P1**: Must ship in v2.2 milestone — without this, the milestone goal isn't met
- **P2**: Should ship in v2.2.x patch series — unblocks customer self-service
- **P3**: Defer to v2.3+ — real value but premature for current customer count
- **NEVER**: Anti-feature, do not build

---

## Customer Role Split (Honored Throughout)

The `project_members.role` enum (`admin | viewer | staff`) per `src/lib/auth-context.ts` is preserved in portal. Behavior table:

| Action | customer admin | customer viewer | staff (on portal) |
|--------|----------------|-----------------|-------------------|
| Sign in to portal | YES | YES | YES (with "Switch to admin" callout) |
| See project list | YES (their projects only) | YES (their projects only) | YES (all projects via wildcard `*` membership) — but discouraged via callout |
| View release page | YES | YES (read-only) | YES (read-only on portal — admin actions only on admin.triarch.dev) |
| Approve release | YES | NO | NO (must use admin.triarch.dev's web promote OR Slack OttoBot) |
| Reject release | YES | NO | NO |
| Post release feedback | YES | NO (debatable: could be YES if v2.2.x demand surfaces) | NO |
| Trigger branch preview swap | YES | NO | NO |
| View bug list / detail | YES | YES | YES (project-scoped only — staff using portal sees the customer view) |
| Submit bug report | YES | YES | NO (staff use admin /admin/modules/bug-reports/new) |
| Comment on bug | YES (v2.2.x) | NO | NO |
| View feature list / detail | YES | YES | YES |
| Submit feature request | YES | YES | NO |
| Invite teammate | YES (v2.2.x) | NO | NO (staff use admin SQL or admin UI) |
| See cross-customer data | NO (membership-scoped) | NO | YES (but should switch to admin app for that view) |

---

## Competitor Feature Analysis

Brief — the competitive landscape isn't deeply relevant because Triarch's customer portal is bespoke for a service-delivery model, not a SaaS product.

| Feature | Linear (issue tracker) | GitHub (public PR-as-portal) | Vercel customer portal | Triarch v2.2 |
|---------|------------------------|------------------------------|-----------------------|--------------|
| Auth | Email/password + Google + SSO | GitHub account | SSO + email/password | Google OAuth only |
| Branding | Single Linear brand | Single GitHub brand | Single Vercel brand | Single Triarch brand (no white-label) |
| Release approval gating | NO (build tool, not gate) | Manual via PR review | Preview deploys + production promote | Two-step approve with conflict badges + branch swap (DIFFERENTIATOR) |
| Bug + feature unified | YES | Issues label-scoped | NO (deployment-only) | YES (existing v1.14) |
| Customer-side comments | YES (issue thread) | YES (PR thread) | NO | YES (release feedback + bug Q&A v2.2.x) |
| Lifecycle timeline | Project view | PR timeline | Deployment log | Per-release Timeline component (DIFFERENTIATOR) |
| Branch preview UX | NO | YES (PR preview) | YES (preview deploy) | YES with FAH rollout swap (DIFFERENTIATOR) |

**Triarch's distinguishing surface:** the release-gating flow + branch preview swap. Everything else (bugs, features) is table stakes; the gating UX is what makes the portal worth porting versus telling customers to use Slack only.

---

## Sources

- [SaaS Authentication Best Practices in 2026 — supastarter](https://supastarter.dev/blog/saas-authentication-best-practices)
- [Customer portal authentication options: SSO, magic links, and invite-only access — supportbench](https://www.supportbench.com/customer-portal-authentication-sso-magic-links-invite-only-access/)
- [Magic Links: UX, Security, and Growth Impacts for SaaS — Baytech Consulting](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)
- [B2B Portal Development in 2026: Features, Benefits & Enterprise Architecture — TechVoot](https://www.techvoot.com/blog/b2b-portal-development-enterprise-architecture)
- [B2B Customer Portal: Definition, Features, & Examples in 2026 — AgencyHandy](https://www.agencyhandy.com/b2b-customer-portal/)
- [Top 5 Features of a Modern B2B Portal in 2026 — Asabix](https://asabix.com/blog/top-5-features-b2b-portal-in-2026/)
- Internal: `/Users/mikegeehan/claude/triarch/development/admin/.planning/PROJECT.md` (v2.2 milestone definition, target features, constraints)
- Internal: `/Users/mikegeehan/claude/triarch/development/admin/src/app/projects/[slug]/releases/ReleasesClient.tsx` (existing release page — 916 lines of customer surface to port)
- Internal: `/Users/mikegeehan/claude/triarch/development/admin/src/app/projects/[slug]/releases/page.tsx` (membership/auth pattern to mirror)
- Internal: `/Users/mikegeehan/claude/triarch/development/admin/src/lib/auth-context.ts` (3-role membership model: admin | viewer | staff)

---

*Feature research for: B2B dev-shop client portal (v2.2 Customer Portal Split — admin → portal fork)*
*Researched: 2026-05-08*
