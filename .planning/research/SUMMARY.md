# Project Research Summary — v2.2 Customer Portal Split

**Project:** triarch-dev (admin) → fork customer surface to `portal.triarch.dev`
**Domain:** Multi-app fork of an existing Next.js operations console (staff stays at `admin.triarch.dev`, customer surface forks to a new sibling Next.js app)
**Researched:** 2026-05-08
**Confidence:** HIGH

---

## Executive Summary

v2.2 is **not greenfield**. Admin already implements ~80% of the customer surface (release page, two-step approve, branch preview, lifecycle timeline, bug/feature views, project_members role model, NextAuth Google OAuth). The work is **port + isolate**, not invent. The architecture is also **not novel** — the in-house precedent `triarchsecurity-admin` ↔ `triarchsecurity-portal` already runs this exact split in production at portal v0.14.3 and admin in production. We are reproducing a working pattern.

The single decision that drives everything else is **shared-schema strategy**. Recommendation across all four research files: extract Drizzle schema (and a small set of helpers — `auth-context`, `sanitize-commit`, `slack-status`) into a new private GitHub Packages npm module (`@myalterlego/triarch-shared`), published from admin's repo, consumed by both apps. **Admin is the migration authority.** Portal pins the package, runs no migrations, and has a CockroachDB role without DDL grants as defense-in-depth. This is the only new internal package v2.2 introduces; everything else is configuration.

The dominant risks are **cookie/secret leakage across the brand boundary** (NextAuth defaults must be preserved — host-only cookies, distinct `NEXTAUTH_SECRET` per app, never set `domain: '.triarch.dev'`), **schema/version drift** between two independently deployed consumers (CI gate + admin-only writes), and **URL rot at cutover** (centralize URL emission in `src/lib/urls.ts` BEFORE flipping the 301). All three are addressable with patterns the team has already shipped (Phase 7.5 hostname overlay, Phase 13 fah-rollout JWT, Phase 11 sanitize helpers). For details, see STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md.

---

## Key Findings

### Recommended Stack

Pin portal **1:1 to admin** for every runtime dep. The work is configuration, not new dependencies.

**Core technologies:**
- `next@16.2.2` + `react@19.2.4` — Match admin exactly so build/deploy parity holds
- `next-auth@^4.24.13` — Stay on v4 (DO NOT migrate to v5/`@auth/core` in v2.2)
- `drizzle-orm@^0.45.2` + `pg@^8.20.0` — Same DB cluster, same driver; `drizzle-kit` is devDep-only in portal (read-only)
- `@myalterlego/shared-ui@^1.2.0` — Reuse, don't fork. Brand differentiation comes from layout composition
- **NEW:** `@myalterlego/triarch-shared@^0.1.0` — The only new internal package: Drizzle schema + 3-4 helpers, published from admin repo via tag-driven workflow, consumed read-only by portal

**Cross-cutting decisions (DECIDE ONCE, USED EVERYWHERE):**

| Decision | Verdict | Why |
|---|---|---|
| Code-sharing | New private GH Packages npm pkg (NOT submodule, NOT symlink, NOT monorepo) | Mirrors existing `@myalterlego/*` pattern; survives `npm ci` on FAH |
| Repo strategy | NEW repo `MyAlterLego/triarch-portal` | Independent versions/deploys; matches workspace precedent |
| Firebase | Same project (`triarch-dev-website`), new backends `portal-prod`/`portal-dev` | Reuses DATABASE_URL, FAH_PROMOTER_SA_KEY, NODE_AUTH_TOKEN, SLACK secrets; reversible if it bites |
| Cookie scope | Host-only (`__Host-` prefix in prod, NO `domain` attribute) | Default NextAuth v4 behavior |
| NextAuth secret | DISTINCT per app (`ADMIN_NEXTAUTH_SECRET` vs `PORTAL_NEXTAUTH_SECRET`) | No cross-app JWT replay |
| OAuth client | SHARED single Google client with TWO redirect URIs | One consent screen; same `email` claim — no `sub`-divergence ghosts |
| Slack ownership | Portal owns `PORTAL_SLACK_BOT_TOKEN` for direct posting; GitHub App key stays admin-only (portal calls admin via HMAC for dispatch) | Bounded blast radius for GitHub App key; portal posts its own customer notifications directly |
| FAH branch swap | Portal owns end-to-end; portal's apphosting binding gets its own `FAH_PROMOTER_SA_KEY` ref | Lower latency, single auth surface |
| Migrations | Admin is sole writer; portal has DML-only DB role; portal `package.json` has NO `db:push` | Two `drizzle-kit push` callers race |
| URLs | Centralize in `src/lib/urls.ts` + ESLint `no-restricted-syntax` BEFORE cutover | Email/Slack link rot at T+90 is otherwise inevitable |
| auth-context.ts | Move to shared package (`@myalterlego/triarch-shared/auth`) | We're already creating the package; no point duplicating |
| Shared pkg name | `@myalterlego/triarch-shared` | Matches actual scope (schema + helpers) better than `triarch-schema` |

