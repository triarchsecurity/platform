# Architecture Research: Customer Portal Split (v2.2)

**Domain:** Multi-app fork of an existing Next.js operations console — staff app stays at `admin.triarch.dev`, customer surface forks to a new Next.js app at `portal.triarch.dev`. Both apps share one CockroachDB cluster, share `@myalterlego/shared-ui` design tokens, and federate identity through one Google OAuth client — but are otherwise independently versioned, independently deployed, and have isolated cookie scopes.
**Researched:** 2026-05-08
**Confidence:** HIGH (decisions are anchored in an in-house precedent that already shipped: `triarchsecurity-admin` ↔ `triarchsecurity-portal` runs the exact same split and is operational at portal v0.14.3 / admin in production. We are reproducing a pattern that works, not inventing one.)

---

## Decisions Up Front

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Code-sharing strategy | **Two independent repos. Promote one new internal npm package: `@myalterlego/triarch-shared`** (schema + 4 helpers). NO monorepo. NO submodule. | Mirrors the working `triarchsecurity-admin` ↔ `triarchsecurity-portal` precedent. Independent deploy cadence is non-negotiable (admin ships from `MyAlterLego/triarch-dev`, portal ships from a new repo `MyAlterLego/triarch-portal`). |
| 2 | DB access | **Direct pg.Pool from portal**, same DATABASE_URL secret value, separate Firebase secret reference. | Lower latency, simpler auth surface, no proxy hop. Existing portal precedent (`/Users/mikegeehan/claude/MyAlterLego/triarchsecurity-portal/src/lib/db.ts`) connects directly. |
| 3 | NextAuth scope | **Same Google OAuth client, separate NextAuth secret per app, no cookie sharing.** | Sign-in is per-host. Brand isolation. Cookies stay scoped to their host (default behavior — DO NOT set `cookieDomain` to `.triarch.dev`). |
| 4 | OAuth callback | **One Google OAuth client app with two registered callback URIs.** | Google supports multiple redirect URIs on one client. No need to manage two clients. |
| 5 | Authorization on portal | **Staff who land on portal get a "Switch to admin.triarch.dev" callout AND can act as a viewer on any project they're a member of.** Customer admin who lands on admin.triarch.dev gets a 403 with link back to portal. | Staff occasionally need to verify what a customer sees; outright reject is hostile. Customers have no business on admin. |
| 6 | Migration | **301 redirect from admin's `/projects/*` → portal's `/projects/*` after portal ships, with a 30-day overlap where both URLs work.** | Customer bookmarks must keep working. Hard cutover risks lost links. |
| 7 | Branch swap ownership | **Portal owns `POST /api/projects/[slug]/branch/preview` end-to-end.** Portal's Firebase project gets `FAH_PROMOTER_SA_KEY`. Admin's copy is removed once portal canonical. | Lower latency, single auth surface, no proxy. The SA key is a secret value and can live in two Firebase projects without conflict. |
| 8 | CI/CD | **New `.github/workflows/ci-cd.yml` in portal repo, references `MyAlterLego/shared-workflows@v4` unchanged.** No shared-workflows fork needed. | shared-workflows v4 is already environment-aware (Phase 7.5 work). Portal is just another consumer. |
| 9 | v2.1 hostname guards | **Remove from admin once portal canonical.** No defense-in-depth. | Admin will be staff-only post-cutover. Hostname checks become dead code. Auth role gates remain. |
| 10 | Schema ownership | **Admin remains the migration authority. `drizzle-kit push` runs from admin only. Schema lives in `@myalterlego/triarch-shared` but the package is published BY admin's repo. Portal consumes read-only.** | One schema, one migrator. Two migrators race. |

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            User-Facing Surface                            │
├──────────────────────────────────────────────────────────────────────────┤
│   ┌─────────────────────┐                ┌─────────────────────┐         │
│   │  admin.triarch.dev  │                │ portal.triarch.dev  │         │
│   │   (staff console)   │                │  (customer portal)  │         │
│   │  Next.js 16 App     │                │  Next.js 16 App     │         │
│   │  Firebase project:  │                │  Firebase project:  │         │
│   │ triarch-dev-website │                │ triarch-dev-portal  │         │
│   │  Backend: triarch-  │                │  Backend: triarch-  │         │
│   │  dev (+ -prod)      │                │  portal-dev (+-prod)│         │
│   └──────────┬──────────┘                └──────────┬──────────┘         │
│              │                                      │                    │
│              │     ── independent cookies ──        │                    │
│              │     ── independent secrets ──        │                    │
│              │     ── independent versions ──       │                    │
└──────────────┼──────────────────────────────────────┼────────────────────┘
               │                                      │
               │   ┌──────────────────────────────┐   │
               └──▶│   @myalterlego/triarch-      │◀──┘
                   │   shared (npm pkg, GH        │
                   │   Packages)                   │
                   │  • Drizzle schema (read)     │
                   │  • auth-context helper       │
                   │  • sanitize-commit helper    │
                   │  • slack-status builder      │
                   │  • TypeScript types          │
                   └──────────────────────────────┘
               │                                      │
               ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              Shared Storage                               │
