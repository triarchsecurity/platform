# Spec — Extract the www.triarch.dev marketing site out of `platform` (2026-05-29)

**For a fresh GSD session in THIS repo (`platform`, cloned at `~/claude/triarch/development/dev/admin`).**
Investigation done 2026-05-29; this doc is the handoff so you don't re-investigate. Verify each fact before acting.

## Goal
www.triarch.dev (the "Triarch Dev | Custom App Development" marketing site) should be its OWN repo, cloned at
`~/claude/triarch/development/www`, separate from the `platform` admin app. End state: www.triarch.dev served from
the new repo; admin.triarch.dev still served from `platform`.

## Verified current state (2026-05-29)
- **One repo, two App Hosting backends** in GCP project **`triarch-dev-website`** (us-central1):
  - backend **`admin-dev`** → repo `triarchsecurity/platform`, root `/` → **admin.triarch.dev**
  - backend **`triarch-dev`** → repo `triarchsecurity/platform`, root `/` → **www.triarch.dev** (cache-tag `…276081117950:triarch-dev`)
  - (also `portal-dev`/`portal-prod` → `dev-portal` repo; unrelated)
- The marketing surface in `platform` is the **public root**: `src/app/page.tsx` (~42 lines, `Hero` + `Contact` components) + `globals.css`/`layout.tsx` + public assets. `src/app/projects/layout.tsx` already branches on a MARKETING/public vs authed path. The admin app = `src/app/admin/`, `api/`, `login/`, authed `projects/`.
- **No host-based middleware** — www.triarch.dev and admin.triarch.dev are the same Next.js app on two domains; the marketing landing is at `/`.
- apex `triarch.dev` → 404 (only `www` serves). DNS: www.triarch.dev custom domain currently bound to the `triarch-dev` App Hosting backend.
- platform stack: Next.js 16 (App Router), Drizzle, `apphosting.yaml` + `apphosting.dev.yaml` (env-overlay per backend Environment Name), shared-workflows CI, `@triarch`/shared-ui.

## Proposed phases (refine in /gsd:new-project)
1. **New repo** `triarchsecurity/triarch-dev-website`, cloned to `~/claude/triarch/development/www`; Next.js skeleton mirroring `triarchsecurity-website`/platform conventions (shared-workflows quality-gate, apphosting.yaml, **npm 10 lockfile** — CI uses node18/npm10).
2. **Move the marketing surface** from platform → new repo: root `page.tsx`, `Hero`/`Contact` (+ any `components/marketing`), styles, public assets, and the public `projects` pages. Keep shared UI via `@triarch/shared-ui` (don't fork).
3. **App Hosting**: repoint the existing **`triarch-dev` backend** from `triarchsecurity-platform` → `triarch-dev-website` (or create a new backend); keep it in the `triarch-dev-website` GCP project.
4. **Custom domain**: ensure **www.triarch.dev** binds to the (re)pointed backend; consider an apex `triarch.dev`→`www` redirect (currently 404).
5. **Deprecate** the marketing routes in `platform` (root `/` → redirect to `/admin` or login; remove Hero/Contact + public projects pages).
6. **Verify** both prod domains: www.triarch.dev (new repo) + admin.triarch.dev (platform) serve correctly; no broken shared-UI imports.

## ⚠ Cautions (prod-affecting — plan + confirm before doing)
- Steps 3–4 change **what serves www.triarch.dev in production** (backend repo connection + custom domain). Sequence to avoid downtime: stand up new repo + backend serving the marketing site FIRST, validate on its `.hosted.app` URL, THEN move the www.triarch.dev domain, THEN deprecate platform's marketing routes.
- Deploys are via GitHub→App Hosting; follow the workspace feature→dev→main flow + version bumps.
- shared-ui is consumed via package, not copied — preserve that.

## Already done (related, this session)
- triarchsecurity.com site repo renamed locally: `development/security/website` → `development/security/www` (git intact; deploys unaffected).
