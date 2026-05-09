# Pitfalls Research

**Domain:** Forking customer-facing surface from staff-only Next.js app into separate, independently-deployed Next.js app on a sibling subdomain (`admin.triarch.dev` → `portal.triarch.dev`) with shared CockroachDB schema, shared Google OAuth identity, isolated NextAuth sessions.

**Researched:** 2026-05-08
**Confidence:** HIGH (anchored in admin codebase audit + NextAuth v4 cookie semantics + Drizzle/Firebase App Hosting deployment realities). Where confidence drops to MEDIUM, called out per pitfall.

---

## Critical Pitfalls

### Pitfall 1: Cookie domain misconfiguration leaks portal session to admin (or breaks CSRF)

**What goes wrong:**
NextAuth v4 with `session.strategy: 'jwt'` writes a `__Secure-next-auth.session-token` cookie scoped to the request host by default. Three failure modes when forking:

1. **Set `cookies.sessionToken.options.domain = '.triarch.dev'` (leading dot):** session cookie sent to BOTH `admin.triarch.dev` and `portal.triarch.dev`. Customer signs into portal with their @customer.com Google account, opens `admin.triarch.dev` in same browser, NextAuth on admin sees a valid JWT, calls `signIn` callback, and the env-allowlist fallback (`src/lib/auth.ts` lines 41–44) lets through anyone matching `@triarchsecurity.com` — but the JWT validates regardless of `signIn` callback because `signIn` only runs on initial OAuth, not on subsequent JWT verification. Customer gets `getServerSession` returning their identity on admin routes that gate on `getServerSession(authOptions)` rather than on `requireStaff()`.
2. **Set domain too tight (host-only with `Host-` prefix) but serve the OAuth callback off a different origin:** the `__Host-next-auth.csrf-token` cookie is rejected on the OAuth POST-back because `__Host-` requires `Path=/` with no Domain attribute and `Secure` — any deviation (e.g. CDN that rewrites Set-Cookie) silently drops the cookie and NextAuth returns "MissingCSRF" without a clear error to the user.
3. **Forgot to override `useSecureCookies: true` in dev** but ran portal locally on `http://localhost:3002` → `__Secure-` prefix gets dropped silently, `signIn()` works, but session cookie is rejected on subsequent reads → infinite redirect loop on `/login`.

**Why it happens:**
NextAuth's defaults are correct for single-app deployments. The cross-subdomain scenario is undocumented in v4 and the `cookies` override block is buried in adapter docs. Devs reach for `domain: '.triarch.dev'` thinking "scope it to the parent" without realizing that's exactly what enables leakage. The leading-dot convention from RFC 2109 is treated as "allow subdomain" which is precisely wrong here.

**How to avoid:**
Each app must explicitly OMIT the `domain` attribute on session cookies (host-only). Set in `authOptions.cookies` for both apps:

```ts
cookies: {
  sessionToken: {
    name: process.env.NODE_ENV === 'production'
      ? `__Host-next-auth.session-token`
      : `next-auth.session-token`,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      // NO domain field — host-only by omission
    },
  },
  csrfToken: {
    name: process.env.NODE_ENV === 'production'
      ? `__Host-next-auth.csrf-token`
      : `next-auth.csrf-token`,
    options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
  },
  callbackUrl: {
    name: process.env.NODE_ENV === 'production'
      ? `__Secure-next-auth.callback-url`
      : `next-auth.callback-url`,
    options: { sameSite: 'lax', path: '/', secure: true },
  },
},
```

Use `__Host-` prefix specifically because it is browser-enforced: a misconfigured proxy injecting Domain= will cause the cookie to be rejected loudly rather than silently leaking. Add a Vitest test that asserts `Set-Cookie` headers from `/api/auth/callback/google` contain neither `Domain=` nor `domain=`.

**Warning signs:**
- DevTools → Application → Cookies → `portal.triarch.dev` shows a session cookie with Domain `.triarch.dev` (red flag — should be exactly `portal.triarch.dev`).
- Logging into admin and visiting portal in the same tab "just works" without a fresh OAuth handshake.
- `document.cookie` on portal shows admin's session value, or vice versa.
- Production logs show `MissingCSRF` errors clustered around the OAuth callback (host-only rejection).

**Phase to address:**
**Phase 2 (Auth scaffolding)** — write the cookies block before the first OAuth round-trip. Add the dev-tools assertion test in the same phase. Verification step: open both apps in two browser tabs of the same browser profile, log in to portal, confirm `getServerSession` on admin returns null without re-authentication.

---

### Pitfall 2: OAuth `sub` mismatch creates ghost users when same Google account signs into both apps

**What goes wrong:**
Both apps register with the same Google OAuth client, OR with two separate clients pointed at the same Google Workspace identity. Either way, the `sub` (subject) claim returned in the ID token is **different per OAuth client**. If portal's signIn callback writes a user row keyed by `sub`, and admin's writes its own row keyed by `sub` (different value because different client_id), the same human ends up as two distinct database identities. Worse: if the canonical `project_members.user_email` lookup is replaced anywhere with `user_id`/`sub`, portal won't see admin's grants.

The current admin `signIn` callback (lines 21–45 of `src/lib/auth.ts`) keys exclusively on `email` via `getCurrentUserContext({ user: { email } })` — that's correct and must be preserved. The risk is regression: a future PR adds "let's make this faster, look up by sub" and silently breaks portal.

**Why it happens:**
`sub` is "the right" identifier per OIDC spec — it's stable, opaque, and per-tenant. Devs reach for it because Auth0/Clerk/most identity tutorials tell you to. They forget that `sub` is per-client, not per-Google-account: same person + different OAuth client = different sub.

**How to avoid:**
1. **Single OAuth client across both apps.** Register one Google OAuth client (e.g. "Triarch Apps") with TWO authorized redirect URIs: `https://admin.triarch.dev/api/auth/callback/google` and `https://portal.triarch.dev/api/auth/callback/google`. Same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets in both apps' Firebase backends.
2. **Email is the only cross-app identifier.** Document a hard rule in both apps' `src/lib/auth.ts`: "User identity for authorization decisions is `session.user.email` (lowercased). Never persist or query by `token.sub` for permission checks." Add an ESLint rule or grep-based pre-commit check that fails on `\.sub\b` references in `auth.ts` / `auth-context.ts`.
3. **No separate `users` table.** `project_members.user_email` is the source of truth. Portal does NOT introduce a parallel users table; it consumes membership through the same query path.
4. **`signIn` callback parity.** Portal's `signIn` mirrors admin's with one change: portal allows `ctx.memberships.length > 0` but rejects `isStaff: true` users (sends them a "Switch to admin.triarch.dev" page rather than full access). Test asserts a staff-only user (no project membership) cannot complete portal sign-in.

**Warning signs:**
- Two rows in any user-tracking table for the same email.
- Customer reports "I approved a release on portal, but admin doesn't show me as the approver."
- New Google OAuth client registered without updating both redirect URIs.
- `release_approvals.approver_email` and `release_approvals.actor_source='web'` show emails that don't match `project_members.user_email`.

**Phase to address:**
**Phase 2 (Auth scaffolding)** — single Google OAuth client, dual redirect URIs, identical `signIn` callback shape (with the staff-bypass branch), grep-test for `.sub` usage. Verification: provision a test customer email, sign into both apps with same Google account, assert `release_approvals` rows from both apps show the same `approver_email` value byte-for-byte.

---

### Pitfall 3: Schema package version drift between admin and portal

**What goes wrong:**
Both apps consume Drizzle schema via `@myalterlego/triarch-shared` (or whatever the package becomes). Admin pins `^0.4.0`, portal pins `^0.3.0`. Admin runs migration adding `release_approvals.actor_source` (already shipped Phase 9, v2.5.0). Portal still has the 0.3.0 schema where that column doesn't exist. Two failure modes:

1. **Read failure:** portal does `select().from(releaseApprovals)` — Drizzle generates SQL with the columns it knows about. CockroachDB returns the row INCLUDING `actor_source`. Drizzle ignores extras. Works. But if portal does `releaseApprovals.$inferSelect`, the type doesn't include the new column, so portal can't reason about web vs slack actor source.
2. **Write failure:** portal inserts into `release_approvals` without `actor_source`, the column has a NOT NULL constraint with no default, INSERT fails with constraint violation. Customer can't approve a release.
3. **Worse — silent data loss:** portal's older schema has a column admin's newer schema renamed/dropped. Portal writes go to a column that no longer exists → INSERT errors, OR (if naming collision) writes go to the wrong column.