├──────────────────────────────────────────────────────────────────────────┤
│   CockroachDB cluster: triarchdev-dev-15666                               │
│   Database: triarch_dev                                                   │
│   Driver: pg.Pool (both apps)                                             │
│   ORM: Drizzle (admin: read+write+migrate, portal: read+write)            │
│                                                                           │
│   Tables both apps touch:                                                 │
│     projects, project_members, release_logs, release_approvals,           │
│     release_feedback, release_log_links, bug_reports, feature_requests,   │
│     slack_action_audit                                                    │
│   Tables admin-only:                                                      │
│     menu_sections/_pages/_subpages, role_permissions, module_settings,    │
│     report_section_types, reports, service_offerings, offering_*          │
└──────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌───────────────────────────────────┴──────────────────────────────────────┐
│                       External Identity & Plumbing                        │
├──────────────────────────────────────────────────────────────────────────┤
│   Google OAuth client (single):                                          │
│     • Authorized redirect 1: https://admin.triarch.dev/api/auth/callback │
│                              /google                                      │
│     • Authorized redirect 2: https://portal.triarch.dev/api/auth/callback│
│                              /google                                      │
│                                                                           │
│   GCP Secret Manager (per Firebase project):                              │
│     admin: NEXTAUTH_SECRET, DATABASE_URL, GOOGLE_CLIENT_*,                │
│            FAH_PROMOTER_SA_KEY, GH_APP_*, SLACK_*                         │
│     portal: PORTAL_NEXTAUTH_SECRET, DATABASE_URL (same value),            │
│             GOOGLE_CLIENT_* (same values), FAH_PROMOTER_SA_KEY (same      │
│             value), SLACK_BOT_TOKEN (read-only, for OttoBot post)         │
│                                                                           │
│   Firebase App Hosting (Cloud Build → Cloud Run):                        │
│     admin: project triarch-dev-website, backends triarch-dev / -prod     │
│     portal: project triarch-dev-portal (NEW), backends                    │
│             triarch-portal-dev / -prod                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `admin.triarch.dev` | Staff platform: project registry, pipeline, OttoBot dispatch, Slack audit, member management, schema migrations | Next.js 16 App Router (existing), Drizzle write authority |
| `portal.triarch.dev` | Customer surface: release page, branch swap, bug/feature view+submit, lifecycle timeline, customer-side notifications | Next.js 16 App Router (NEW), Drizzle read+limited-write |
| `@myalterlego/triarch-shared` | Schema, types, sanitization, slack-status block builder, auth-context helper | NEW npm package; published from admin repo via tag-driven workflow |
| `@myalterlego/shared-ui` | Design tokens, shared primitives | EXISTING — no change |
| CockroachDB `triarch_dev` | Single source of truth for project data | EXISTING; admin owns schema, both apps read+write |
| Google OAuth client | Single identity provider | EXISTING admin client; add second redirect URI |
| Firebase App Hosting (portal project) | Build, deploy, custom domain, secrets | NEW project `triarch-dev-portal` with admin-equivalent backend topology |

---

## Recommended Project Structure

### New repository: `MyAlterLego/triarch-portal`

