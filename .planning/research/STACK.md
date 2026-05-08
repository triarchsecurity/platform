# Technology Stack — Customer Portal (v2.2)

**Project:** triarch-dev portal (`portal.triarch.dev`)
**Researched:** 2026-05-08
**Mode:** Project Research — STACK only
**Confidence:** HIGH (anchored to admin's already-shipped baseline; web research confirms cookie-domain + multi-backend patterns)

---

## Executive Summary

The portal is a brand-new Next.js app that must mirror admin's stack 1:1 to share the CockroachDB schema, the `@myalterlego/shared-ui` design tokens, and the `@myalterlego/secrets` vault. **No new runtime libraries are required** beyond what admin already ships. The work is overwhelmingly *configuration*, not *dependencies*: a separate Firebase App Hosting backend, a separate NextAuth secret, an explicit `cookies.sessionToken.options.domain = 'portal.triarch.dev'` (NOT `.triarch.dev`) so that admin and portal sessions cannot bleed across the brand boundary, and a separate Google OAuth client so the consent screen reflects the portal brand.

The single material decision the team must make for this milestone is **how to share the Drizzle schema across two repos**. Recommendation below: publish `@myalterlego/triarch-schema` as a private GitHub Packages npm module — same pattern admin already uses for `@myalterlego/shared-ui` and `@myalterlego/secrets`, zero new tooling, no monorepo migration, idiomatic Drizzle.

---

## Recommended Stack

### Core Framework — pinned 1:1 to admin

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `next` | `16.2.2` | App Router framework | Match admin exactly so build/deploy parity holds and shared-workflows quality-gate runs identically |
| `react` | `19.2.4` | UI runtime | Pinned by admin; `@myalterlego/shared-ui ^1.2.0` peer-deps against React 19 |
| `react-dom` | `19.2.4` | DOM renderer | Match React major |
| `typescript` | `^5` | Types | Same compiler line as admin |

### Database — same cluster, same schema, no new driver

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `drizzle-orm` | `^0.45.2` | ORM | Identical version pin — required so schema types from `@myalterlego/triarch-schema` (see below) compile against the same drizzle internals admin produces |
| `drizzle-kit` | `^0.31.10` (devDep only) | Migration tooling — **read-only in portal** | Portal **does not own migrations**. `db:push` only runs from admin. Keep drizzle-kit installed so devs can run `drizzle-kit check` locally, but disable `db:push` script in portal's `package.json` to enforce single-writer discipline |
| `pg` | `^8.20.0` | Postgres driver (CRDB) | Same as admin; `pg.Pool` is the established CRDB driver in this workspace |
| `@types/pg` | `^8.20.0` | Types | Match runtime version |

### Auth — same NextAuth, **different secret + cookie domain + OAuth client**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `next-auth` | `^4.24.13` | Auth | **Stay on v4.** Do NOT migrate to `@auth/core` / NextAuth v5 for v2.2 — admin is on v4, types and session shape match, and the portal must fork cleanly. v5 migration is a separate decision the org should make jointly later, not buried inside a portal split. |
| `jose` | `^5` | JWT signer | Already in admin for FAH rollouts (Phase 13). Promote in portal too — needed if portal also drives branch swap (per milestone scope) |

### Infrastructure & Deploy

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Firebase App Hosting | (managed) | Runtime | New backend `portal-prod` + `portal-dev` in **same Firebase project** as admin (`angular-concord-489522-c4`) — see ARCHITECTURE.md decision rationale below |
| Node.js (CI runtime) | `nodejs22` | Server runtime | Match admin's `apphosting.yaml` `runConfig.runtime: nodejs22` |
| Node.js (local dev) | 25 | Dev | Match admin convention; lockfile parity enforced |
| npm | 10 | Lockfile | Mandatory parity per workspace `~/claude/CLAUDE.md` |
| shared-workflows | `v4` (after Phase 7.5 tag) | Reusable GHA | Use the same `quality-gate.yml` + `deploy-firebase.yml` + `db-migrate.yml` ref — see fitness analysis below |

### Shared Internal Packages — already-published, reuse as-is

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@myalterlego/shared-ui` | `^1.2.0` | Design tokens + UI primitives | **Same package as admin**. Brand differentiation comes from layout/copy/header composition, NOT from a forked design system. Anti-feature: do not publish a separate `@myalterlego/portal-ui`. |
| `@myalterlego/secrets` | `^0.1.0` | GCP Secret Manager wrapper | Same pattern; portal will register its own per-secret IAM grants under a new `portal@triarch-vault.iam.gserviceaccount.com` runtime SA |
| **`@myalterlego/triarch-schema`** | `^0.1.0` (NEW — to be published in Phase 1) | Shared Drizzle schema + relations | See "Schema Sharing Decision" below. This is the **only new internal package** v2.2 introduces. |

### Client-Side & UI

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `swr` | `^2.4.1` | Polling | Already used in admin (BranchPreviewClient lifecycle polling). Portal inherits the same pattern. |
| `lucide-react` | `^1.7.0` | Icons | Match admin |
| `tailwindcss` | `^4` | CSS | Match admin |
| `@tailwindcss/postcss` | `^4` | PostCSS adapter | Match admin |

### Testing

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `vitest` | `^4.1.5` | Test runner | Match admin |
| `@testing-library/react` | `^16.3.2` | Component tests | Match admin |
| `@testing-library/jest-dom` | `^6.9.1` | DOM matchers | Match admin |
| `@testing-library/user-event` | `^14.6.1` | User interaction sim | Match admin |
| `jsdom` | `^25.0.1` | DOM env | Match admin |
| `@vitest/ui` | `^4.1.5` | UI runner (devDep) | Match admin |

### Tooling (devDependencies)

| Library | Version | Purpose |
|---------|---------|---------|
| `eslint` | `^9` | Lint |
| `eslint-config-next` | `16.2.2` | Next.js ESLint preset |
| `tsx` | `^4.21.0` | Script runner (seeds, etc.) |
| `@types/node` | `^20` | Node types |
| `@types/react` | `^19` | React types |
| `@types/react-dom` | `^19` | React-DOM types |

---

## What's NEW vs Admin

Just **one package**: `@myalterlego/triarch-schema` (the extracted Drizzle schema). Everything else is identical.

| Library | Verdict | Reason |
|---------|---------|--------|
| `@auth/core` / NextAuth v5 | **NO** | Stay on v4 to match admin. Migration is org-wide work, not in scope for v2.2. |
| Edge runtime middleware (`middleware.ts` for cookie isolation) | **NOT NEEDED** | Cookie isolation is achieved by per-app `cookies.sessionToken.options.domain` config, not by middleware. Standard NextAuth v4 config handles it. |
| Separate UI tokens package | **NO** | Reuse `@myalterlego/shared-ui`. Brand the portal via layout composition. |
| Separate ORM | **NO** | Drizzle stays. Single source of truth. |
| Separate database driver | **NO** | `pg.Pool` stays. |
| Workspace tool (pnpm/turbo) | **NO** for v2.2 | Two-repo strategy keeps deploy independence. See "Repo Strategy Decision" below. Re-evaluate at v3.0 if package count grows. |
| Submodules / symlinks for schema | **NO** | Submodules add CI complexity; symlinks don't survive `npm ci`. Published package is idiomatic Drizzle. |

---

## Schema Sharing Decision (the one that matters)

**Decision: Publish `@myalterlego/triarch-schema` as a private GitHub Packages npm module.**

### Options Evaluated

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **(a) Published `@myalterlego/triarch-schema` npm package** | Same pattern admin already uses for `shared-ui` + `secrets`. Zero new tooling. Works with both repos' existing `.npmrc` + `NODE_AUTH_TOKEN` build secret. Drizzle Discord + GitHub discussions explicitly recommend this for multi-app cases. Versioned, semver, lockfile-tracked. | Requires a tiny publish step on schema changes (`npm version patch && npm publish`). Migration discipline: only admin runs `db:push`. | **CHOSEN** |
| (b) Git submodule (`db-schema/`) | No publish step | Submodule hell on CI: extra clone step, token setup for private submodules, contributors confused, `npm ci` doesn't see submodule contents until they're checked out. Drizzle community calls this "an option of last resort." | Reject |
| (c) Duplicate schema in portal repo | Zero coordination | **Drift risk = guaranteed bugs.** Portal writes a row admin can't read because column types diverged silently. Workspace rules forbid this category of risk. | Reject |
| (d) Symlink (`ln -s ../admin/src/db/schema.ts`) | Works locally | Doesn't survive `npm ci` on Firebase App Hosting build. CI breaks. | Reject |
| (e) Monorepo (Turborepo / pnpm workspaces) | First-class shared package | **Not in scope for v2.2.** Migrating admin into a monorepo is a separate refactor. Defers v2.2. | Defer to future milestone |

### Why Published Package Wins

1. **Pattern consistency:** Admin already consumes `@myalterlego/shared-ui` and `@myalterlego/secrets` from GitHub Packages with `NODE_AUTH_TOKEN` BUILD secret in `apphosting.yaml`. Adding a third package follows the exact same wire — no new auth, no new CI step, no new build flag. Portal's `apphosting.yaml` will get the same `NODE_AUTH_TOKEN` block.
2. **Drizzle idiom:** Drizzle's official position (per the team's discussions board: "Sharing schema across monorepo" #885 and "How to share Drizzle schema in multiple projects?") is that Drizzle schemas are pure TypeScript modules and the supported sharing strategy is *publish them*. There's no Drizzle-specific magic; schema files export typed objects.
3. **Type safety:** Portal imports `import { releaseLogs, projects, releaseLogLinks, bugReports, featureRequests } from '@myalterlego/triarch-schema'` and gets full type inference from `drizzle-orm@^0.45.2`. Lockfile pins both packages, so types stay coherent.
4. **Migration discipline:** Single-writer rule is enforced by **convention + portal's package.json removing `db:push`**. Schema changes go: admin PR → schema package PR → version bump → portal updates dep. This is the same discipline `@myalterlego/secrets` already follows.
5. **Reverts cleanly:** If portal needs to roll back, `npm install @myalterlego/triarch-schema@0.1.0` is one line. Submodules require a `git submodule update` dance.

### Schema Package Structure (Phase 1 of v2.2)

```
@myalterlego/triarch-schema/
├── package.json              # name, version, main: dist/index.js, types: dist/index.d.ts
├── tsconfig.json
├── src/
│   ├── index.ts              # re-exports everything below
│   ├── projects.ts           # projects + relations
│   ├── release-logs.ts       # releaseLogs + releaseFeedback + releaseApprovals + releaseLogLinks + relations
│   ├── trackers.ts           # bugReports + featureRequests
│   ├── menu.ts               # menuSections + menuPages + menuSubpages + rolePermissions
│   ├── audit.ts              # accessAuditLogs + slackActionAudit + workflowTransitions
│   ├── promote.ts            # promoteAttempts
│   └── members.ts            # projectMembers
└── dist/                     # tsc output, published, gitignored in source
```

Re-exports: identical exports admin currently has at `src/db/schema.ts`. Admin's `src/db/schema.ts` becomes a one-liner: `export * from '@myalterlego/triarch-schema';`. Migrations folder stays in admin (`src/db/migrations/`) — admin is still the only writer.

---

## Auth Configuration Strategy

### Cookie Domain Isolation — the critical bit

**Goal:** A session cookie set at `portal.triarch.dev` MUST NOT be sent to `admin.triarch.dev`, and vice versa.

**Mechanism:** In NextAuth v4, when you do **NOT** specify `cookies.sessionToken.options.domain`, the cookie is host-scoped to the exact subdomain. This is the default and exactly what we want — opposite of the cross-subdomain SSO setup most blog posts cover.

**Therefore:** Portal's `auth.ts` should **omit** the `cookies` config block entirely (or explicitly set `domain: undefined`). Result: `Set-Cookie: __Secure-next-auth.session-token=…; Path=/; HttpOnly; Secure; SameSite=lax` with no `Domain=` attribute → host-only cookie scoped to `portal.triarch.dev`.

**Anti-pattern to avoid:** Do NOT set `domain: '.triarch.dev'` on either app. That would share cookies across the brand boundary — exactly what the milestone forbids.

**Verification (downstream consumer test):** After deploy, `curl -I https://portal.triarch.dev/api/auth/session` → response `Set-Cookie` header has NO `Domain=` attribute. Open admin in same browser → admin session unaffected.

### Separate NextAuth Secret

- Generate a **new** `NEXTAUTH_SECRET` for portal: `openssl rand -base64 32`
- Store as a separate GCP secret (e.g., `NEXTAUTH_SECRET_PORTAL` in `triarch-vault`)
- Bind in portal's `apphosting.yaml` as `NEXTAUTH_SECRET` env
- Rotation: rotate independently; admin's secret rotation does not invalidate portal sessions

### Separate Google OAuth Client

- **New OAuth client in Google Cloud Console**, not the admin one. Reasons:
  1. Branding: consent screen says "Sign in to Triarch Customer Portal" not "Sign in to Triarch Admin"
  2. Authorized redirect URI: `https://portal.triarch.dev/api/auth/callback/google` (different host)
  3. Client secret rotation independence
- Store as `GOOGLE_CLIENT_ID_PORTAL` + `GOOGLE_CLIENT_SECRET_PORTAL` in `triarch-vault`; bind in `apphosting.yaml` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` so the NextAuth code path is identical to admin's

### `signIn` Callback Differences

Portal's `signIn` callback inverts the staff/customer logic:
- **Admin (existing):** allows staff via wildcard `project_members` row + customer admins; falls back to `@triarchsecurity.com` allowlist
- **Portal (new):** allows users with ANY `project_members` row (customer admin or viewer); **rejects staff with no customer membership**; staff with both staff role AND customer memberships sign in as customer (and see "Switch to admin.triarch.dev" callout per milestone scope)

This logic reuses the same `getCurrentUserContext` from `@/lib/auth-context` — which means `auth-context.ts` ALSO needs to be in a shared package OR duplicated. Recommendation: pull `auth-context.ts` (and the small `requireAuth` helpers) into a new `@myalterlego/triarch-auth` package OR duplicate (it's small, ~50 lines). **For v2.2 Phase 1: duplicate.** Promote to a package only if a third app appears.

### JWT Strategy

Stay on `session: { strategy: 'jwt' }`. No DB session table. Same as admin. Both apps independently sign their own JWTs with their own secrets — no cross-trust, no shared session store.

---

## Repo Strategy Decision

**Decision: NEW repo `MyAlterLego/triarch-dev-portal`, separate from `MyAlterLego/triarch-dev`.**

### Options Evaluated

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **(a) New repo `triarch-dev-portal`** | Independent version line (portal v0.1.0 → v1.0.0 while admin stays v2.x). Independent CI runs. Independent FAH backend deploys can't fail each other. Mirrors workspace precedent (`triarchsecurity-admin` + `triarchsecurity-portal` are separate repos per workspace `~/claude/CLAUDE.md`). | Schema package needs to be published (already decided above — not extra cost). | **CHOSEN** |
| (b) Subdirectory in `triarch-dev` (workspace-style) | One PR can change both apps | Couples deploys (any portal change re-runs admin's quality-gate). Couples versioning. Couples FAH backend setup. Forces monorepo tooling (turbo/pnpm) which is out of scope. | Reject |
| (c) Branch off in same repo (e.g., long-lived `portal` branch) | None | Workspace `~/claude/CLAUDE.md` explicitly forbids long-lived branches. | Reject (rule violation) |

### CI/CD Independence

Portal's `.github/workflows/ci-cd.yml` references shared-workflows v4 the same way admin does:

```yaml
jobs:
  quality:
    uses: MyAlterLego/shared-workflows/.github/workflows/quality-gate.yml@v4
  deploy:
    needs: quality
    uses: MyAlterLego/shared-workflows/.github/workflows/deploy-firebase.yml@v4
    with:
      environment: prod
      app_name: portal
    secrets: inherit
```

No changes to shared-workflows are required (see fitness analysis below).

---

## Firebase App Hosting Backend Strategy

**Decision: Same Firebase project (`angular-concord-489522-c4`), TWO new backends: `portal-prod` (live = `main` → `portal.triarch.dev`) and `portal-dev` (live = `dev` → `portal-dev.triarch.dev`).**

### Why Same Project, Not New Project

| Factor | Same project (chosen) | New `triarch-dev-portal` project |
|--------|----------------------|----------------------------------|
| Secret reuse | Shared `DATABASE_URL`, `FAH_PROMOTER_SA_KEY`, `SLACK_BOT_TOKEN`, `GITHUB_PACKAGES_TOKEN` already exist; just bind to new backend | Have to recreate every secret — duplication, drift risk |
| Billing | Single GCP billing account already configured | New project = new billing setup |
| Service account reuse | `release-promoter@triarch-vault.iam.gserviceaccount.com` already has rollout perms across projects; works as-is | Need new SA + IAM grants |
| Domain mapping | Add `portal.triarch.dev` custom domain to existing project's Firebase Hosting → straightforward | Same complexity, but in a new project |
| Operational burden | One Firebase Console tab | Two tabs |
| Risk concern: blast radius | Backend isolation gives sufficient isolation — portal-prod and admin-prod are separate Cloud Run services with separate URLs | Marginally better isolation, not worth the cost |

Firebase docs do recommend separate projects for **environment** isolation (prod vs staging) — that's why we already have `triarchdev-dev-15666` cluster vs prod cluster work in flight. But for **app sibling** isolation (admin vs portal) within the same environment, multiple backends in one project is the supported pattern.

### Per-Backend Secret Bindings (portal `apphosting.yaml`)

```yaml
runConfig:
  runtime: nodejs22
  concurrency: 10
  cpu: 1
  memoryMiB: 512
  minInstances: 0
  maxInstances: 2

env:
  - variable: NEXTAUTH_URL
    value: https://portal.triarch.dev
    availability: [BUILD, RUNTIME]

  # Shared with admin — same DB, same vault, same FAH SA, same GH token
  - variable: DATABASE_URL
    secret: DATABASE_URL
  - variable: FAH_PROMOTER_SA_KEY
    secret: FAH_PROMOTER_SA_KEY        # only if portal also drives branch swap
  - variable: NODE_AUTH_TOKEN
    secret: GITHUB_PACKAGES_TOKEN
    availability: [BUILD]
  - variable: SLACK_BOT_TOKEN
    secret: SLACK_BOT_TOKEN              # only if portal sends Slack notifications

  # PORTAL-ONLY — separate from admin
  - variable: NEXTAUTH_SECRET
    secret: NEXTAUTH_SECRET_PORTAL       # NEW secret in vault
  - variable: GOOGLE_CLIENT_ID
    secret: GOOGLE_CLIENT_ID_PORTAL      # NEW OAuth client
  - variable: GOOGLE_CLIENT_SECRET
    secret: GOOGLE_CLIENT_SECRET_PORTAL  # NEW OAuth client secret
```

Plus an `apphosting.dev.yaml` overlay (per Phase 7.5 pattern) for `portal-dev` backend that switches `NEXTAUTH_URL` to `https://portal-dev.triarch.dev` and points to dev-suffixed secrets.

---

## shared-workflows v4 Fitness Analysis

**Verdict: Existing v4 reusable workflows work as-is for portal. Zero changes required.**

### `quality-gate.yml`

| Check | Admin uses it | Portal needs it |
|-------|---------------|-----------------|
| `npm ci` | Yes | Yes (same) |
| `npx next build` | Yes | Yes (same) |
| `npx vitest run` | Yes | Yes (same) |
| `npx eslint` | Yes | Yes (same) |
| TypeScript check | Yes | Yes (same) |

No admin-specific assumptions — it's a generic Next.js quality-gate. Portal slots in identically.

### `deploy-firebase.yml`

| Concern | Status |
|---------|--------|
| `environment: prod \| dev` input | Already added in Phase 7.5 |
| `app_name` parameter for backend selection | Already supported |
| Secret resolution from Firebase | Already supported |
| Per-backend `apphosting.yaml` overlay | Already supported |

### `db-migrate.yml`

**Portal does NOT call this workflow.** Migrations are admin-only (single-writer enforced via missing `db:push` script in portal `package.json`). Schema package publishing is a separate workflow we'll add to `MyAlterLego/triarch-schema` repo (one-liner `npm publish` job).

### Security Headers

Customer-facing apps typically want stricter CSP / security headers than internal admin tools. **However, this is a `next.config.ts`-level concern (`async headers()`)**, not a shared-workflows concern. Phase 1 of v2.2 should add a `headers()` block to portal's `next.config.ts` with `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Admin should eventually mirror — but not required for portal launch.

### `/admin/*` Route Testing

Quality-gate doesn't test routes. It runs vitest. Portal has its own test files. No coupling.

---

## Installation Recipe (Phase 1 of v2.2)

```bash
# 1. Bootstrap portal repo
cd ~/claude/triarch/development
mkdir portal && cd portal
npx create-next-app@16.2.2 . --ts --tailwind --app --no-src-dir --turbopack false
# (manually edit package.json to match admin pins exactly — see table above)

# 2. Configure private registry (same .npmrc as admin)
cat > .npmrc <<'EOF'
@myalterlego:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
EOF

# 3. Install deps (after schema package is published)
npm install \
  next@16.2.2 react@19.2.4 react-dom@19.2.4 \
  drizzle-orm@^0.45.2 pg@^8.20.0 \
  next-auth@^4.24.13 jose@^5 \
  swr@^2.4.1 lucide-react@^1.7.0 \
  @myalterlego/shared-ui@^1.2.0 \
  @myalterlego/secrets@^0.1.0 \
  @myalterlego/triarch-schema@^0.1.0   # publish first; see Phase 1.1

npm install -D \
  typescript@^5 @types/node@^20 @types/react@^19 @types/react-dom@^19 \
  @types/pg@^8.20.0 \
  tailwindcss@^4 @tailwindcss/postcss@^4 \
  eslint@^9 eslint-config-next@16.2.2 \
  drizzle-kit@^0.31.10 tsx@^4.21.0 \
  vitest@^4.1.5 @vitest/ui@^4.1.5 jsdom@^25.0.1 \
  @testing-library/react@^16.3.2 \
  @testing-library/jest-dom@^6.9.1 \
  @testing-library/user-event@^14.6.1

# 4. Phase 1.1 (parallel work): publish @myalterlego/triarch-schema
#    - Extract admin/src/db/schema.ts → new repo MyAlterLego/triarch-schema
#    - Build, version 0.1.0, publish to GitHub Packages
#    - In admin: replace src/db/schema.ts contents with `export * from '@myalterlego/triarch-schema';`
#    - Commit admin v2.9.0 (no functional change — refactor)
```

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack pin matches admin | **HIGH** | Direct file read of admin `package.json` — versions verified |
| Cookie domain isolation strategy | **HIGH** | NextAuth v4 docs + multiple GitHub issues confirm host-only is default when `domain` is omitted; cross-subdomain leak only happens when you opt in |
| Schema sharing via published package | **HIGH** | Drizzle community consensus, matches existing `@myalterlego/*` pattern in this workspace |
| Repo split (new repo, not monorepo) | **HIGH** | Workspace precedent (`triarchsecurity-admin` + `triarchsecurity-portal`) and explicit workspace rule against long-lived branches |
| Firebase backend in same project | **MEDIUM** | Firebase docs prefer separate projects for *environment* split, but support multi-backend within a project for *app sibling* split. Risk is low; if it bites, migrating to a new project later is straightforward (re-bind secrets, change DNS) |
| shared-workflows v4 fitness | **HIGH** | Workflows are generic; admin already exercises every needed input |
| OAuth client separation | **HIGH** | Standard OAuth practice — different brand surface = different consent screen |
| `auth-context.ts` duplication for Phase 1 | **MEDIUM** | Pragmatic call. Promoting to a third package becomes worth it only if there's a third consumer. |

---

## Anti-Features (Explicit Do-Not-Add List)

| Don't Add | Why |
|-----------|-----|
| `@auth/core` / NextAuth v5 | Stay on v4 to match admin. Migration is org-wide work. |
| Edge middleware for cookie scoping | Standard NextAuth `cookies` config handles it. |
| Separate UI library (`@myalterlego/portal-ui`) | Reuse `@myalterlego/shared-ui`. Brand via composition. |
| Separate ORM (Prisma / Kysely / etc.) | Drizzle stays. Type coherence with shared schema package depends on it. |
| Separate DB driver | `pg.Pool` stays. |
| Monorepo migration (Turborepo / pnpm workspaces) | Out of scope. Two repos + published packages keep deploy independence. Reconsider at v3.0. |
| Submodules | Don't survive `npm ci` cleanly on FAH builds. |
| Symlinks for schema | Don't survive `npm ci`. |
| Long-lived `portal/` branch in admin repo | Forbidden by workspace rules. |
| New Firebase project | Same-project multi-backend is sufficient and simpler. |
| Shared session cookie across `.triarch.dev` | Explicitly forbidden by milestone scope. |
| Bearer tokens in localStorage | Workspace rule: jose JWT in httpOnly cookies only. |

---

## Sources

- [NextAuth.js Configuration Options — cookies](https://next-auth.js.org/configuration/options) — cookie domain config, session cookie options
- [NextAuth issue #2414 — Sharing session across subdomains](https://github.com/nextauthjs/next-auth/issues/2414) — confirms host-only is default
- [NextAuth issue #8222 — Two session token cookies created](https://github.com/nextauthjs/next-auth/issues/8222) — gotcha around explicit domain setting
- [NextAuth subdomain auth blog](https://sometechblog.com/posts/enable-nextauth-to-work-across-subdomains/) — opt-in cross-subdomain pattern (we want the inverse)
- [Drizzle Discussion #885 — Sharing schema across monorepo](https://github.com/drizzle-team/drizzle-orm/discussions/885) — official guidance
- [Answer Overflow — How to share Drizzle schema in multiple projects](https://www.answeroverflow.com/m/1237696925017309215) — confirms published-package pattern
- [Pliszko — Shared database schema with DrizzleORM and Turborepo](https://pliszko.com/blog/post/2023-08-31-shared-database-schema-with-drizzleorm-and-turborepo) — concrete example
- [Firebase App Hosting — Multiple environments](https://firebase.google.com/docs/app-hosting/multiple-environments) — multi-backend guidance
- [Firebase App Hosting — Configure backends](https://firebase.google.com/docs/app-hosting/configure) — per-backend `apphosting.yaml` and secret binding
- [Firebase blog — App Hosting July 2024 update](https://firebase.blog/posts/2024/07/app-hosting-updates/) — multi-backend support announcement, wildcard subdomains
- Workspace baseline: `/Users/mikegeehan/claude/triarch/development/admin/package.json` (verified 2026-05-08)
- Workspace baseline: `/Users/mikegeehan/claude/triarch/development/admin/apphosting.yaml` (verified 2026-05-08)
- Workspace baseline: `/Users/mikegeehan/claude/triarch/development/admin/src/lib/auth.ts` (verified 2026-05-08)
- Workspace baseline: `/Users/mikegeehan/claude/triarch/development/admin/src/db/schema.ts` (verified 2026-05-08)
- Workspace rules: `/Users/mikegeehan/claude/CLAUDE.md` (Next.js 16+ caveat, version-bump rule, repo separation precedent, jose JWT auth standard)