**Why it happens:**
- npm `^0.x.x` semver allows minor bumps but the schema package isn't following semver — every schema change is potentially breaking even if tagged as patch.
- `npm install` in two repos, two weeks apart, gets two versions.
- Both apps deploy independently; CI passes in each because each builds against its own pinned version.

**How to avoid:**
1. **Migration ownership protocol:** **admin owns migrations.** `drizzle-kit push` runs from admin's CI/CD only, against the shared `triarch_dev` database (and the per-cluster dev/prod overlay). Portal pins `@myalterlego/triarch-shared` but never runs `db:push`.
2. **CI gate: lockstep build.** Add a workflow job in `shared-workflows` (already the v4 reusable pattern) called `verify-schema-pin` that:
   - Reads `@myalterlego/triarch-shared` version from each app's `package.json`.
   - Fetches the latest published version from npm.pkg.github.com.
   - Fails CI if either app's pin is more than 1 minor version behind latest.
3. **Schema package versioning rule:** any column ADD with a NOT NULL + no-default → MAJOR bump. Column drop → MAJOR. Column add nullable → MINOR. Only index/constraint tweaks → PATCH. Document in the schema package's README.
4. **Portal does not write columns it doesn't know about.** If a customer-side action requires writing a new column, the column must be added to the schema package, both apps bump pin, then the feature ships.
5. **Admin tags schema bumps with a CI annotation:** when admin's `package.json` bumps `@myalterlego/triarch-shared`, post a Slack message to `#release-approvals` saying "portal pin update required: 0.3.0 → 0.4.0".

**Warning signs:**
- Production error logs: `column "actor_source" does not exist` or `null value in column "actor_source" violates not-null constraint`.
- Diff between `admin/package-lock.json` and `portal/package-lock.json` shows divergent `@myalterlego/triarch-shared` versions.
- A PR to admin adds a schema change without a corresponding PR to portal bumping the pin.

**Phase to address:**
**Phase 1 (Repo scaffold + shared schema extraction)** — establish the pin-and-CI-gate rule before any feature code lands. Verification: deliberately set portal's pin to a stale version, push, confirm CI fails with a clear "pin out of date" message.

---

### Pitfall 4: Migration ownership confusion — concurrent `drizzle-kit push` from two repos

**What goes wrong:**
Both admin and portal repos have `db:push` scripts in `package.json` (because portal was scaffolded by copying admin). Two devs, two terminals, run `npm run db:push` against the same `triarch_dev` database within a few seconds of each other. Drizzle Kit has no cross-repo locking; the second push sees a schema in flux from the first and either (a) generates a no-op, (b) generates a destructive ALTER that drops a column the first push just added, or (c) hits a CockroachDB schema lease conflict and fails halfway, leaving the database in an indeterminate state.

Even without contention, the SECOND repo to push doesn't know what the FIRST already pushed — Drizzle Kit reads the live schema and diffs against the local TypeScript schema. If portal's local schema lags admin's, portal's push will REVERT admin's recent additions.

**Why it happens:**
- Drizzle Kit has no migration history table by default in `push` mode (vs. `migrate` mode which uses `__drizzle_migrations`).
- Convention from single-app Next.js + Drizzle tutorials is "just run db:push" — fine for one app, catastrophic for two.
- New devs onboarding to portal copy the admin runbook and run `db:push` because that's what the docs say.

**How to avoid:**
1. **Strip `db:push` from portal's `package.json` scripts.** Portal's package.json should have NO database migration commands. Replace with `db:check` (drizzle-kit check, read-only) for verification.
2. **Migration ownership doc:** add `docs/schema-ownership.md` to admin AND to the shared schema package. One-pager: "Admin owns schema migrations. Portal consumes. Schema changes flow: PR to schema package → publish → admin bumps pin → admin's CI runs `drizzle-kit push` against dev cluster → admin verifies → portal bumps pin → portal deploys."
3. **CI runtime check on portal:** at portal app boot, run a one-time `assertSchemaCompatibility()` that selects a sentinel from a known table; if column expectations don't match, fail loudly to logs (not a crash — a noisy warning that triggers Slack alert).
4. **Reuse the v2.0 Phase 7.5 pattern:** the `db-migrate.yml` reusable workflow shipped in shared-workflows@v4 reads env-specific `DATABASE_URL_DEV` / `DATABASE_URL` secrets and runs `drizzle-kit push`. Wire it ONLY into admin's `ci-cd.yml`, never into portal's.
5. **Cluster-side guardrail (defense in depth):** create a CockroachDB role for portal's runtime SA that has `INSERT, SELECT, UPDATE, DELETE` but NOT `CREATE, ALTER, DROP`. Portal's `DATABASE_URL` connects as that role. Admin's connects as the schema-owner role. A rogue `db:push` from portal would fail with permission denied.

**Warning signs:**
- Admin CI deploys, then portal CI deploys 5 min later, and admin's schema additions vanish.
- `pg_class` shows table modification timestamps changing in batches that don't correlate with admin's deploys.
- CockroachDB `crdb_internal.cluster_queries` shows `ALTER TABLE` queries from portal's connection.
- Two `__drizzle_migrations` rows with overlapping timestamps from different `application_name`s.

**Phase to address:**
**Phase 1 (Repo scaffold)** — strip `db:push` from portal scaffold, document ownership. **Phase 3 (Database connectivity)** — provision the read-write-only DB role for portal, test that ALTER fails. Verification: from portal repo, attempt `npx drizzle-kit push`, confirm permission denied error.

---

### Pitfall 5: Hostname-aware route guards left dangling in admin codebase

**What goes wrong:**
v2.1 introduced hostname-aware logic in admin (per Phase 7.5 hostname routing). That code looks like:

```ts
if (host === 'admin.triarch.dev') return notFound(); // staff-only, customer should be on portal
if (host === 'portal.triarch.dev') return ...;       // never executed in admin codebase post-fork
```

After portal ships, the second branch is dead code in admin. Three failure modes:

1. **Misconfigured DNS reversal:** GoDaddy A/CNAME for `portal.triarch.dev` accidentally points at admin's Firebase backend. Admin's middleware sees `host === 'portal.triarch.dev'`, falls through the dead branch (or worse, hits a default `redirect('/login')`), serves admin's login page on portal's URL. Customers see staff-branded login, attempt to sign in, hit the staff `signIn` callback path, fail because they're not staff, get a confusing error.
2. **Worse — branch IS active:** the dead branch was supposed to redirect customers to portal, but during the v2.1 → v2.2 transition someone wrote `if (host === 'portal.triarch.dev') return <CustomerReleasesPage />` so portal traffic that lands on admin (DNS misconfig) STILL serves the customer page from admin's codebase, defeating the entire fork.
3. **Hostname-conditional CSP/CORS headers:** middleware that sets headers based on host stays around and emits portal-targeted CSP rules from admin, blocking legitimate admin-side script loads.

**Why it happens:**
Phase 7.5 hostname routing was a temporary bridge to let one codebase serve two surfaces. v2.2 makes that bridge obsolete but the code that implemented it is now widely scattered across `middleware.ts`, layouts, page components, and route handlers. Removing it is a long, risky cleanup that gets deferred to "after the cutover" and then lives forever.

**How to avoid:**
1. **Inventory phase BEFORE writing portal code.** Phase 1.5 of v2.2 should grep admin for every `host ===`, `headers().get('host')`, `headers.host`, and `nextUrl.host` reference. Catalog each location with its current behavior.
2. **One-line invariant per admin route after fork:** `if (host !== 'admin.triarch.dev' && process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });` — fail closed if traffic arrives on the wrong host. Apply at middleware level.
3. **Cleanup PR scheduled in the cutover phase:** delete every `if (host === 'portal...')` branch in admin once portal is canonically serving customers. Tie to the 301-redirect window (see Pitfall 7).
4. **Same on portal:** middleware fails closed for any host !== `portal.triarch.dev` (and `localhost:3002` in dev).
5. **Tests:** Vitest test that mocks `headers()` returning each off-target host and asserts 404. Run in both repos.

**Warning signs:**
- Customer reports admin's UI loaded at portal URL, or vice versa.
- Admin's deploy logs show requests with `host: portal.triarch.dev` arriving and being served (not 404'd).
- `grep -rn "host === 'portal" src/` returns hits in admin code more than 30 days post-cutover.

**Phase to address:**
**Phase 1.5 (Hostname guard inventory + admin fail-closed)** — must precede Phase 2 portal scaffolding. **Phase 8 (Cutover + cleanup)** — delete dead branches. Verification: hit admin.triarch.dev with `Host: portal.triarch.dev` header via curl, confirm 404. Hit portal.triarch.dev with `Host: admin.triarch.dev`, confirm 404.

---

### Pitfall 6: CI deploys portal code into admin's Firebase project