### Expected Features

The customer surface is **a port + 2 missing primitives** (project list landing, customer-side bug/feature submission).

**Must-have / table stakes (P1 — all in v2.2):**
- Google OAuth sign-in (portal-scoped)
- Login wall on `/` + post-login routing (0 → empty state; 1 → auto-redirect; 2+ → project list)
- Project list landing `/projects` with pipeline-summary tiles
- Release page port `/projects/[slug]/releases` — lift-and-shift
- Bug detail + bug list + bug submission form
- Feature detail + feature list + feature submission form
- Customer header + sign-out
- 404 (NOT 403) for non-members on every `/projects/[slug]/*` route
- 301 redirects from admin (90-day grace)
- Mobile-responsive READ paths (approve stays desktop)
- Staff "Switch to admin.triarch.dev" callout (NOT 401)

**Should-have (P2 — v2.2.x patch series):**
- Email digest of pending approvals
- Customer-admin self-serve teammate invite
- Bug Q&A / comment thread

**Defer (P3 — v2.3+):**
- White-label, in-app notification bell, per-customer Slack workspace, approval delegation, account-settings page, bulk approve, magic-link auth, file attachments

**Anti-features (DO NOT BUILD in v2.2):**
- White-label / per-customer accent or subdomain
- Email/password auth + signup form
- PWA / offline / service worker
- Real-time websocket release updates (SWR poll covers it)
- Customer-facing marketing copy on `/`
- Public docs / portal changelog
- Customer billing dashboard (out of PROJECT.md scope)
- Customer-facing roadmap board (WhatsComingCard already shows it)
- Voting / upvoting on feature requests
- Customer-supplied "target date" on feature requests
- Multi-customer "switch customer" dropdown (admin's job)
- Iframe admin in portal or vice versa (CSP `frame-ancestors 'none'`)
- Cross-origin asset embedding in customer emails (link, never embed)
- NextAuth v5 migration
- Workspace tool migration (pnpm/turbo)

### Architecture Approach

Two independently-deployed Next.js apps share one CockroachDB cluster, one Google OAuth client (with two redirect URIs), and one shared npm package — and are otherwise fully isolated.

**Major components:**
1. **`admin.triarch.dev`** (existing) — Staff console, OttoBot dispatch, Slack audit, member management, **schema migration authority**
2. **`portal.triarch.dev`** (NEW) — Customer surface; Drizzle read+limited-write, no migrations
3. **`@myalterlego/triarch-shared`** (NEW npm package) — Schema + `auth-context` + `sanitize-commit` + `slack-status`. Lives at `packages/triarch-shared/` in admin repo; published on tag `shared/v*`
4. **CockroachDB `triarch_dev`** — Both apps connect directly via `pg.Pool`; portal's runtime SA gets DML-only role
5. **Google OAuth client** — Add second redirect URI; both apps use same client ID/secret
6. **Firebase App Hosting** — Portal gets own backends (`portal-prod`/`portal-dev`) in same `triarch-dev-website` Firebase project

**Key patterns:** Hostname-per-cookie isolation (default NextAuth v4); shared schema + federated writes; hostname redirect for migration (90-day 301); portal-owned FAH branch swap; tag-driven shared-package publishing.

### Critical Pitfalls

Top 5 of 14 catalogued in PITFALLS.md:

1. **Cookie domain misconfiguration leaks portal session to admin** — DO NOT set `domain: '.triarch.dev'`. Use `__Host-` prefix in prod (browser-enforced). Vitest test on Set-Cookie. **Phase 2.**
2. **Schema package version drift** — Two consumers diverge; portal writes fail or types compile against stale schema. Admin owns migrations; CI gate fails on >1 minor lag; portal DB role lacks DDL. **Phase 1 + Phase 3.**
3. **CI deploys portal code into admin's Firebase project** — Add `verify-deploy-target` job to `shared-workflows` with committed lookup table; per-repo deploy SAs. **Phase 8 — hard prerequisite.**
4. **Customer bookmarks rot at cutover** — Centralize URL construction in `src/lib/urls.ts` + ESLint rule + 90-day 301 + email blast. **Phase 4 BEFORE portal ships; Phase 9 cutover.**
5. **Hostname guards left dangling in admin** — Inventory ALL `host ===` references in **Phase 1.5**; fail-closed middleware in both apps; delete dead branches in **Phase 10**.

Other notable: OAuth `sub` divergence (use email everywhere), migration ownership confusion, NEXTAUTH_SECRET rotation breakage, Slack credential routing, cross-origin embedding, signIn user-record race, local dev workflow, apphosting.yaml env drift.

---

## Implications for Roadmap

### Phase 15: Operational Prework (parallel, ~half day)
**Rationale:** Ops tasks before app code; deploy pipeline provable on a skeleton.
**Delivers:** New repo `MyAlterLego/triarch-portal`; FAH backends in `triarch-dev-website`; GoDaddy DNS for `portal.triarch.dev`; Google OAuth second redirect URI + localhost URIs.
**Avoids:** Pitfall 6 (per-repo SAs upfront), Pitfall 13 (OAuth localhost URIs from start).

### Phase 16: Shared Package Extraction + Repo Scaffold
**Rationale:** Schema package must publish before any portal-app work. Strips `db:push` from portal scaffold; writes `docs/local-dev.md` + `docs/schema-ownership.md`.
**Delivers:** `packages/triarch-shared/` in admin; `@myalterlego/triarch-shared@0.1.0` published; admin shim re-exports; admin GREEN; portal repo skeleton with deploying 200-OK landing.
**Avoids:** Pitfalls 3, 4, 13, 14.

### Phase 17: Hostname Guard Inventory + Fail-Closed Middleware
**Rationale:** Audit before introducing second host so cutover has a known cleanup target.
**Delivers:** Catalog of every `host ===`/`headers().get('host')` reference in admin; admin middleware fails closed for non-admin hosts.
**Avoids:** Pitfall 5.

### Phase 18: Portal Auth Scaffolding
**Rationale:** Auth is prerequisite for any feature route + has highest concentration of catastrophic pitfalls (1, 2, 8, 12).
**Delivers:** NextAuth v4 with `__Host-` cookies, distinct `PORTAL_NEXTAUTH_SECRET`, read-only signIn callback (rejects no-membership; staff "Switch to admin"), Vitest cookie tests + grep-test on `.sub`, login wall, post-login routing.
**Uses:** `next-auth@^4.24.13`, shared `auth-context`, jose JWT pattern from admin Phase 13.

### Phase 19: Database Connectivity + DML-Only Role
**Rationale:** Defense-in-depth so rogue `db:push` or compromise can't mutate schema.
**Delivers:** Portal `src/lib/db.ts`; CRDB role with SELECT/INSERT/UPDATE/DELETE only; `ALTER TABLE` from portal returns permission denied.

### Phase 20: URL Centralization (in admin repo)
**Rationale:** Refactor admin BEFORE portal ships; otherwise every URL string in admin rots at cutover.
**Delivers:** `src/lib/urls.ts`; all 14+ call sites refactored (Slack builders, OttoBot Block Kit, GitHub release notes); ESLint `no-restricted-syntax` blocks raw URL literals.

### Phase 21: Release Page Port (read paths first)
**Rationale:** Most-used customer surface, least risk; verify rendering before exposing mutation.
**Delivers:** Portal `/projects/[slug]/releases` with full lift-and-shift; project list `/projects`; project tiles via `getProjectPipelineSummaries()`; 404 for non-members.

### Phase 22: Approve/Reject/Feedback + Slack/GitHub Integration
**Rationale:** Customer write surface needs careful auth + audit. Slack credential ownership decision lands here.
**Delivers:** Portal API routes for approve/reject/feedback + branch preview; portal-owned `FAH_PROMOTER_SA_KEY`; Slack/GitHub wiring per ownership decision; two-step approve / conflict badge / branch lock UX intact.
**Avoids:** Pitfalls 8, 9.

### Phase 23: Bug + Feature Surface (view + submit)
**Rationale:** Linked from release-page lifecycle timeline; views first, then submission forms.
**Delivers:** `/projects/[slug]/bugs/*` and `/projects/[slug]/features/*` (list, detail, new); reuses `release_log_links` + `getReleaseHistoryForBug`/`...ForFeature`; project-scope guards on POST. The two **net-new primitives**.

### Phase 24: CI/CD + verify-deploy-target + Env Validation
**Rationale:** Hard prerequisite for going live.
**Delivers:** `verify-deploy-target` job in shared-workflows with committed lookup table; per-repo deploy SAs; portal `apphosting.yaml` + `.dev.yaml` overlay; `assertEnv()` schema; `validate-apphosting.ts` CI step.
**Avoids:** Pitfalls 6, 14.

### Phase 25: Cutover (301 + email blast + admin route deprecation)
**Rationale:** Flip redirect AFTER portal verified in production.
**Delivers:** Admin middleware 301 → portal; customer email blast; Slack message URL update sweep on last 30 days; `redirect_hits` telemetry; kill-switch env var; mobile-responsive QA.
**Avoids:** Pitfall 7.

### Phase 26: Sunset (T+90)
**Rationale:** Final cleanup AFTER 30+ day grace, when telemetry shows minimal residual traffic.
**Delivers:** Delete admin `/projects/[slug]/*` routes; delete dead hostname-guard branches; admin v-bump.
**Avoids:** Pitfall 5 rot.

### Phase Ordering Rationale
- Schema package precedes everything — type safety dependency
- Auth before features — pitfall surface concentration
- URL centralization in admin BEFORE cutover — prerequisite for redirect correctness
- Read paths before write paths — verify rendering before mutation
- Cutover two-phased (Phase 25 immediate + Phase 26 at T+90) — bookmark grace
- Schema changes forbidden during portal build (Phases 18-23) where possible

### Research Flags

**Needs deeper research (use `/gsd:research-phase`):**
- **Phase 22** — Slack credential ownership operational mechanics (HMAC-proxy vs direct-import) — settled at SUMMARY level but operational details TBD
- **Phase 24** — `shared-workflows` may need v5 tag depending on backwards-compat of new `repo_name` input

**Standard patterns (skip research-phase):**
- All other phases use established patterns; research summary is sufficient.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Direct file read of admin `package.json`; pinned 1:1 |
| Features | **HIGH** | Domain is "port + 2 missing primitives" |
| Architecture | **HIGH** | In-house precedent already in production |
| Pitfalls | **HIGH** | Codebase audit + verifiable via Vitest + grep |

**Overall confidence:** HIGH

### Resolved Gaps (autonomous decisions per Mike's directive)

1. **Firebase project decision:** Same `triarch-dev-website` project, two new backends. Reuses existing secret IAM bindings; reversible if it bites.
2. **Slack credential ownership:** Portal owns `PORTAL_SLACK_BOT_TOKEN` for direct customer-side posting; admin retains GitHub App key + dispatches workflows via internal HMAC-signed POST from portal. Phase 22 implements.
3. **`auth-context.ts` placement:** In shared package (we're creating it anyway).
4. **Shared package name:** `@myalterlego/triarch-shared` (matches scope — schema + helpers).
5. **Customer email seeding at cutover:** Phase 25 success criterion — email blast list derived from `project_members.email WHERE role IN ('admin','viewer')`.
6. **Truth+Treason pilot reactivation:** Out of v2.2 scope; v2.3 milestone candidate after portal cutover stabilizes.

---

## Sources

### Primary (HIGH confidence)
- Admin codebase audit: `package.json`, `apphosting.yaml`, `src/lib/auth.ts`, `src/lib/auth-context.ts`, `src/db/schema.ts`, `.github/workflows/ci-cd.yml` (verified 2026-05-08)
- In-house precedent: `MyAlterLego/triarchsecurity-portal` v0.14.3 — working production split
- Workspace baseline: `/Users/mikegeehan/claude/CLAUDE.md`
- PROJECT.md v2.2 milestone definition

### Secondary (MEDIUM-HIGH confidence)
- NextAuth.js v4 docs — cookie config, session options
- NextAuth issues #2414, #8222 — cross-subdomain patterns
- Drizzle Discussion #885, Answer Overflow — schema-sharing
- Firebase App Hosting docs — multi-environment / multi-backend
- CockroachDB docs — `GRANT`/`REVOKE` DDL gating
- RFC 6265bis — `__Host-` and `__Secure-` cookie prefix semantics
- OWASP CSP + MDN — `frame-ancestors`, cross-origin

### Tertiary (MEDIUM confidence)
- 301 redirect 90-day grace — general web migration convention
- B2B portal feature landscape (supastarter, supportbench, baytechconsulting, techvoot, agencyhandy, asabix) — informed anti-feature list

---

*Research completed: 2026-05-08*
*Ready for roadmap: yes*
*See detail docs: STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md*