```
triarch-portal/
├── apphosting.yaml              # FAH config — minimal, dev backend defaults
├── apphosting.prod.yaml         # FAH config — prod overlay (per Phase 7.5 convention)
├── package.json                 # version starts at 0.1.0; depends on:
│                                #   @myalterlego/triarch-shared ^0.1
│                                #   @myalterlego/shared-ui ^1.4
│                                #   next-auth ^4.24
├── .github/
│   └── workflows/
│       └── ci-cd.yml            # uses shared-workflows@v4, mirrors admin
├── drizzle.config.ts            # READ-ONLY USE: introspection only,
│                                # NO db:push from this repo
├── src/
│   ├── app/
│   │   ├── layout.tsx           # PortalShell (no AdminSidebar)
│   │   ├── page.tsx             # post-login: list of user's projects
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── projects/
│   │   │   └── [slug]/
│   │   │       ├── layout.tsx
│   │   │       └── releases/
│   │   │           └── page.tsx # MIGRATED from admin
│   │   ├── bugs/
│   │   │   └── [id]/
│   │   │       └── page.tsx     # NEW customer-friendly view
│   │   ├── features/
│   │   │   └── [id]/
│   │   │       └── page.tsx     # NEW customer-friendly view
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── projects/[slug]/
│   │       │   ├── branch/preview/route.ts        # MIGRATED from admin
│   │       │   ├── branch/preview/status/route.ts # MIGRATED from admin
│   │       │   └── releases/[releaseId]/
│   │       │       ├── approve/route.ts           # MIGRATED from admin
│   │       │       ├── reject/route.ts            # MIGRATED from admin
│   │       │       └── feedback/route.ts          # MIGRATED from admin
│   │       └── bugs/route.ts                      # NEW customer submit
│   ├── components/              # portal-specific components only
│   │   ├── PortalShell.tsx      # NEW header/footer/branding
│   │   ├── ProjectList.tsx
│   │   └── (migrated)/          # FilterChips, WhatsComingCard,
│   │                            # BranchPreviewClient, ReleasesClient
│   └── lib/
│       ├── auth.ts              # Portal NextAuth config (PORTAL_NEXTAUTH_SECRET)
│       ├── db.ts                # pg.Pool wrapped with drizzle from shared pkg
│       ├── fah-rollout.ts       # MIGRATED from admin (same FAH SA pattern)
│       └── version.ts
└── tsconfig.json
```

### Existing repository: `MyAlterLego/triarch-dev` (admin)

```
triarch-dev/
├── packages/                    # NEW workspace dir (admin repo only)
│   └── triarch-shared/          # NEW — published as @myalterlego/triarch-shared
│       ├── package.json         # name: @myalterlego/triarch-shared
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts         # public re-exports
│           ├── schema.ts        # MOVED from src/db/schema.ts (re-exported back)
│           ├── auth-context.ts  # MOVED from src/lib/auth-context.ts
│           ├── sanitize-commit.ts # MOVED from src/lib/sanitize-commit.ts
│           └── slack-status.ts  # MOVED from src/lib/slack-status.ts
├── src/
│   ├── db/schema.ts             # NOW: re-export shim
│   │                            #   export * from '@myalterlego/triarch-shared/schema';
│   ├── lib/auth-context.ts      # NOW: re-export shim
│   ├── lib/sanitize-commit.ts   # NOW: re-export shim
│   ├── lib/slack-status.ts      # NOW: re-export shim
│   ├── lib/db.ts                # unchanged
│   ├── lib/auth.ts              # unchanged (still admin-specific)
│   └── app/
│       ├── projects/[slug]/releases/page.tsx  # AFTER cutover: 301 redirect
│       └── (rest unchanged)
└── .github/workflows/
    ├── ci-cd.yml                # unchanged (admin app deploy)
    └── publish-shared.yml       # NEW — publishes @myalterlego/triarch-shared
                                 # on `packages/triarch-shared/v*` tag
```

### Structure Rationale

- **Two repos, not a monorepo.** Each app already deploys via its own Firebase App Hosting backend keyed off `package.json` version (per workspace CLAUDE.md). A monorepo would require either Turborepo with affected-build detection, or always rebuilding both — both add ceremony without benefit. The precedent (triarchsecurity-admin/portal) is two separate repos and works fine.
- **Shared package lives inside admin repo.** Avoids creating a third repo (`triarch-shared`) just for one package. Admin repo becomes the publisher; portal repo is a consumer. Tag-driven publish (e.g., `shared/v0.2.0`) keeps the admin app version line and the shared-package version line orthogonal.
- **Portal uses Drizzle but doesn't run migrations.** Portal's `drizzle.config.ts` is for IDE/introspection only. Admin runs `drizzle-kit push`. Portal's CI deliberately omits a `db-migrate` job. Schema migration coordination is enforced by toolchain, not policy.
- **Portal raw routes mirror admin's existing customer routes 1:1.** This is a fork, not a redesign. Same path conventions, same handler shape — just hostname-isolated.

---

## Architectural Patterns

### Pattern 1: Shared Schema, Federated Writes

**What:** Both apps import the same Drizzle schema from `@myalterlego/triarch-shared`. Both write to the same tables. Admin runs migrations.

**When to use:** When you have a single canonical data model split across UI surfaces (staff vs customer) but neither surface has authority over the schema independent of the other.