**What goes wrong:**
`shared-workflows/deploy-firebase.yml@v4` takes `firebase_project_id` as an input. Portal's `ci-cd.yml` is scaffolded by copying admin's. Someone forgets to change the project ID. Portal builds, the Firebase App Hosting backend in admin's project (`angular-concord-489522-c4`) gets a new rollout — pointing at portal code. Admin.triarch.dev now serves portal's customer release page. Catastrophic: customers see staff-only UI, staff lose access, both apps' DBs are written to from the wrong codebase, and rollback requires re-running admin's last good build.

Even worse if portal's apphosting.yaml secrets DON'T include `SLACK_BOT_TOKEN` — admin's runtime suddenly fails with "missing SLACK_BOT_TOKEN" on every Slack-touching code path.

**Why it happens:**
- Copy-paste from admin's `ci-cd.yml`. The `firebase_project_id` input is one line in a 50-line file; easy to miss in review.
- No CI assertion validates that the deploying repo's GitHub `repository.name` matches the target Firebase project's expected app.
- Firebase secrets are scoped to the GCP project, not the GitHub repo — a CI workflow with the right SA key can deploy into any project the SA has access to.

**How to avoid:**
1. **Add `verify-deploy-target` job at the start of `deploy-firebase.yml`.** The reusable workflow takes a `repo_name` input AND a `firebase_project_id` input. Internally, it consults a small lookup table (committed in shared-workflows):
   ```yaml
   triarchsecurity-admin: angular-concord-489522-c4
   triarchsecurity-portal: triarch-portal-xxxxxx
   ```
   If the caller's `github.repository` (split on `/`) doesn't match the expected mapping, fail with a loud error.
2. **Per-repo deploy SA keys.** Don't share one Firebase SA across all repos. Each repo's GitHub Actions has its own SA, scoped to its specific Firebase project. A misconfigured `firebase_project_id` would fail with permission denied at deploy time, not silently succeed.
3. **Branch protection on portal AND admin:** require PR review before merge to main; require CI to pass; require status check `verify-deploy-target` to pass.
4. **`apphosting.yaml` content sanity check:** parse the file pre-deploy; if the `NEXTAUTH_URL` value's host doesn't match the target Firebase backend's serving domain, fail.

**Warning signs:**
- A successful portal CI run posts to admin's Firebase deployment Slack channel.
- Admin and portal's Firebase rollout history both show the same git SHA.
- `firebase apphosting:backends:list` for admin's project shows a backend whose latest rollout's source repo is portal.

**Phase to address:**
**Phase 7 (CI/CD wiring)** — the `verify-deploy-target` job is a hard prerequisite. Cannot be deferred. Verification: deliberately set portal's `firebase_project_id` to admin's project, push, confirm CI fails with the lookup-mismatch error.

---

### Pitfall 7: Customer bookmarks and email links rot after cutover

**What goes wrong:**
For 18 months, customers have received Slack notifications, OttoBot email, and GitHub release notes that link to `https://admin.triarch.dev/projects/<slug>/releases` and `https://admin.triarch.dev/projects/<slug>/bug-reports/<id>`. v2.2 ships, the URL canonical for customers becomes `portal.triarch.dev/projects/<slug>/...`. Failure modes:

1. **Hard 404:** admin.triarch.dev no longer serves `/projects/[slug]/*` for non-staff. Customer clicks email from 6 months ago, lands on 404. Loses trust.
2. **Continues to serve:** admin still has those routes, no redirect, no migration — defeats the entire fork. Customers never learn the new URL. Portal traffic stays at 0%. Two months later, exec asks "why did we build portal?"
3. **Redirect loop:** admin redirects `/projects/[slug]/*` → portal. Portal's auth forces login → success → callback URL is portal's, but the original Slack-message URL is admin's, browser history shows admin redirecting to portal which redirects back to admin's login because... etc.
4. **Slack `release-approvals` channel messages have admin URLs forever** in chat history. Even with redirects, customers see ugly admin-branded URLs in Slack.

**Why it happens:**
URL constants are scattered across the codebase: `src/lib/slack-builders.ts`, `src/lib/email-templates.ts` (if exists), `notifyReleaseApproved`, GitHub release notes generation, OttoBot Block Kit builders, customer-side email digests. No central `getCustomerProjectUrl(slug)` helper. Each occurrence was written when there was only one host.

**How to avoid:**
1. **Centralize URL construction NOW.** Add `src/lib/urls.ts` to admin (and re-export from shared package) with `getCustomerReleasesUrl(slug)`, `getCustomerBugUrl(slug, id)`, etc. Each reads from `process.env.PORTAL_BASE_URL` (defaults to `https://portal.triarch.dev`). Refactor all 14+ call sites.
2. **301 with grace period from admin → portal.** For the first 90 days post-cutover, admin's `/projects/[slug]/*` route serves a 301 to `portal.triarch.dev/projects/[slug]/...`. Preserves query string. Includes `Cache-Control: max-age=86400` so browsers and Slack's URL preview cache pick up the new location.
3. **Email blast on cutover day:** automated email to all `project_members` with `role='admin'`: "Your release page has moved to portal.triarch.dev. Update your bookmarks. Old URLs will redirect for 90 days."
4. **Slack message update sweep:** OttoBot has a one-time admin script that edits the last 30 days of `release-approvals` channel messages to update the URL. NOT a backfill of all history (too noisy) — just recent-and-actionable.
5. **Kill switch:** `ADMIN_CUSTOMER_ROUTES_ENABLED` env var. Set to `true` during the redirect window (admin still serves the routes, but with 301). At T+90, set to `false`, admin returns 404 for any customer route. At T+180, delete the routes entirely.
6. **Track redirect hits.** Admin's middleware counts 301 emissions to `portal.triarch.dev` and emits to a `redirect_hits` table or a Slack stat post. When weekly count drops below threshold (e.g. 5/week), it's safe to delete the routes.

**Warning signs:**
- Web analytics show admin's `/projects/[slug]/*` traffic stays high 60 days after cutover (customers haven't updated bookmarks).
- Slack message URLs in `#release-approvals` from after cutover still show admin.triarch.dev.
- New email notification PR from a contributor uses `admin.triarch.dev` literal — nobody catches it in review.
- 404 monitoring shows spike at admin's `/projects/*` post-cutover.

**Phase to address:**
**Phase 4 (URL centralization)** — refactor admin to use `src/lib/urls.ts` BEFORE portal ships. **Phase 8 (Cutover)** — flip the 301, fire the email blast. **Phase 9 (Sunset)** — delete the redirect routes after 90 days. Verification: deploy admin with new URL helper, grep `https://admin.triarch.dev/projects` in `src/` — should return zero hits except in the redirect handler itself.

---

### Pitfall 8: Shared NextAuth secret rotation invalidates wrong app's sessions

**What goes wrong:**
`NEXTAUTH_SECRET` signs JWTs. Admin and portal must NOT share this secret — if they did, a compromised admin token could be replayed at portal (different user populations, different authorization rules, but JWT verification passes). Two failure modes during rotation:

1. **Shared secret + uncoordinated rotation:** both apps read from the same Firebase secret `NEXTAUTH_SECRET`. Mike rotates it for security hygiene. Admin's running pods pick up the new value at next instance start (Firebase App Hosting cycles based on min/maxInstances). Portal's running pods are still using the old value. For a 30-second window, JWTs signed by portal can't be verified by admin (or vice versa). All in-flight sessions log out. Customer in middle of approving a release loses their session, has to re-OAuth, may fall out of the approval window.
2. **Separate secrets but secret-name collision in apphosting.yaml:** portal's `apphosting.yaml` declares `secret: NEXTAUTH_SECRET` (same as admin's). Firebase secrets are scoped per Firebase project, BUT if portal's Firebase project was provisioned by copying admin's secret-set commands, the secret name is identical and the underlying binary value happens to match. Devs THINK they're separate; they're not.
3. **Worse — secret rotated only on one app:** admin's `NEXTAUTH_SECRET` is rotated, portal's stays the same. If they were ever shared, portal's old JWTs are now unverifiable on admin (correct), BUT admin's new JWTs are also unverifiable on portal (because portal still has old secret). Cross-app session leakage that previously "worked accidentally" stops working visibly, masking the real issue.

**Why it happens:**
- Firebase App Hosting secrets are project-scoped, but the `apphosting.yaml` `secret: KEY` syntax doesn't show provenance — looks identical whether the secret is unique or shared.
- Devs treat `NEXTAUTH_SECRET` as a single global thing because tutorials show it as "your NextAuth secret."
- No automated rotation tooling; rotation is manual, and "rotate both" is easy to forget on the second one.

**How to avoid:**
1. **Separate secrets per app, naming convention enforces it.** Admin uses `ADMIN_NEXTAUTH_SECRET`, portal uses `PORTAL_NEXTAUTH_SECRET`. The variable name in code stays `NEXTAUTH_SECRET` (NextAuth's contract) but the apphosting.yaml maps it explicitly:
   ```yaml
   - variable: NEXTAUTH_SECRET
     secret: ADMIN_NEXTAUTH_SECRET   # admin
   ```
   ```yaml
   - variable: NEXTAUTH_SECRET
     secret: PORTAL_NEXTAUTH_SECRET  # portal
   ```
2. **Different Firebase projects.** Portal's Firebase secrets live in a different GCP project from admin's. Even if someone runs `firebase apphosting:secrets:set NEXTAUTH_SECRET` from portal's repo, it can't accidentally write to admin's project.
3. **Rotation runbook:** `docs/secret-rotation.md` lists every secret with its scope (admin-only / portal-only / shared). For app-scoped secrets, rotation procedure is single-app. For shared secrets (DATABASE_URL, GOOGLE_CLIENT_SECRET), procedure includes coordinated rollout with a 5-minute window.
4. **Boot-time assertion:** both apps run `assertEnv()` (per Pitfall 14) which fails fast if NEXTAUTH_SECRET is unset OR if it matches a known-compromised value (e.g. a sentinel `do-not-use-rotated-2026-05`). Lets us "soft-rotate" by adding sentinel values that fail.

**Warning signs:**
- `apphosting.yaml` in admin and portal have identical `secret: KEY` mappings for NEXTAUTH_SECRET.
- Mass logout event for portal users immediately after admin deploys.
- JWT signature verification errors in portal logs after admin deploys (or vice versa).
- Both Firebase backends list the same secret name in `firebase apphosting:secrets:get NEXTAUTH_SECRET` with the same MD5 hash (rare but possible if seeded identically).

**Phase to address:**
**Phase 2 (Auth scaffolding)** — separate secrets named correctly from day one. **Phase 7 (CI/CD)** — rotation runbook published. Verification: rotate `PORTAL_NEXTAUTH_SECRET` only, confirm admin sessions are unaffected (no spike in admin re-auths in logs).

---

### Pitfall 9: Slack notification routing ambiguity — who owns SLACK_BOT_TOKEN

**What goes wrong:**
Customer clicks "Approve" in portal's release page. Portal's API route runs, writes `release_approvals` row. Now it needs to:
- Notify staff (`#release-approvals` channel) that the customer approved.
- Trigger the GitHub App to dispatch `promote-branch.yml`.

Three architectural choices, each with a different failure mode:

1. **Portal owns Slack credentials** (recommended): portal has `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_PAYLOAD_SECRET`, `SLACK_RELEASE_APPROVAL_CHANNEL` env vars in its apphosting.yaml. Portal posts to `#release-approvals` directly. Risk: now Slack credentials exist in two places. Rotation requires both. If `chat:write.public` scope was added to admin's bot for a Phase 7 reason, portal's bot needs the same scope.
2. **Admin owns Slack, portal proxies through admin API:** portal calls `POST admin.triarch.dev/api/notifications/release-approved`. Cross-origin call, requires shared API token, latency adds 200-500ms to the customer's "Approve" click. If admin is mid-deploy, portal's request fails. If portal can't reach admin (DNS, network), the customer's approval succeeds but no Slack notification fires — customer thinks the world saw their approval, staff have no idea.
3. **Slack credentials shared via secret:** both apps read `SLACK_BOT_TOKEN` from the same vault entry. Same problem as Pitfall 8 (rotation, scoping) plus a new one: any compromise of portal's runtime exposes the bot token that has full admin Slack scope.

**Why it happens:**
The current admin codebase has Slack tightly coupled to the customer-facing approval path: `notifyReleaseApproved` lives in admin, gets called from `/projects/[slug]/releases` server actions, posts to `#release-approvals` with a "Promote" button that dispatches GitHub. Porting just the customer page is straightforward; porting the Slack post requires deciding ownership.

**How to avoid:**
1. **Portal owns its own Slack credentials. Recommended pattern.** Portal's apphosting.yaml includes the same Slack env vars as admin, mapped to its OWN secret instances (`PORTAL_SLACK_BOT_TOKEN`, etc.). Portal app is a separate Slack App registration OR (more likely) the same Slack App with the same bot token but tracked as a separate trust boundary.
2. **GitHub dispatch stays in admin.** The customer approval triggers Slack notification (from portal) and a GitHub dispatch (from admin via portal-to-admin webhook). Why split? GitHub App private key is more sensitive than Slack bot token; we don't want it in two backends. Portal's API route, after writing `release_approvals`, posts to admin's `/api/internal/dispatch-promotion` with a shared HMAC signature. Admin verifies HMAC, calls `promoteAndAudit`, returns 200. Portal returns 201 to customer. Slack notification fires from PORTAL (fast, no cross-origin) on the same code path.
3. **Audit trail in `slack_action_audit` (admin-side):** portal posts to Slack directly, then asynchronously posts to admin's `/api/internal/audit-slack-event` to record the dispatch. Best-effort try/catch — Slack post is the source of truth, audit is observability.
4. **Secret separation:** `PORTAL_SLACK_BOT_TOKEN` is a distinct Firebase secret from admin's `SLACK_BOT_TOKEN`. They CAN hold the same underlying token (single Slack App, single bot user), but rotation goes through both names. If we ever fork the Slack App into a separate "Triarch Portal Bot," the secret name change is just an apphosting.yaml edit.
5. **Slack scope inheritance:** every scope admin's bot has, portal's bot needs. Document in `docs/secret-rotation.md`. When admin gains `chat:write.public` (already done Phase 7), portal must too.

**Warning signs:**
- Portal's release approval succeeds, but `#release-approvals` shows no message, and admin's `slack_action_audit` table has no row for the event.
- Latency on portal's "Approve" click >2s (proxy-to-admin pattern).
- Two Slack messages posted for the same approval (portal AND admin both fired).
- Slack webhook signature verification failures clustered around portal-originated events.

**Phase to address:**
**Phase 5 (Approval flow port)** — establish the seam. **Phase 6 (Slack credential setup)** — provision portal's Slack secrets, add to apphosting.yaml, smoke-test post. Verification: customer approval in portal staging produces exactly one Slack message in `#release-approvals-test` AND one row in admin's `slack_action_audit`.

---

### Pitfall 10: Cross-origin embedding silently breaks (or silently succeeds when it shouldn't)

**What goes wrong:**
Some asset, iframe, image, or script gets loaded across the admin/portal boundary. Examples:

1. **Email digest contains `<img src="https://admin.triarch.dev/api/preview/release-card/<id>">`:** customer's email client loads it, browser sends request, admin returns image with `Cache-Control: private` and a session-bound URL. Other customers who view the same email get a cached image with the wrong project's data.
2. **Portal's `/projects/[slug]/releases` iframes admin's `/admin/modules/pipeline/<slug>` for a "staff view this":** customer (with no staff session) sees a frame that posts to admin's API; admin's API returns 401 or — worse — 200 with an empty shell (because of how `getServerSession` returns null gracefully); customer sees a broken frame, loses confidence.
3. **Marketing site at triarch.dev embeds portal's release card:** CORS blocks unless portal explicitly allows triarch.dev origin. Devs add `Access-Control-Allow-Origin: *` to "fix" it, opening every API to any origin.
4. **Reverse — portal's CSP blocks legitimate admin-side script:** if any shared component (Phase 13's BranchPreviewClient or similar) loads a CDN script, and portal's CSP `script-src` is tighter than admin's, the same component breaks on portal silently.

**Why it happens:**
- Once you have two apps, "let me just embed this" feels natural. It isn't.
- Default Next.js CORS is permissive for same-origin, but cross-origin requires explicit headers. Easy to forget which routes need them.
- Browser blocks third-party cookies in iframes by default (Chrome's "Total Cookie Protection" / Safari's ITP). Even if you "fix" CORS, sessions don't propagate.

**How to avoid:**
1. **Strict same-origin policy.** Both apps set `Content-Security-Policy: frame-ancestors 'none'` AND `X-Frame-Options: DENY` in middleware. Neither app can iframe the other (or itself, intentionally).
2. **No image embedding across apps.** Email digests link, don't embed: `<a href="https://portal.triarch.dev/projects/<slug>/releases">View Release</a>` — never `<img src="https://portal.../...">`.
3. **CORS deny-list by default.** API routes in portal: no CORS headers at all (same-origin only). API routes in admin that legitimately need cross-origin (e.g. webhook receivers): allowlist specific origins, never `*`.
4. **CSP report-only mode for first 30 days:** add `Content-Security-Policy-Report-Only: ...` with a reporting endpoint, see what would have been blocked before flipping to enforce mode.
5. **Shared UI components: build-time only.** `@myalterlego/shared-ui` is a TypeScript/Tailwind component library, NOT a runtime federation. Portal doesn't `<script src="admin.triarch.dev/components/Button.js">`. Each app bundles its own copy.