**Trade-offs:**
- Pro: Type safety across both apps; one schema source; no drift.
- Pro: Customer writes (approve/reject, feedback, branch lock acquisition) skip a proxy hop, reducing latency from ~600ms to ~150ms.
- Con: Schema bumps require coordinated deploys (publish shared package → portal consumes new version → admin pushes migration → both deploy). Phase 0 of this milestone formalizes that procedure.
- Con: Both apps can race on the same row. Existing optimistic-lock guards (`UPDATE … WHERE preview_branch_locked IS NULL` from v2.1 Phase 13; partial-unique-index on `release_approvals.decision='approved'` from Phase 9) already cover the customer-write surface. Audit before adding new write paths in portal.

**Example:**
```typescript
// Both apps:
import { releaseApprovals } from '@myalterlego/triarch-shared/schema';
import { db } from '@/lib/db';

await db.insert(releaseApprovals).values({
  releaseId,
  approverEmail: session.user.email,
  decision: 'approved',
  actorSource: 'web',
});
```

### Pattern 2: Hostname-Per-Cookie Isolation

**What:** Each NextAuth instance writes a session cookie scoped to its own host. Default behavior — DO NOT set `cookieDomain` to `.triarch.dev`. The SameSite default (`lax`) plus host-only scope keeps `admin.triarch.dev` and `portal.triarch.dev` cookies fully isolated.

**When to use:** When two apps share an OAuth client but have different brand contexts and authorization models.

**Trade-offs:**
- Pro: Sign-in on admin does not authenticate portal (and vice versa). Brand boundary enforced at the cookie layer.
- Pro: A leaked admin cookie cannot be replayed against portal.
- Con: Staff who happen to use both apps sign in twice. This is the desired behavior (admin is staff-only; staff rarely visit portal except for verification).
- Con: CSRF tokens are also host-isolated — a CSRF token from admin will not validate on portal. Each app maintains its own CSRF. NextAuth handles this by default; do not customize.

**Example:**
```typescript
// portal/src/lib/auth.ts
export const authOptions: NextAuthOptions = {
  // ... providers same Google client ID/secret
  secret: process.env.PORTAL_NEXTAUTH_SECRET,  // distinct from admin's NEXTAUTH_SECRET
  // No cookies.sessionToken.options.domain — leave default (host-only).
  // No cookies.csrfToken — leave default.
};
```

### Pattern 3: Shared OAuth Client, Multiple Redirect URIs

**What:** One Google OAuth client app registered in Google Cloud Console with two authorized redirect URIs. Both apps use the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env values.

**When to use:** When you have multiple sibling apps under related domains and want users to see "Sign in with Google" once at the consent screen, regardless of which app they're entering.

**Trade-offs:**
- Pro: Users see one consent screen (already approved if they've signed into admin previously).
- Pro: One set of credentials to rotate, in two Firebase secrets pointing at the same value.
- Pro: Verified by the precedent — triarchsecurity-admin and triarchsecurity-portal share their Google OAuth client.
- Con: Compromise of either app's secret compromises the other. Mitigation: standard secret rotation, no portal staff/Slack writes that admin doesn't already authorize.
- Con: Adding a third app later requires only adding a third redirect URI. Not a real con.

**Setup steps (operational, not code):**
1. In Google Cloud Console → APIs & Services → Credentials → existing OAuth 2.0 Client ID
2. Add `https://portal.triarch.dev/api/auth/callback/google` to "Authorized redirect URIs"
3. Save. No code change in admin. Portal auth.ts uses the same client ID/secret values.

### Pattern 4: Hostname Redirect for Migration

**What:** After portal ships, admin's `/projects/[slug]/*` routes return a 301 to `portal.triarch.dev/projects/[slug]/*` (preserving slug, query string, and any sub-path). Implemented as a Next.js middleware in admin checking `pathname.startsWith('/projects/')`.

**When to use:** Any URL fork where existing bookmarks must keep working.

**Trade-offs:**
- Pro: Customer bookmarks continue to resolve.
- Pro: Search engines and any external links pick up the canonical portal URL.
- Pro: 30-day overlap (defined per the migration phase) gives time to email customers and verify telemetry on portal-side.
- Con: Brief flash of admin → portal for already-signed-in admin staff who hit the deprecated URL. Acceptable.

**Example:**
```typescript
// admin/middleware.ts (NEW; already exists for hostname guards in v2.1, extend)
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === '/projects' || pathname.startsWith('/projects/')) {
    return NextResponse.redirect(
      `https://portal.triarch.dev${pathname}${search}`,
      301,
    );
  }
}