**Warning signs:**
- Network tab shows requests from portal to admin (or vice versa) for static assets.
- CSP violation reports in production logs.
- Iframe-related code in either app's component tree.
- Email digest source includes URLs to the OTHER app's domain in `src=` or `href=` attributes that should be the same-app domain.

**Phase to address:**
**Phase 2 (Auth scaffolding)** — set CSP and frame-ancestors in middleware on day one. **Phase 4 (URL centralization)** — auditing every URL emission also catches embed cases. Verification: from portal page, attempt to fetch `https://admin.triarch.dev/api/...` via browser console — confirm CORS error.

---

### Pitfall 11: Email link rot — every URL emission point needs auditing

**What goes wrong:**
This is the operational counterpart to Pitfall 7. The codebase has many URL emission points:

- `notifyReleaseApproved` Slack message text (admin/src/lib/slack-*)
- OttoBot Block Kit `actions` block URLs
- Email templates (if/when added)
- GitHub release notes (auto-generated)
- Marketing site copy (separate repo: `triarchsecurity-www`)
- Customer-side bug submission confirmation messages
- API response `Location` headers
- 301/302 redirects
- README.md / docs that reference live URLs
- Sentry/LogRocket/whatever observability tool's "view in app" links

Even with `src/lib/urls.ts` centralization (Pitfall 7's fix), there will be missed spots. A customer email from a corner-case path links to `admin.triarch.dev`. That email is sent ONCE to that customer; they click, hit 404 (or worse, a redirect that loops because of pitfall 7's #3 scenario), and lose trust.

**Why it happens:**
URL strings are often built ad-hoc in template strings: `` `Visit https://admin.triarch.dev/projects/${slug}/...` ``. They don't all live in one place. Codebase grep can find literals, but template strings with variable interpolation that build the host dynamically (`` `https://${host}/...` ``) are missed by literal grep.

**How to avoid:**
1. **Inventory pass before writing portal code.** Phase 4's first task: grep for every occurrence of `admin.triarch.dev`, `triarchsecurity.com`, `https://`, and `://`. Catalog each in a CSV with: file path, line, context, target migration state.
2. **ESLint rule:** `no-restricted-syntax` rule that errors on string literals matching `https?://(admin|portal)\.triarch\.dev`. Force every URL through `src/lib/urls.ts`.
3. **Test for the helper:** unit test on `getCustomerReleasesUrl(slug)` that asserts it returns `https://portal.triarch.dev/projects/<slug>/releases` in production env, `http://localhost:3002/...` in dev env.
4. **External URLs (marketing site, GitHub release notes):** add to the inventory list, manually update during cutover. Marketing site is in `triarchsecurity-www`; that PR happens during Phase 8 cutover.
5. **Outbox pattern for emails (if applicable):** if portal sends emails, use a templated outbox where URLs are interpolated from a single helper. Audit the outbox templates as part of every URL change.

**Warning signs:**
- Slack message in `#release-approvals` shows `admin.triarch.dev/projects/...` URL post-cutover.
- Customer emails after cutover with admin URLs in them.
- README.md still says "Visit admin.triarch.dev/projects to see releases."
- 404 hit count on admin's `/projects/*` doesn't drop after T+90 (some channel is still emitting old URLs).

**Phase to address:**
**Phase 4 (URL centralization)** — exhaustive grep + ESLint rule + helper. **Phase 8 (Cutover)** — manual sweep of external surfaces (marketing, GitHub). Verification: after cutover, monitor admin's redirect-hits for 7 days, identify any unexpected source patterns (Slack channel? email?), trace back to emission point, fix.

---

### Pitfall 12: User-record creation race on first portal sign-in

**What goes wrong:**
Customer's first sign-in on portal triggers NextAuth's `signIn` callback. If the callback writes to a `users` table (or creates a `project_members` row), and admin has been writing to the same table for the same email separately, race conditions emerge:

1. **Two parallel sign-ins (portal first, admin second):** customer signs into portal at T+0ms, callback INSERTs `users` row. Customer immediately opens admin tab at T+50ms (cookie isolation per Pitfall 1, so admin sees no session, redirects to `/login`, OAuth round-trips). Admin's signIn callback also tries to INSERT same email — depending on schema, either UNIQUE violation, silent no-op, or duplicate row.
2. **Membership lookup race:** portal's signIn calls `getCurrentUserContext({ user: { email } })` (per admin's pattern). The function reads `project_members`. If a staff admin is concurrently adding the customer's email to `project_members` via admin's manage-members UI, portal might read a stale state and reject sign-in. Customer retries, succeeds. Confusing UX.
3. **OAuth refresh token clobbering:** both apps' JWT callbacks store the refresh token in their respective JWT. They don't share. But if a `users` table stored the refresh token (rare in this codebase, just illustrating), the second sign-in overwrites the first's token, invalidating its access.

**Why it happens:**
- Two apps both trying to be "the source of truth" for user records.
- NextAuth's signIn callback runs ONCE per OAuth round-trip but isn't idempotent unless the code is written that way.
- `project_members` membership grants happen outside the OAuth flow (admin staff add a customer via UI), creating temporal inconsistencies.

**How to avoid:**
1. **No separate `users` table.** Repeat the v1.14 decision: `project_members.user_email` is the source of truth. Neither admin nor portal creates a `users` row on sign-in. `signIn` callback only READS `project_members`; it doesn't INSERT anything.
2. **`signIn` is idempotent.** Both callbacks: read membership → return true/false. No writes. If a customer needs to be granted access, an admin staffer does it via admin's manage-members UI, BEFORE the customer attempts sign-in.
3. **Customer sign-up flow:** customer signs in for the first time, gets denied (no membership), receives a friendly "Your access is being provisioned. Contact your project admin." page. Admin staff is notified via Slack (`#new-user-requests` channel) with a one-click "Grant access" button.
4. **Test:** simulate concurrent sign-ins for the same email from both apps, assert both succeed without DB errors and without duplicate rows in any table.

**Warning signs:**
- New rows in any user-tracking table appearing in pairs (one from admin, one from portal).
- `project_members` rows with timestamps closer than 1 second from different sources.
- Customer reports "I had to sign in twice" or "the second tab said I'm not a member."

**Phase to address:**
**Phase 2 (Auth scaffolding)** — port admin's `signIn` callback verbatim, with the staff-redirect branch. Verify NO writes happen in either callback. Verification: instrument `signIn` with logging, complete a customer sign-in flow, grep logs for any INSERT/UPDATE statements during the callback — should be zero (only SELECT).

---

### Pitfall 13: Local dev workflow degrades — three terminals, four secrets, one broken loopback

**What goes wrong:**
Developer wants to test a customer-facing change. Needs:

1. Admin running on `http://localhost:3001` (for staff bypass / cross-link testing).
2. Portal running on `http://localhost:3002`.
3. CockroachDB local cluster OR connection to dev cluster (already provisioned per Phase 7.5).
4. NextAuth `NEXTAUTH_URL` env var pointing at `http://localhost:3001` for admin and `http://localhost:3002` for portal.
5. Google OAuth client with `http://localhost:3001/api/auth/callback/google` AND `http://localhost:3002/api/auth/callback/google` registered as redirect URIs.
6. A `.env.local` that doesn't accidentally leak production secrets (DATABASE_URL especially).

Failure modes:
- Dev runs only portal (not admin), tests cross-link to admin.triarch.dev (production!) — accidentally hits prod data.
- Dev's Google OAuth client doesn't have localhost redirect URIs registered — sign-in fails with `redirect_uri_mismatch`.
- Both apps configured to listen on port 3000 — conflict, second one fails to start.
- `NEXTAUTH_URL` left as `https://admin.triarch.dev` in dev — OAuth callback goes to production, dev's local code never sees it.
- `DATABASE_URL` for prod accidentally pasted into `.env.local` — local writes hit production CockroachDB.

**Why it happens:**
- One app is easy to dev locally; two apps requires explicit port management, parallel terminals, mirrored env files.
- `.env.local` files don't have a clear "dev vs prod" delineation; `DATABASE_URL` looks the same in both.
- New dev onboarding documentation is for the existing single-app world.