export const config = { matcher: ['/projects/:path*'] };
```

### Pattern 5: Portal-Owned FAH Branch Swap

**What:** Portal owns `POST /api/projects/[slug]/branch/preview` and the polling status endpoint. Portal's Firebase project (`triarch-dev-portal`) has its own copy of the `FAH_PROMOTER_SA_KEY` secret. The SA itself is the same (`release-promoter@triarch-vault.iam.gserviceaccount.com`); only its IAM bindings on each consumer's FAH backend matter, and those are unchanged.

**When to use:** When a customer-facing action triggers infrastructure mutations and a proxy hop adds nothing.

**Trade-offs:**
- Pro: Single auth surface — portal's NextAuth session protects the route.
- Pro: ~half the latency of a proxy through admin.
- Pro: Existing v2.1 Phase 13 fah-rollout helper migrates to portal verbatim.
- Con: SA key now lives in two Firebase secret stores. Risk is bounded — both stores are equally trusted, and rotation rotates both.

---

## Data Flow

### Customer Approve-Release Flow (post-portal cutover)

```
Customer clicks Approve on portal.triarch.dev/projects/<slug>/releases
    ↓
[BrowserComponent] → POST /api/projects/<slug>/releases/<id>/approve
    ↓
[portal NextAuth middleware]: validate portal session cookie
    ↓
[handler] → @myalterlego/triarch-shared auth-context: lookup membership
    ↓                          (Drizzle query against project_members)
[handler] → atomic INSERT into release_approvals with partial-unique guard
    ↓
[handler] → call admin's promoteAndAudit endpoint OR import from shared pkg?
    ↓                                     ↑
    ↓                                     │
    └────── DECISION POINT ───────────────┘
            Owns the call: portal.
            How: portal imports github-app helper from shared package
                 OR proxies to admin's promoteAndAudit endpoint.
            Recommend: import from shared package. Portal needs
                       GH_APP_PRIVATE_KEY and GH_APP_INSTALLATION_ID
                       in its Firebase secrets, identical values to admin.
```

**Decision on the "promoteAndAudit" question (slack/github-app):** portal imports `promoteAndAudit` from `@myalterlego/triarch-shared`, gets its own copies of `GH_APP_*` and `SLACK_BOT_TOKEN` secrets in the portal Firebase project. NO proxy through admin. Same rationale as branch-swap: lower latency, single auth surface, secrets are bounded-trust.

### Branch Preview Swap Flow

```
Customer clicks "Preview this branch" on portal release page
    ↓
[BranchPreviewButton] → POST /api/projects/<slug>/branch/preview
    ↓
[portal NextAuth]: validate session, lookup membership for project
    ↓
[handler] → atomic UPDATE projects SET preview_branch_locked = $1
            WHERE key = $slug AND preview_branch_locked IS NULL
    ↓ (lock acquired? else 409)
[fah-rollout helper] → jose JWT → token cache → POST FAH rollouts API
    ↓                                                    │
[portal-side FAH_PROMOTER_SA_KEY secret] ────────────────┘
    ↓
[handler] → release lock on FAH error path; persist rolloutName on success
    ↓
[response] → 202 Accepted, client SWR-polls status endpoint
```

### Schema Migration Flow

```
Admin developer modifies @myalterlego/triarch-shared/schema
    ↓
[admin repo] → packages/triarch-shared version bump (e.g., 0.1.0 → 0.2.0)
    ↓
[admin repo CI] → publish-shared.yml on tag `shared/v0.2.0`
    ↓
[GitHub Packages] → @myalterlego/triarch-shared@0.2.0 available
    ↓
[admin repo] → bump dep in admin package.json AND portal package.json
    ↓ (two PRs: one in each repo)
[admin repo CI] → quality-gate → drizzle-kit push (existing) → deploy
    ↓
[portal repo CI] → quality-gate → deploy (NO db-migrate)
    ↓
Both apps now talk to the migrated schema.
```

### Key Data Flows Summary

1. **Customer release approval:** Portal owns the write path, but the side-effect (Slack notify + GitHub workflow dispatch) reuses helpers from the shared package. No proxy through admin.
2. **Branch swap:** Portal owns the entire path. Admin loses this route post-cutover (becomes redirect).
3. **Customer bug submission:** Portal `POST /api/bugs` → INSERT into `bug_reports`. Admin's existing Slack notifier (`bug-action`) picks it up via the existing slack-actions worker. No coupling needed.
4. **Schema changes:** Admin repo is the source. Bumps land first in shared package, then both apps consume.
5. **Audit/observability:** Both apps write to `slack_action_audit` directly using the shared helper. Admin's `/admin/platform/slack-audit` page reads from the same table — gets portal events for free.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| ~10 customer users (current pilot) | No change — single CRDB cluster, single FAH backend per env handles it. |
| ~100 customer users | No change. CRDB autoscaling handles it. May need to bump portal FAH `maxInstances` from 2 → 4. |
| ~1000 customer users | Add CRDB read replicas (CockroachDB Cloud handles this). Move customer Slack notifications behind a queue (Cloud Tasks) instead of synchronous in-request. |
| ~10000+ customer users | Multi-region FAH deployment (FAH supports this natively). Schema sharding by `ecosystem` column already in projects table. |

### Scaling Priorities

1. **First bottleneck:** synchronous Slack POST in customer write paths (`/approve`, `/reject`). Already mitigated by the v2.0 Phase 06 audit pattern — fire-and-forget try/catch. Will not break before user count exceeds Slack's rate limits.
2. **Second bottleneck:** FAH cold-start on portal (max 2 instances, min 0). Bump `minInstances: 1` once customer activity justifies the always-on cost (~$15/mo per always-on instance).
3. **Third bottleneck:** schema migration coordination with two consumers. Already addressed by tagged-publish flow. Will not bottleneck until 5+ apps consume the shared package.

---

## Anti-Patterns

### Anti-Pattern 1: Sharing the NextAuth secret across apps

**What people do:** Set `NEXTAUTH_SECRET` to the same value in admin and portal, hoping for SSO.
**Why it's wrong:** A leak in either app compromises sessions in both. NextAuth's intent is per-app secret. SSO across hosts is a separate concern (it would require an external SSO provider, not shared signing material).
**Do this instead:** Distinct secrets (`NEXTAUTH_SECRET` vs `PORTAL_NEXTAUTH_SECRET`). Users sign in twice. That's correct.

### Anti-Pattern 2: Setting `cookieDomain: '.triarch.dev'`

**What people do:** Configure NextAuth to set the session cookie on the parent domain so admin and portal share session.
**Why it's wrong:** Defeats the brand-isolation goal of the entire milestone. A staff session token (with elevated capabilities) becomes valid on portal — undoing the v2.1 hostname-guard work that motivated this fork.
**Do this instead:** Leave `cookieDomain` unset. Cookies stay host-only. Two sign-ins, two scopes.

### Anti-Pattern 3: Letting portal run drizzle-kit push

**What people do:** Wire `db-migrate.yml` from shared-workflows@v4 into portal's CI just like admin has it.
**Why it's wrong:** Two CI pipelines racing on `drizzle-kit push` against the same database is a foot-gun. Drizzle's push is not transactional across statements; mid-flight conflicts produce inconsistent schema state.
**Do this instead:** Portal's `ci-cd.yml` deliberately omits the `db-migrate` job. Admin is the schema authority. Portal's `package.json` doesn't include `drizzle-kit` as a dep at all.

### Anti-Pattern 4: Proxying portal API calls through admin

**What people do:** Portal hits `https://admin.triarch.dev/api/projects/.../approve` from its server-side handlers, passing user identity through a custom header.
**Why it's wrong:** Adds latency, introduces a bespoke auth-passing protocol, couples portal availability to admin availability, doubles the attack surface for cross-app token replay.
**Do this instead:** Portal owns its own API routes. Shared logic (github-app, slack post, fah-rollout) lives in the shared package and is imported, not proxied.

### Anti-Pattern 5: Forgetting to bump shared package version

**What people do:** Edit `packages/triarch-shared/src/schema.ts`, deploy admin, then later realize portal is still pinned to the old version.
**Why it's wrong:** Portal's TypeScript will compile against stale types, leading to runtime errors when the new column is queried.
**Do this instead:** PROCESS: any change to `packages/triarch-shared/**` requires a version bump in `packages/triarch-shared/package.json` and a corresponding tag push (`shared/v0.X.Y`). CI guards: `quality-gate.yml` in admin repo checks `git diff` against `packages/triarch-shared/` and fails if version unchanged.

### Anti-Pattern 6: Keeping the v2.1 hostname guards as defense-in-depth