**How to avoid:**
1. **Document in `docs/local-dev.md`** explicit port assignments: admin=3001, portal=3002. Both apps' `package.json` `dev` scripts set the port via `next dev --port 3001` / `--port 3002`.
2. **Single `dev:all` orchestrator script in workspace root** that runs both with `concurrently` or similar. Output is color-coded by app name.
3. **Separate `.env.local.example`** in each repo with comments showing where each value comes from. Include a sentinel comment: `# DO NOT use production DATABASE_URL here. Use the dev cluster URL from 1Password.`
4. **Pre-flight check on `dev` script:** `assertEnv()` runs at app boot (per Pitfall 14), refuses to start if `NEXTAUTH_URL` host !== current process port.
5. **Google OAuth client setup:** the single client has all four redirect URIs registered:
   - `https://admin.triarch.dev/api/auth/callback/google`
   - `https://portal.triarch.dev/api/auth/callback/google`
   - `http://localhost:3001/api/auth/callback/google`
   - `http://localhost:3002/api/auth/callback/google`
6. **Loopback session smoke test:** after both apps are up locally, run `npm run smoke:dev` which curls both `/api/auth/session` endpoints and confirms both return null (not authenticated, but reachable).

**Warning signs:**
- New dev onboarding takes >2 hours.
- Slack messages: "How do I run portal locally?" — indicates docs gap.
- Local sign-in attempts hit `redirect_uri_mismatch` Google error pages.
- `git diff .env.local` accidentally shows production DATABASE_URL strings.

**Phase to address:**
**Phase 1 (Repo scaffold)** — local dev docs and `.env.local.example` part of initial scaffold. **Phase 2 (Auth)** — Google OAuth client redirect URIs added pre-Phase-2 PR merge. Verification: a fresh laptop (or VM) can clone both repos, follow `docs/local-dev.md`, and have both apps running and signed-in within 30 minutes.

---

### Pitfall 14: `apphosting.yaml` env var drift — runtime crash that only shows post-deploy

**What goes wrong:**
Admin's `apphosting.yaml` has 14 env vars (just counted: NEXTAUTH_URL, ADMIN_EMAIL, DEPLOY_WEBHOOK_URL, DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NODE_AUTH_TOKEN, DEPLOY_WEBHOOK_SECRET, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, SLACK_PAYLOAD_SECRET, SLACK_RELEASE_APPROVAL_CHANNEL, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID, FAH_PROMOTER_SA_KEY — actually 17). Portal needs SOME but not all:

**Portal needs:**
- `NEXTAUTH_URL` (different value: portal.triarch.dev)
- `DATABASE_URL` (shared cluster)
- `NEXTAUTH_SECRET` (PORTAL-scoped, per Pitfall 8)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (shared per Pitfall 2)
- `NODE_AUTH_TOKEN` (build-time, for npm package fetch — same as admin)
- `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` / `SLACK_PAYLOAD_SECRET` / `SLACK_RELEASE_APPROVAL_CHANNEL` (per Pitfall 9)