**What people do:** Leave the `headers().get('host')` checks in `src/app/page.tsx`, `src/app/admin/layout.tsx`, etc., in case role-based auth fails.
**Why it's wrong:** Dead code rots. The hostname check was a band-aid for a single-host deployment. Once portal is canonical, admin only ever serves at `admin.triarch.dev` (Firebase App Hosting custom domain enforces this). The check becomes a tautology that future developers misread as load-bearing.
**Do this instead:** Remove the hostname guards from admin in the cutover phase. Keep auth role gates (the actual security boundary).

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google OAuth | Single client, two redirect URIs | Add `https://portal.triarch.dev/api/auth/callback/google` to existing client. No code change in admin. |
| CockroachDB | pg.Pool with `DATABASE_URL` secret | Same connection string in both apps' Firebase secrets. Drizzle schema imported from shared package. |
| Firebase App Hosting (portal) | New project `triarch-dev-portal`, two backends (`-dev`, `-prod`) | Mirror admin's Phase 7.5 overlay convention: minimal `apphosting.yaml` (dev defaults) + `apphosting.prod.yaml` (env=prod overrides). |
| Firebase App Hosting (rollout API) | jose JWT → access token → REST | Existing `fah-rollout.ts` migrates verbatim. SA key stored in portal Firebase project. |
| GoDaddy DNS | A/CNAME record for `portal.triarch.dev` | Use existing `mcp__godaddy__` MCP server. Point at FAH custom domain target (Firebase publishes this on backend creation). |
| GitHub Packages | npm registry for `@myalterlego/triarch-shared` and `@myalterlego/shared-ui` | Both consumed via `.npmrc` + `GH_PAT` build-time secret. |
| Slack | OttoBot bot token, post-only from portal | Portal needs read-only Slack post capability for customer notifications. Reuse existing bot. New scope: none. |
| GitHub App (Triarch Release Gate) | RS256 JWT, cached token, single-flight | `GH_APP_PRIVATE_KEY` + `GH_APP_INSTALLATION_ID` Firebase secrets in portal project. Same values as admin. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| portal ↔ shared package | Build-time npm dep | Pinned version (`^0.1.0`). Bumps coordinated via Phase 0 publish-bump workflow. |
| portal ↔ admin app | NONE (no runtime coupling) | Both reach DB and external services independently. Cross-app coupling is forbidden by design. |
| portal ↔ CRDB | Direct pg connection | Read+write. No proxy. Existing connection-pool pattern (10 max, 30s idle). |
| admin ↔ shared package | Workspace import (admin's monorepo-of-one), then re-export | `src/db/schema.ts` becomes `export * from '@myalterlego/triarch-shared/schema';` etc. Existing import paths in admin source code don't change. |
| admin's `/projects/*` ↔ portal `/projects/*` | 301 redirect | One-way. Portal canonical, admin is graveyard. |
| portal CI ↔ admin CI | Independent | Each repo's `ci-cd.yml` runs shared-workflows@v4 against its own Firebase project. No cross-pipeline triggering. |

---

## Build Order Constraints

The roadmapper decides phases. The constraints are:

1. **Shared package extraction precedes everything.** `@myalterlego/triarch-shared@0.1.0` must be published and consumable from GitHub Packages BEFORE any portal-app work begins. Without it, portal can't import schema or helpers, and starting portal first would create copy-paste drift. (~1-2 days; admin source moves to `packages/triarch-shared/`, plus a re-export shim in `src/db/schema.ts` so admin keeps working unchanged.)

2. **Portal Firebase project + GitHub repo + DNS exist before code.** `triarch-dev-portal` Firebase project, `MyAlterLego/triarch-portal` GitHub repo, GoDaddy DNS for `portal.triarch.dev` pointing at FAH — these are operational tasks that happen before app code is written. A skeleton `next build` of the new repo proves the deploy pipeline works before any feature code lands. (~half a day, mostly waiting on DNS propagation.)

3. **Google OAuth client gets second redirect URI before portal sign-in works.** Operational, ~5 min. Easy to forget; first portal sign-in will fail with `redirect_uri_mismatch` until done.

4. **Portal NextAuth + login + project list before any feature route.** Without auth working, no feature route can be safely tested. This is the portal app's foundation.

5. **Migrated routes ship in dependency order:**
   - Releases page (read-only) FIRST — most-used customer surface, least risk.
   - Branch swap SECOND — depends on releases page being canonical so the "Preview this branch" buttons make sense.
   - Bug/feature view THIRD — these are linked from the releases page lifecycle timeline.
   - Bug/feature submission FOURTH — write paths, want read paths verified first.

6. **Admin redirects ship LAST in the migration phase**, after portal is verified working in production. Until that point, admin's `/projects/*` routes stay live as the canonical surface. Switching the redirect on too early breaks customers if portal has a bug.

7. **v2.1 hostname-guard removal is the FINAL cleanup**, after redirects have been live for the grace period (~30 days). Until then, the guards remain as paranoia (acceptable inconsistency).

8. **Schema changes during portal build are forbidden where possible.** Treat `@myalterlego/triarch-shared@0.1.0` as immutable through the portal-build phases. If a schema bump becomes necessary, branch the shared package, ship admin first with the new schema, only then unblock portal. This avoids the case where portal compiles against shared@0.2 but admin's database hasn't been migrated yet.

### Dependency-Ordered Topology

```
[shared package extraction]
       ↓
[publish shared@0.1.0]
       ↓
[admin re-import shared] ────┐
       ↓                     │
[verify admin still GREEN]   │  (parallel, ops)
       ↓                     │   [Firebase project]
       ↓                     │   [GitHub repo]
       ↓                     │   [DNS]
       ↓                     │   [Google OAuth URI]
       ↓                     ↓
       └─────────────► [portal skeleton: next build → deploy → 200 OK]
                              ↓
                       [portal NextAuth + login + project list]
                              ↓
                       [migrate releases page]
                              ↓
                       [migrate branch swap]
                              ↓
                       [migrate bug/feature view]
                              ↓
                       [add customer bug/feature submission]
                              ↓
                       [admin → portal 301 redirect ON]
                              ↓
                       [30-day grace period]
                              ↓
                       [remove v2.1 hostname guards from admin]
                              ↓
                       [v2.2 done]
```

---

## Open Questions for the Roadmapper

These are things the architecture decision leaves OPEN for the roadmapper / phase-builder to resolve:

1. **Phase decomposition:** the build-order topology above can be split into 4 phases or 8 — that's the roadmapper's call, not the architect's.
2. **Test strategy:** Does portal get its own Vitest setup or share admin's test files via the shared package? Recommend portal-local tests for portal-only routes; shared package gets unit tests in admin repo.
3. **Branding rollout:** When does portal get its own visual identity (logo, hero copy, footer) vs ship with the existing AdminSidebar dark theme? Not an architecture concern, but the roadmap should address.
4. **Customer email seeding:** Once portal goes live, customer admins need to know it exists. Email blast, in-product banner, or both? Out of architecture scope.
5. **Existing Phase 8 (Truth+Treason pilot):** flagged in PROJECT.md as deferred — does v2.2 unblock it or further postpone? Architect's read: portal cutover is a clean place to relaunch the pilot since URL-stable customer surface is what the pilot needed.

---

## Sources

- [Existing precedent: triarchsecurity-portal](file:///Users/mikegeehan/claude/MyAlterLego/triarchsecurity-portal) — separate-repo split that already shipped at portal v0.14.3, mirroring this exact architecture (shared CRDB, separate Firebase project, separate version line, shared OAuth client). HIGH confidence: this is a working production pattern, not a hypothesis.
- [Admin auth.ts](file:///Users/mikegeehan/claude/triarch/development/admin/src/lib/auth.ts) — NextAuth v4 + Google + JWT pattern that portal will mirror.
- [Admin auth-context.ts](file:///Users/mikegeehan/claude/triarch/development/admin/src/lib/auth-context.ts) — DB-backed membership lookup that becomes a shared-package export.
- [Admin schema.ts](file:///Users/mikegeehan/claude/triarch/development/admin/src/db/schema.ts) — 489-line Drizzle schema; ~9 tables are customer-relevant (must be in shared package), ~12 are admin-only (can stay in admin source).
- [Admin ci-cd.yml](file:///Users/mikegeehan/claude/triarch/development/admin/.github/workflows/ci-cd.yml) — shared-workflows@v4 pattern that portal's ci-cd.yml clones with a project-id swap.
- [Admin apphosting.yaml + .prod.yaml](file:///Users/mikegeehan/claude/triarch/development/admin/apphosting.yaml) — overlay convention from v2.0 Phase 7.5 that portal will replicate.
- PROJECT.md milestone v2.2 spec — defines the brand-isolation, schema-sharing, and migration goals this architecture serves.
- NextAuth v4 cookie defaults (host-only, SameSite=lax) — confirms hostname-isolated cookies require no special configuration. Verified by reading the existing admin config (no `cookieDomain` set, sessions are correctly host-scoped).
- Google OAuth 2.0 Authorized Redirect URIs allow multiple values per client — verified empirically by triarchsecurity-portal's working setup against the same client used for triarchsecurity-admin.

---

*Architecture research for: Triarch Customer Portal Split (admin → portal fork)*
*Researched: 2026-05-08*