**Portal does NOT need:**
- `ADMIN_EMAIL` (no env-allowlist fallback in portal's signIn — fail closed)
- `DEPLOY_WEBHOOK_URL` / `DEPLOY_WEBHOOK_SECRET` (admin owns deploy webhooks)
- `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` (admin dispatches GitHub workflows)
- `FAH_PROMOTER_SA_KEY` (admin owns branch preview swap)

Failure modes:
1. **Missing required env:** portal scaffolded by copying admin's apphosting.yaml, dev forgets to set up `PORTAL_NEXTAUTH_SECRET` in Firebase secrets. Deploy succeeds (build doesn't reference it), runtime crashes on first request with `JWE_INVALID` because NEXTAUTH_SECRET is empty string.
2. **Vestigial unused env:** portal's apphosting.yaml has `GITHUB_APP_PRIVATE_KEY` declared but unused. Audit confusion later: "Why does portal have GitHub credentials?" Increases blast radius if portal is compromised.
3. **Build-time vs runtime confusion:** `NODE_AUTH_TOKEN` is admin-marked `availability: [BUILD]`. Portal copies that. But portal needs `NEXTAUTH_URL` at BUILD time too (Next.js uses it for some `getServerSideProps`-style code paths) — admin marks it `[BUILD, RUNTIME]`. Easy to miss the difference.
4. **`assertEnv` not in place:** the app starts without screaming about missing vars; the missing var only manifests when a code path that uses it executes (e.g. customer's first Slack notification fails 30 minutes after deploy when an approval happens).

**Why it happens:**
Copy-paste from admin. apphosting.yaml is treated as a list of "stuff this app needs," and the copying dev doesn't audit each line. No tooling validates that every declared env var is used, and that every used env var is declared.

**How to avoid:**
1. **`src/lib/env.ts` with `assertEnv()` function** in each app. Defines a Zod or Valibot schema of expected env vars (which are required, which are optional, which are runtime-only vs build-also). Called at app startup (in `instrumentation.ts` or first server-component render). Crashes loudly with a useful error message listing which vars are missing.
2. **Portal's `assertEnv` lists ONLY portal's required vars.** Drift detection: a CI step runs `tsc --noEmit` on the env schema and a separate `validate-apphosting.ts` script that:
   - Parses portal's `apphosting.yaml`.
   - Compares declared vars to `env.ts` schema.
   - Fails if any declared var is unused, or any used var is undeclared.
3. **Documented minimum env list:** `docs/portal-env.md` lists the 9 vars portal needs, each with its source (shared with admin / portal-only / build-only).
4. **Boot-time smoke test:** first API route hit emits a structured log line: `boot: env-check-passed` or similar. Sentry/LogRocket alerts on absence within 60 seconds of deploy.
5. **Use Phase 7.5 overlay pattern:** if dev and prod need different vars, use `apphosting.yaml` + `apphosting.prod.yaml` overlay (already established in admin per Phase 7.5).

**Warning signs:**
- Production runtime errors mentioning `undefined` for an env-derived value within 10 minutes of deploy.
- Mike runs `firebase apphosting:secrets:list` and sees secrets that aren't in the apphosting.yaml (or vice versa).
- Boot logs don't show `env-check-passed` line.
- Staff reports "the Approve button doesn't post to Slack" — likely portal's SLACK_BOT_TOKEN missing.

**Phase to address:**
**Phase 7 (CI/CD wiring)** — `assertEnv` + apphosting.yaml validation script. **Phase 1 (Scaffold)** — `docs/portal-env.md` initial draft. Verification: deliberately remove a required env from staging apphosting.yaml, deploy, confirm the app fails to boot with a specific "missing X env var" log line within 10 seconds of first request.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Copy admin's `apphosting.yaml` wholesale to portal, prune later | Faster Phase 1 scaffold | Vestigial env vars increase blast radius; rotation runbooks reference vars portal doesn't actually use | Never — pruning at the end of Phase 1 is non-negotiable |
| Share `NEXTAUTH_SECRET` across both apps "for now" | Single rotation operation | Cross-app JWT replay; coordinated mass-logout on rotation; harder to compromise just one | Never |
| Skip URL centralization, refactor later | Phase 4 ships in 2 days instead of 4 | Email link rot at cutover; manual sweep of every URL emission point at T-1 | Only if the Phase 8 cutover is ≥3 weeks away (gives buffer for late refactor) |
| Run `db:push` from portal "just this once" to test | One-off schema migration without admin coordination | Future devs do it again; eventually races; eventually data corruption | Never — provision portal's DB role without DDL grants instead |
| Iframe admin's pipeline view inside portal for a "staff view" feature | Reuse existing UI, no porting | CORS/cookies/CSP nightmares; defeats fork; introduces cross-origin coupling | Never — port the UI as a standalone portal route or leave staff users on admin |
| Use the same Slack App for both bots, share `SLACK_BOT_TOKEN` | One Slack App to manage | Compromise of either app exposes both; rotation is coupled | Acceptable for v0.1 if `PORTAL_SLACK_BOT_TOKEN` is a separate Firebase secret with the same value (allows future divergence) |
| Punt the staff-bypass UI (portal shows "you're staff, go to admin") | Faster portal Phase 2 | Staff who land on portal hit a 401 page with no guidance, file support tickets | Acceptable for v0.1 — implement before public cutover (Phase 8) |
| Skip the 301 redirect from admin's customer routes, do a hard 404 | No redirect-loop risk | Customer trust damage on cutover day; bookmarks all rot at once | Only if redirect-loop risk is verified resolved (test in staging) |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google OAuth (single client, two apps) | Register two separate OAuth clients (different `client_id`, different `sub` per user) | One OAuth client with both redirect URIs; user identity keyed on `email` everywhere |
| NextAuth v4 cookies | Set `cookies.sessionToken.options.domain = '.triarch.dev'` to "share" — leaks cross-app | Omit `domain` (host-only); use `__Host-` prefix in production |
| CockroachDB shared schema | Both apps run `drizzle-kit push` | Admin owns migrations; portal pins schema package; portal's DB role lacks DDL grants |
| Firebase App Hosting secrets | Same secret name in both projects' `apphosting.yaml` | Project-distinct secret names (`ADMIN_NEXTAUTH_SECRET`, `PORTAL_NEXTAUTH_SECRET`) |
| Slack bot (interactive buttons) | Portal posts to Slack via admin's API (proxy pattern) | Portal owns `PORTAL_SLACK_BOT_TOKEN`, posts directly; admin owns GitHub dispatch only |
| GitHub App (workflow dispatch) | Both apps hold `GITHUB_APP_PRIVATE_KEY` | Admin holds it; portal calls admin's `/api/internal/dispatch-promotion` with HMAC |
| Shared `@myalterlego/shared-ui` | Different versions pinned in two apps cause visual drift | Lockstep version bump (CI gate); `transpilePackages` in both `next.config.ts` |
| `@myalterlego/triarch-shared` (schema) | One app upgrades, other stays behind, schema drift | CI gate fails on >1 minor version lag; admin announces bumps to Slack |
| GoDaddy DNS (portal.triarch.dev) | Misconfigured A/CNAME points portal subdomain at admin's Firebase backend | Verify with `dig portal.triarch.dev`; admin middleware fails closed if `host !== admin.triarch.dev` |
| Firebase App Hosting custom domain | Set portal's `apphosting.yaml NEXTAUTH_URL` to admin's URL by mistake | Boot-time `assertEnv()` validates `NEXTAUTH_URL.host` matches expected serving domain |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Portal's "Approve" click proxies to admin's API for Slack post | Customer click → 800-1500ms latency vs <300ms direct | Portal owns Slack credentials, posts directly | Visible at first customer use; degrades trust |
| Per-request DB lookup in `signIn` callback (no cache) | OAuth latency 200-400ms even on cache hit | NextAuth signIn runs once per OAuth round-trip; cache `getCurrentUserContext` per email for 60s | Acceptable at low scale (<100 sign-ins/day); breaks at 1000+/day |
| Cross-app fetch for shared data (e.g. portal calls admin for project list) | N+1 latency, SPOF coupling | Both apps query DB directly; share read paths via shared schema package | Breaks at any scale — architectural problem, not performance |
| Two SWR polls (one in admin pipeline page, one in portal preview banner) for branch preview status | 5s interval × 2 apps = 24 requests/min/customer | Use `usePreviewStatus` shared hook; one poll per app per browser tab | Breaks at ~50 concurrent customers |
| Schema migration locks both apps' read traffic | Approval flow blocked during admin's `db:push` | Use online schema changes (CockroachDB defaults) — never `ALTER TABLE` with a default that requires backfill | Visible during any migration with >100k rows in target table |
| Slack notification fires synchronously in portal's API route | Portal's "Approve" returns 201 only after Slack 200 | Slack post is `void` fire-and-forget with `recordSlackAudit` async logging (matches Phase 7 OttoBot pattern) | Visible if Slack is degraded — customer waits for Slack timeout |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Portal's `signIn` callback retains the env-allowlist fallback (`@triarchsecurity.com`) | Staff who lack project membership accidentally get customer-side access | Portal's signIn has NO env-allowlist branch — fail closed if no `project_members` row exists |
| Same `NEXTAUTH_SECRET` across both apps | JWT minted by portal validates on admin (or vice versa); cross-app session replay | Distinct secrets per app (Pitfall 8) |
| Wildcard CORS on portal's API (`Access-Control-Allow-Origin: *`) | Any origin can submit a customer bug report on behalf of customer | Same-origin only by default; explicit origin allowlist for admin-side webhook receivers |
| GitHub App private key copied into portal's secrets | Portal compromise → workflow dispatch on any repo the App is installed on | Admin holds the key; portal calls admin via HMAC-signed internal API |
| `FAH_PROMOTER_SA_KEY` shared into portal | Portal compromise → branch swap on any FAH backend | Admin holds it (Pitfall 9 architecture) |
| Forget to scope portal's CockroachDB role to DML-only | DDL injection via portal compromise (drop tables) | DB role has SELECT/INSERT/UPDATE/DELETE only; CREATE/ALTER/DROP denied (Pitfall 4) |
| Customer's portal session JWT contains staff role hint | Customer manually flips role claim in JWT (rare with HMAC sig but possible if rotation is broken) | `signIn` callback does NOT add `isStaff` to JWT in portal — portal queries `project_members` per request for authz |
| Customer-submitted markdown rendered in admin's Slack notification | Slack mrkdwn injection (Pitfall 11 of v2.1, already mitigated in `src/lib/sanitize-commit.ts`) | Reuse `sanitize-commit.ts` for all customer-originated Slack content; same chokepoints |
| Portal's auth cookie set without `__Host-` prefix in production | Subdomain takeover or proxy injection sets a `Domain=` cookie that overrides | `__Host-` prefix mandatory in prod (Pitfall 1) |
| Portal's redirect URL from admin's 301 includes user-controlled data | Open redirect to attacker.com | 301 only to `https://portal.triarch.dev/projects/<slug>/<known-route>` — slug regex-validated, route enum-checked |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Customer hits old `admin.triarch.dev/projects/<slug>/releases` bookmark, gets 404 | Loss of trust, "is the system down?" | 301 with grace period (90 days), email blast with new URL |
| Staff member lands on portal.triarch.dev, gets 401 with no explanation | Staff thinks portal is broken; opens support ticket | Portal detects staff session, shows "You're a staff user. Switch to admin.triarch.dev →" CTA |
| Customer's email contains a mix of admin and portal URLs (during transition) | Confusion about which URL is canonical | Centralize URL emission (`src/lib/urls.ts`); audit before each email sends |
| Portal's branding looks identical to admin (both dark theme + golden accent) | Customer doesn't realize they're on a different surface; expects same staff features | Brand differentiation: portal uses customer-friendly typography, simplified nav, no `/admin/*` routes |
| Approve button shows latency from cross-app proxy | Customer clicks again, double-approves | Portal owns Slack credentials (Pitfall 9); single click resolves <300ms |
| First-time customer signs in, gets denied because no `project_members` row | "I was told I have access" frustration | Friendly "access pending" page + admin Slack notification + one-click grant for staff |
| Portal session expires at different cadence than admin's | Customer signed in for hours on admin, opens portal, has to OAuth again | Document session lifetime (and mismatch is fine — different surfaces) in onboarding email |
| Customer bookmark forgotten → URL rot at T+90 | Hard 404 after grace period | Soft sunset: at T+60, redirect page shows "This page has moved permanently to X. Please update your bookmark." with 5-second auto-redirect |
| Slack message in `#release-approvals` shows admin URLs post-cutover | Staff manually edit URLs; cognitive overhead | Admin's `notifyReleaseApproved` reads from `src/lib/urls.ts` post-Phase-4; new messages auto-correct |

---

## "Looks Done But Isn't" Checklist

- [ ] **Cookie isolation:** DevTools shows session cookies with Domain matching exact host (no leading dot, `__Host-` prefix in prod) — verify in BOTH apps in BOTH browsers.
- [ ] **OAuth redirect URIs:** all four URIs registered in Google OAuth client (admin prod, portal prod, admin localhost:3001, portal localhost:3002).
- [ ] **Schema package pin:** both apps' `package.json` show same `@myalterlego/triarch-shared` version after schema bump; CI gate enforces.
- [ ] **DB role scoping:** portal's `DATABASE_URL` connects as a role that fails on `ALTER TABLE` (test it).
- [ ] **Admin host-only middleware:** curl `admin.triarch.dev` with `Host: portal.triarch.dev` header returns 404 — verify in production.
- [ ] **CI deploy-target check:** deliberately misconfigure portal's `firebase_project_id` in a draft PR, confirm CI fails.
- [ ] **301 redirects:** admin's `/projects/[slug]/releases` returns 301 with `Location: https://portal.triarch.dev/...` — verify all customer routes.
- [ ] **NEXTAUTH_SECRET separation:** rotate `PORTAL_NEXTAUTH_SECRET`, confirm admin's session cookies still validate.
- [ ] **Slack credentials:** portal's apphosting.yaml has its own `SLACK_*` secrets; portal's API posts to Slack directly (no admin proxy).
- [ ] **CSP frame-ancestors:** browser denies iframe-of-portal from admin (and vice versa); verify in DevTools.
- [ ] **URL emission:** grep both repos for `admin.triarch.dev` literal — only allowed in admin's redirect handler.
- [ ] **`signIn` is read-only:** instrument with logging, no INSERT/UPDATE during a normal sign-in flow.
- [ ] **Local dev:** fresh clone → both apps running and signed in <30 minutes following `docs/local-dev.md`.
- [ ] **`assertEnv` boots:** boot logs show `env-check-passed`; remove a required env, deploy, confirm app fails to boot with specific error.
- [ ] **Marketing site URLs:** triarchsecurity-www repo grep shows zero `admin.triarch.dev/projects` references.
- [ ] **Slack message audit:** post-cutover, verify next 10 `#release-approvals` messages contain `portal.triarch.dev` URLs only.
- [ ] **Customer email:** at cutover, automated email to all `project_members` with `role='admin'` confirming new URL — sent from portal, signed by admin.
- [ ] **Hostname guards removed:** post-Phase-8, grep admin for `host === 'portal'` returns zero.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cookie domain leak (Pitfall 1) discovered post-deploy | MEDIUM | 1. Push hotfix removing `domain` from cookies block. 2. Mass-invalidate sessions by rotating `NEXTAUTH_SECRET`. 3. Email all users to re-sign-in. 4. Audit `release_approvals` for any rows from leaked sessions. |
| OAuth `sub` divergence (Pitfall 2) creates ghost users | LOW | If `users` table was created (against guidance), DELETE duplicates keyed by email. If `signIn` callback wrote anything, run a one-time deduplication SQL with email as canonical. |
| Schema drift causes write failure (Pitfall 3) | MEDIUM | 1. Rollback portal's deploy to last good version. 2. Verify schema package version. 3. Bump portal's pin to match admin's. 4. Re-deploy. 5. Replay any failed customer writes from logs (if recoverable). |
| Both apps run `db:push` concurrently (Pitfall 4) | HIGH | 1. Pause both apps' deploys. 2. Inspect schema state via `\d+` on each table. 3. Restore from CockroachDB time-travel query (cluster supports `AS OF SYSTEM TIME`). 4. Provision DML-only DB role for portal. |
| Hostname guard left dead, portal traffic served by admin (Pitfall 5) | HIGH | 1. Update DNS immediately to point portal.triarch.dev at correct backend. 2. Audit admin logs for portal-host requests served as 200 (not 404). 3. Identify any data writes from those requests; manually correct. 4. Push admin middleware fix to fail closed. |
| CI deployed portal code to admin's project (Pitfall 6) | HIGH | 1. Immediately re-deploy admin's last good rollout (`firebase apphosting:rollouts:list` + redeploy). 2. Verify customer data integrity (any portal-code writes to admin DB are correct because schema is shared, but `release_approvals.actor_source` may be wrong). 3. Add `verify-deploy-target` job to CI before next deploy. |
| Customer 404s on old admin URL (Pitfall 7) | LOW | 1. Verify 301 redirect handler is live in admin. 2. If grace period expired prematurely, re-enable for 30 days. 3. Send catch-up email to recently-active customers with new URL. |
| NEXTAUTH_SECRET rotation breaks one app (Pitfall 8) | MEDIUM | 1. Identify which app's secret is wrong. 2. Re-set the correct value via `firebase apphosting:secrets:set`. 3. Wait for instance recycle (or force redeploy). 4. Document in rotation runbook. |
| Slack credentials shared, one app compromised (Pitfall 9) | HIGH | 1. Revoke Slack bot token immediately. 2. Mint new token. 3. Update both apps' secrets. 4. Audit `slack_action_audit` for unauthorized posts. 5. If repeat risk, fork into two Slack Apps. |
| Cross-origin embedding works in dev, breaks in prod (Pitfall 10) | LOW | 1. Inspect CSP report-only logs. 2. Identify which embed is failing. 3. Refactor to link instead of embed. 4. Deploy fix. |
| Email link rot (Pitfall 11) discovered weeks post-cutover | LOW | 1. Identify offending emission point via redirect-hit logs. 2. Refactor to use `src/lib/urls.ts`. 3. Deploy. 4. Re-send corrected emails to customers if material. |
| Duplicate user records race (Pitfall 12) | LOW | 1. SQL dedup query keyed on email. 2. Audit `signIn` callbacks; verify no INSERTs. 3. Add concurrency test. |
| Local dev broken on new laptop (Pitfall 13) | LOW | 1. Update `docs/local-dev.md` with the missing step. 2. Onboard the next dev as a doc test. |
| Missing env var crashes prod (Pitfall 14) | MEDIUM | 1. Identify missing var from boot logs. 2. Set via `firebase apphosting:secrets:set`. 3. Force redeploy. 4. Add to `assertEnv` schema if not already. 5. Add to CI's `validate-apphosting.ts`. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Cookie domain leak | Phase 2 (Auth scaffold) | DevTools cookie inspection in both apps; Vitest test on Set-Cookie headers |
| 2. OAuth `sub` divergence | Phase 2 (Auth scaffold) | Single OAuth client with dual redirects; grep test on `.sub` in auth code |
| 3. Schema package version drift | Phase 1 (Repo scaffold + shared schema) | CI gate fails on stale pin; deliberate stale-pin test |
| 4. Migration ownership confusion | Phase 1 (Scaffold) + Phase 3 (DB connectivity) | Portal's `db:push` script removed; portal DB role lacks DDL; test ALTER fails |
| 5. Hostname guards dangling | Phase 1.5 (Inventory) + Phase 8 (Cleanup) | curl with off-target Host header returns 404; grep returns zero `host === 'portal'` in admin |
| 6. CI deploys to wrong project | Phase 7 (CI/CD wiring) | `verify-deploy-target` job in shared-workflows; deliberate misconfig test |
| 7. Bookmark/email URL rot | Phase 4 (URL centralization) + Phase 8 (Cutover) | grep admin for `admin.triarch.dev/projects` literal; redirect-hit telemetry |
| 8. NEXTAUTH_SECRET rotation mismatch | Phase 2 (Auth) + Phase 7 (CI/CD) | Distinct secret names; rotation runbook; rotation test on staging |
| 9. Slack credential routing | Phase 5 (Approval port) + Phase 6 (Slack setup) | Portal posts directly; one Slack message + one audit row per approval |
| 10. Cross-origin embedding | Phase 2 (Auth) + Phase 4 (URLs) | CSP `frame-ancestors 'none'` in both; CSP report-only run for 30 days |
| 11. URL emission audit | Phase 4 (URL centralization) | ESLint rule; grep returns zero hardcoded URLs outside redirect handler |
| 12. User-record creation race | Phase 2 (Auth) | `signIn` is read-only; concurrency test |
| 13. Local dev workflow | Phase 1 (Scaffold) | `docs/local-dev.md`; fresh-laptop onboarding test |
| 14. Apphosting env drift | Phase 1 (Scaffold) + Phase 7 (CI/CD) | `assertEnv()` at boot; `validate-apphosting.ts` CI step; deliberate-removal test |

---

## Sources

- **Admin codebase audit** (this milestone's PROJECT.md, `src/lib/auth.ts`, `apphosting.yaml`, Phase 7.5 hostname routing notes, Phase 9 `actor_source` schema, Phase 13 FAH rollout architecture, Phase 14 customer page integration) — HIGH confidence
- **NextAuth v4 cookie semantics** (`next-auth` source `src/core/lib/cookie.ts` + cookie prefix RFC 6265bis `__Host-` / `__Secure-` rules) — HIGH confidence
- **CockroachDB role/permission model** (CRDB docs on `GRANT`/`REVOKE`, role-based DDL gating) — HIGH confidence
- **Firebase App Hosting secret scoping** (Firebase docs on apphosting.yaml syntax, project-scoped secrets, BUILD vs RUNTIME availability) — HIGH confidence
- **Drizzle Kit `push` vs `migrate` semantics** (Drizzle docs, no migration history table in `push` mode) — HIGH confidence
- **Slack App scope inheritance and bot token rotation** (Phase 7 OttoBot dispatcher hardening notes; Slack API docs on bot token + signing secret rotation) — HIGH confidence
- **Pre-existing v2.1 sanitization helpers** (`src/lib/sanitize-commit.ts` per Phase 11) — HIGH confidence
- **Browser cross-origin and CSP enforcement** (MDN, OWASP CSP guides) — HIGH confidence
- **301 redirect grace period best practice** (general web migration patterns; 90-day window is conventional, not authoritative) — MEDIUM confidence
- **Local dev concurrency tooling** (`concurrently` npm package, Next.js port flag) — HIGH confidence

---
*Pitfalls research for: Customer Portal Split (v2.2 milestone)*
*Researched: 2026-05-08*
