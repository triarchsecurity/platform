# Phase 1: Central Secrets Vault - Research

**Researched:** 2026-05-04
**Domain:** GCP Secret Manager + npm package authoring + Firebase App Hosting IAM + TypeScript module design
**Confidence:** HIGH (core stack verified against official docs and live npm registry; one MEDIUM item flagged)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Vault Project + IAM Model**
- Vault GCP project name: `triarch-vault` — new dedicated GCP project
- Billing: linked to same billing account as existing Firebase projects
- Secret Manager region: Automatic (Google-managed multi-region)
- IAM grant scope: Per-secret `roles/secretmanager.secretAccessor` — minimum privilege

**`@myalterlego/secrets` Package Design**
- Package name: `@myalterlego/secrets`
- Publish target: GitHub Packages (`npm.pkg.github.com`)
- API: `getSecret(name: string): Promise<string>` exported
- Cache: Module-level `Map<string, { value: string; expiresAt: number }>`, TTL = 300 seconds
- Local dev fallback: vault first; on auth error / network failure → `process.env[name]`

**Migration Strategy**
- Order: `triarch-dev` admin first → verify in production → then `triarchsecurity-admin` CRM
- Transitional fallback: existing Firebase secrets remain during migration
- Verification: `GET /api/platform/health/secrets` — staff-only endpoint checking all seven keys
- Rollback: automatic env fallback IS the rollback

**Onboarding Docs**
- Extend `docs/onboarding-projects.md` with "Step 7: Grant vault access"
- Create new `docs/secrets-vault.md` (architecture, IAM commands, rotation runbook, troubleshooting)
- Backwards-compatible `apphosting.yaml`: existing secret entries stay during transition
- Missing secret behavior: `getSecret` throws `SecretNotFoundError` with message pointing to GCP console

### Claude's Discretion
- Exact npm package version (start at `0.1.0`)
- Custom error class structure (extends `Error` with `name = 'SecretNotFoundError'`)
- Internal client initialization (lazy vs eager — recommend lazy on first `getSecret` call)
- Test strategy (Vitest with mocked `@google-cloud/secret-manager` client)
- File location for the new shared package

### Deferred Ideas (OUT OF SCOPE)
- New-project wizard integration for vault IAM grants
- Per-environment vault projects (dev/staging/prod separation)
- Secret rotation automation
- Audit logging for vault reads
- Multi-org vault
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAULT-01 | New GCP project `triarch-vault` created with Secret Manager API enabled and billing linked | HUMAN action — gcloud CLI commands documented in runbook section |
| VAULT-02 | Seven shared secrets migrated to `triarch-vault` Secret Manager | gcloud secrets create + versions add commands; current source locations mapped |
| VAULT-03 | IAM grants applied — each Firebase project's service account has `secretAccessor` on specific secrets | **See critical finding below on SA identity**; gcloud commands documented |
| VAULT-04 | `@myalterlego/secrets` npm package published with `getSecret(name)` helper | Full API, cache pattern, and publish setup documented |
| VAULT-05 | `triarch-dev` admin app migrated from per-project Firebase secrets | Consumer migration pattern documented; seven keys and their current locations mapped |
| VAULT-06 | `triarchsecurity-admin` CRM migrated from `settings` table | CRM source code read; `getSlackClient()` and `getSlackSigningSecret()` are the callsites |
| VAULT-07 | Onboarding runbook updated | Existing `docs/onboarding-projects.md` (236 lines, 6 steps) — add Step 7 |
</phase_requirements>

---

## Summary

This phase establishes `triarch-vault` (a dedicated GCP project) as the single canonical store for seven shared credentials, replacing per-project Firebase secrets on the admin app and the `settings` table on the CRM. A thin npm package `@myalterlego/secrets` wraps the `@google-cloud/secret-manager` client (v6.1.2) with module-level caching and `process.env` fallback for local dev. The publish pipeline mirrors `@myalterlego/shared-ui` exactly — GitHub Packages registry, `NODE_AUTH_TOKEN` via existing CI secret.

The migration is two-app sequential with a transitional fallback: because the package falls back to `process.env[name]` on vault failure, existing Firebase secrets remain in place throughout the migration window and only get deleted in a separate closeout step after both apps are verified reading from vault.

**Primary recommendation:** Build the package first (VAULT-04), publish it, migrate `triarch-dev` admin (VAULT-05), verify via health endpoint, then migrate CRM (VAULT-06). VAULT-01 through VAULT-03 are HUMAN-action prerequisites that must be completed before VAULT-05 can deploy successfully.

**Critical finding:** The CONTEXT.md specifies `firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com` as the IAM target. Official Firebase App Hosting documentation states the runtime service account is `firebase-app-hosting-compute@<project>.iam.gserviceaccount.com`. The planner should include a HUMAN verification step: run `gcloud iam service-accounts list --project=<project>` to confirm the actual SA name before granting vault access.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google-cloud/secret-manager` | 6.1.2 | GCP Secret Manager client | Official Google client; verified latest on npm registry 2026-05-01 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.1.5 | Unit tests for the package | Matches admin app's test framework; already in use |
| `typescript` | ^5 | Package types | All project TS; types ship with built package |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@google-cloud/secret-manager` | Raw REST + `fetch` | Raw fetch saves ~2MB; loses type safety, retry logic, ADC integration |
| Module-level Map cache | Redis / external cache | External cache adds infra; TTL=300s in-process cache is sufficient for low-instance-count App Hosting |

**Installation (in the new package repo):**
```bash
npm install @google-cloud/secret-manager
npm install --save-dev typescript vitest
```

**Installation (in consumer apps):**
```bash
# .npmrc must already have @myalterlego:registry=https://npm.pkg.github.com
npm install @myalterlego/secrets
```

**Version verification:** `@google-cloud/secret-manager` version 6.1.2 confirmed current as of 2026-05-01 via npm registry.

---

## Architecture Patterns

### Package Repository Structure
```
@myalterlego/secrets/          # new repo: MyAlterLego/secrets
├── src/
│   └── index.ts               # getSecret(), SecretNotFoundError, cache
├── package.json               # publishConfig → npm.pkg.github.com
├── tsconfig.json
├── vitest.config.ts
├── .npmrc                     # @myalterlego:registry=https://npm.pkg.github.com
└── src/index.test.ts          # Vitest unit tests with mocked client
```

### Consumer App Migration Structure
```
src/lib/
├── slack.ts           # change process.env.SLACK_BOT_TOKEN → await getSecret('SLACK_BOT_TOKEN')
├── slack-identity.ts  # replace hardcoded SLACK_USER_MAP → await getSecret('SLACK_USER_MAP') + JSON.parse
├── github-app.ts      # change readEnv() → await-based getEnv() using getSecret()
src/app/api/platform/health/
└── secrets/
    └── route.ts       # GET — staff-only; calls getSecret() for all 7 keys, returns per-key status
```

### Pattern 1: `@google-cloud/secret-manager` v6 Client Access
**What:** One `SecretManagerServiceClient` instance (lazy-initialized), called via `accessSecretVersion` with the `projects/{project}/secrets/{name}/versions/latest` resource path.
**When to use:** Every call to `getSecret(name)` that misses the module-level cache.
**Example:**
```typescript
// Source: https://docs.cloud.google.com/secret-manager/docs/access-secret-version (verified 2026-05-04)
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let _client: SecretManagerServiceClient | null = null;

function getClient(): SecretManagerServiceClient {
  if (!_client) _client = new SecretManagerServiceClient();
  return _client;
}

async function fetchFromVault(name: string): Promise<string> {
  const project = 'triarch-vault';
  const resourceName = `projects/${project}/secrets/${name}/versions/latest`;
  const [version] = await getClient().accessSecretVersion({ name: resourceName });
  return version.payload!.data!.toString();
}
```

### Pattern 2: Module-Level Cache with TTL (mirrors `src/lib/github-app.ts`)
**What:** `Map<string, { value: string; expiresAt: number }>` initialized once at module load; `getSecret` checks TTL before calling vault.
**When to use:** Every `getSecret` invocation — prevents quota exhaustion across concurrent requests.
**Example:**
```typescript
// Pattern mirrors existing src/lib/github-app.ts token cache (verified in codebase)
const cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 300_000; // 300 seconds per locked decision

export async function getSecret(name: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(name);
  if (cached && now < cached.expiresAt) return cached.value;

  try {
    const value = await fetchFromVault(name);
    cache.set(name, { value, expiresAt: now + TTL_MS });
    return value;
  } catch (err) {
    // Fallback: process.env (local dev + rollback safety)
    const envValue = process.env[name];
    if (envValue) return envValue;
    throw new SecretNotFoundError(name);
  }
}
```

### Pattern 3: `SecretNotFoundError` (locked decision)
**What:** Custom error class extending `Error`, exported from the package.
**When to use:** When vault fetch fails AND no `process.env[name]` fallback exists.
**Example:**
```typescript
export class SecretNotFoundError extends Error {
  constructor(name: string) {
    super(
      `Secret '${name}' not found in vault and no fallback in process.env. ` +
      `Check vault setup at https://console.cloud.google.com/security/secret-manager?project=triarch-vault`
    );
    this.name = 'SecretNotFoundError';
  }
}
```

### Pattern 4: `package.json` for GitHub Packages Publish (mirrors `@myalterlego/shared-ui`)
**What:** `publishConfig.registry` pointing to GitHub Packages, `access: "restricted"` since org is private.
**Example:**
```json
{
  "name": "@myalterlego/secrets",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  }
}
```

### Pattern 5: Consumer Migration — `slack.ts` (admin)
**What:** Replace module-level `const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN` with lazy async resolution via `getSecret`.
**Key constraint:** `slack.ts` currently initializes `SLACK_BOT_TOKEN` at module load (synchronously). Post-migration it must be fetched async per call. The existing null-check guard (`if (!SLACK_BOT_TOKEN)`) becomes an async pattern.

### Pattern 6: Consumer Migration — `github-app.ts` (admin)
**What:** `readEnv()` is synchronous and reads `process.env` directly. Post-migration: replace with an async `readVaultEnv()` that calls `getSecret()` for `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`. The existing PEM `\n` normalization logic stays.

### Pattern 7: Consumer Migration — CRM `slack.ts`
**What:** CRM `getSlackClient()` currently queries `settings` table for `slack_bot_token`, then falls back to `process.env.SLACK_BOT_TOKEN`. Post-migration: replace the DB query with `await getSecret('SLACK_BOT_TOKEN')`. Same for `getSlackSigningSecret()` → `await getSecret('SLACK_SIGNING_SECRET')`.
**Important:** CRM `package.json` has no `.npmrc` and no `NODE_AUTH_TOKEN` CI setup. Installing `@myalterlego/secrets` in the CRM requires adding `.npmrc` + `NODE_AUTH_TOKEN` handling.

### Pattern 8: IAM Grant Commands (VAULT-03)
```bash
# Grant per-secret access to the App Hosting runtime service account
# HUMAN must first verify actual SA name (see critical finding)
gcloud secrets add-iam-policy-binding SLACK_BOT_TOKEN \
  --project=triarch-vault \
  --member="serviceAccount:firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Anti-Patterns to Avoid
- **Top-level await at module init:** `const token = await getSecret('SLACK_BOT_TOKEN')` at module root — crashes on cold start before App Hosting completes initialization. Use lazy async resolution instead.
- **Caching the client per call:** Creating `new SecretManagerServiceClient()` on every `getSecret` invocation — unnecessary overhead and connection churn. Use a module-level lazy singleton.
- **Throwing on cache miss during fallback:** If vault is unavailable AND `process.env[name]` has a value, the package must return the env value silently. Don't surface vault errors when a fallback is available.
- **Eagerly deleting Firebase secrets before verification:** The closeout step (remove duplicate Firebase secrets from `apphosting.yaml`) MUST NOT be bundled into the migration plan. It's a separate step post-verification.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret fetching + retry | Custom fetch + retry loop | `@google-cloud/secret-manager` client | Client handles retries, ADC, gRPC transport, and version management |
| ADC credential resolution | Manual `GOOGLE_APPLICATION_CREDENTIALS` parsing | ADC built into the client | App Hosting's runtime SA is auto-detected via ADC; manual parsing breaks in production |
| Secret caching | Redis or Memcached | Module-level Map + TTL | App Hosting is low-instance; in-process cache sufficient, no new infra |

**Key insight:** The `@google-cloud/secret-manager` client v6 uses Application Default Credentials automatically. In Firebase App Hosting, the runtime service account (`firebase-app-hosting-compute@`) is the ADC identity — no `GOOGLE_APPLICATION_CREDENTIALS` env var needed. The only IAM work is granting `secretAccessor` on the vault project's secrets.

---

## Current Secret Locations (Source Map for VAULT-02)

| Secret | Current location(s) | Current consumer |
|--------|-------------------|------------------|
| `SLACK_BOT_TOKEN` | `triarch-dev-website` Firebase secrets (apphosting.yaml) AND CRM `settings` table (encrypted) | admin `src/lib/slack.ts` + CRM `src/lib/slack.ts` |
| `SLACK_SIGNING_SECRET` | Same dual location | admin `src/lib/slack-crypto.ts` + CRM `src/lib/slack.ts` |
| `SLACK_PAYLOAD_SECRET` | `triarch-dev-website` Firebase secrets only | admin `src/lib/slack-crypto.ts` |
| `GITHUB_APP_ID` | `triarch-dev-website` Firebase secrets | admin `src/lib/github-app.ts` `readEnv()` |
| `GITHUB_APP_PRIVATE_KEY` | `triarch-dev-website` Firebase secrets | admin `src/lib/github-app.ts` `readEnv()` |
| `GITHUB_APP_INSTALLATION_ID` | `triarch-dev-website` Firebase secrets | admin `src/lib/github-app.ts` `readEnv()` |
| `SLACK_USER_MAP` | Hardcoded in `src/lib/slack-identity.ts` | admin `src/lib/slack-identity.ts` |

**SLACK_USER_MAP migration note:** `src/lib/slack-identity.ts` currently exports a hardcoded `Record<string, string>`. Post-migration it becomes an async wrapper that calls `getSecret('SLACK_USER_MAP')` and parses JSON. Any caller of `resolveSlackUserEmail()` must be updated to `await` the result.

---

## Common Pitfalls

### Pitfall 1: Wrong Runtime Service Account for IAM Grant
**What goes wrong:** IAM grant targets `firebase-adminsdk-fbsvc@<project>.iam.gserviceaccount.com` (Admin SDK SA) but App Hosting runtime uses `firebase-app-hosting-compute@<project>.iam.gserviceaccount.com`. Vault calls return `PERMISSION_DENIED` after deploy.
**Why it happens:** The CONTEXT.md was written with `firebase-adminsdk-fbsvc` as the target, but official Firebase App Hosting docs state the runtime SA is `firebase-app-hosting-compute`. These are two different service accounts.
**How to avoid:** HUMAN verification step before granting IAM: `gcloud iam service-accounts list --project=<consumer-project>` to see the actual SA names. Grant `secretAccessor` to whichever SA appears as the App Hosting compute account.
**Warning signs:** `PERMISSION_DENIED` in server logs when `getSecret()` is called in production; local dev works because `process.env` fallback is active.

### Pitfall 2: CRM Has No `.npmrc` or GitHub Packages Auth
**What goes wrong:** `npm install @myalterlego/secrets` in `triarchsecurity-admin` fails — no `.npmrc` pointing to GitHub Packages registry.
**Why it happens:** The CRM (`/Users/mikegeehan/claude/triarch/security/admin/`) has no `.npmrc` file (confirmed by filesystem check). The admin app has one; CRM does not.
**How to avoid:** VAULT-06 plan must include adding `.npmrc` and `NODE_AUTH_TOKEN` wiring to the CRM's CI/CD (both `quality-gate.yml` and the deploy step).

### Pitfall 3: `SLACK_USER_MAP` Callers Are Synchronous
**What goes wrong:** `resolveSlackUserEmail(userId)` is called synchronously throughout the codebase. After migration it must return `Promise<string | null>`. Callers that don't `await` it silently receive a Promise object instead of a string.
**Why it happens:** The current `slack-identity.ts` is fully synchronous. Migrating the internal lookup to `getSecret()` forces an async boundary.
**How to avoid:** Update all callers to `await resolveSlackUserEmail(userId)`. Grep for all usages before migrating.
**Warning signs:** TypeScript compiler catches this if `noImplicitAny` is on; silently broken at runtime if not.

### Pitfall 4: `github-app.ts` Uses `readEnv()` Which Is Synchronous
**What goes wrong:** `readEnv()` reads `process.env` at call time (synchronous). If migrated to async vault calls, the function must become `async`. The `signAppJwt()` function currently calls `readEnv()` synchronously.
**Why it happens:** The JWT signing path is currently sync-only by design. Vault access is inherently async.
**How to avoid:** Make `readEnv()` async (`readVaultEnv(): Promise<...>`). This ripples through `signAppJwt()` → must also become async. Update callers. Alternatively, introduce an async pre-fetch step that populates module-level variables.

### Pitfall 5: `@google-cloud/secret-manager` Requires `google-gax` v5+
**What goes wrong:** Installing into an app that has an older `google-gax` transitive dependency causes version conflicts.
**Why it happens:** `@google-cloud/secret-manager` v6 declares `google-gax: "^5.0.0"` as a direct dependency.
**How to avoid:** In both consumer apps, verify no `google-gax` peer conflict after install (`npm ls google-gax`). The admin and CRM apps don't currently use other Google Cloud libraries so this is unlikely to be an issue.

### Pitfall 6: `apphosting.yaml` Secret Entries and RUNTIME-only Availability
**What goes wrong:** If a secret in `apphosting.yaml` is not marked `availability: [RUNTIME]`, it won't be injected into the running process. If marked `availability: [BUILD]` only, build succeeds but runtime has no env var.
**Why it happens:** v1.14 decision: apphosting.yaml uses `RUNTIME`-only for secrets (no `availability` field defaults to RUNTIME). The vault migration plan must preserve this when adding the `GITHUB_PACKAGES_TOKEN` (BUILD-only) pattern — it's the one exception.
**How to avoid:** When adding `@myalterlego/secrets` package to the app, the package install happens at BUILD. But vault reads happen at RUNTIME. No new secret entry is needed in `apphosting.yaml` for the vault itself — the runtime SA's ADC handles auth automatically.

---

## Code Examples

### Complete `getSecret` implementation
```typescript
// Source: official @google-cloud/secret-manager v6 API + project caching pattern
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const VAULT_PROJECT = 'triarch-vault';
const TTL_MS = 300_000;

export class SecretNotFoundError extends Error {
  constructor(name: string) {
    super(
      `Secret '${name}' not found in vault and no fallback in process.env. ` +
      `Check vault setup at https://console.cloud.google.com/security/secret-manager?project=triarch-vault`
    );
    this.name = 'SecretNotFoundError';
  }
}

let _client: SecretManagerServiceClient | null = null;
const _cache = new Map<string, { value: string; expiresAt: number }>();

function client(): SecretManagerServiceClient {
  if (!_client) _client = new SecretManagerServiceClient();
  return _client;
}

export async function getSecret(name: string): Promise<string> {
  const now = Date.now();
  const hit = _cache.get(name);
  if (hit && now < hit.expiresAt) return hit.value;

  try {
    const resourceName = `projects/${VAULT_PROJECT}/secrets/${name}/versions/latest`;
    const [version] = await client().accessSecretVersion({ name: resourceName });
    const value = version.payload!.data!.toString();
    _cache.set(name, { value, expiresAt: now + TTL_MS });
    return value;
  } catch {
    const envFallback = process.env[name];
    if (envFallback) return envFallback;
    throw new SecretNotFoundError(name);
  }
}
```

### Health check endpoint
```typescript
// Source: project pattern (requireStaff from src/lib/api-auth.ts, verified in codebase)
// GET /api/platform/health/secrets
import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/api-auth';
import { getSecret } from '@myalterlego/secrets';

const VAULT_KEYS = [
  'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_PAYLOAD_SECRET',
  'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_INSTALLATION_ID',
  'SLACK_USER_MAP',
] as const;

export async function GET() {
  const { error } = await requireStaff();
  if (error) return error;

  const results = await Promise.allSettled(
    VAULT_KEYS.map(async (key) => {
      const value = await getSecret(key);
      return { key, ok: true, length: value.length };
    })
  );

  const status = results.map((r, i) =>
    r.status === 'fulfilled'
      ? { key: VAULT_KEYS[i], ok: true, length: r.value.length }
      : { key: VAULT_KEYS[i], ok: false, error: (r.reason as Error).message }
  );

  const allOk = status.every((s) => s.ok);
  return NextResponse.json({ ok: allOk, secrets: status }, { status: allOk ? 200 : 207 });
}
```

### IAM grant commands (for VAULT-03 runbook)
```bash
# Step 1: Verify actual service account name (HUMAN action — do this first)
gcloud iam service-accounts list --project=triarch-dev-website --format="table(email)"

# Step 2: Grant per-secret access (repeat for each of the 7 secrets)
# Replace SA_EMAIL with actual SA from Step 1
SA_EMAIL="firebase-app-hosting-compute@triarch-dev-website.iam.gserviceaccount.com"
for SECRET in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET SLACK_PAYLOAD_SECRET \
              GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_INSTALLATION_ID SLACK_USER_MAP; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --project=triarch-vault \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### CRM migration: replacing `settings` table DB lookup
```typescript
// BEFORE (src/lib/slack.ts in triarchsecurity-admin)
const result = await crmQuery<{ value: string }>('SELECT value FROM settings WHERE key = $1', ['slack_bot_token']);
botToken = decryptKey(result.rows[0].value);

// AFTER
import { getSecret } from '@myalterlego/secrets';
botToken = await getSecret('SLACK_BOT_TOKEN');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-project Firebase secrets for shared creds | Central GCP Secret Manager project | v2.0 Phase 1 | Single rotation point; no per-project secret sync |
| `settings` table (encrypted) for Slack creds in CRM | Vault via `@myalterlego/secrets` | v2.0 Phase 1 | Eliminates AES-256-GCM decrypt code path in CRM; consolidates all credential management |
| Hardcoded `SLACK_USER_MAP` in source | Vault as JSON blob | v2.0 Phase 1 | Map updates no longer require a code deployment |
| `firebase-app-hosting-compute` SA (default, minimal permissions) | Same SA + `secretAccessor` grant on `triarch-vault` secrets | v2.0 Phase 1 | Runtime SA gets explicit cross-project secret read access |

**Deprecated/outdated in this phase:**
- `apphosting.yaml` entries for `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_PAYLOAD_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`: remain during transition, deleted in closeout step
- CRM `settings` table rows for `slack_bot_token`, `slack_signing_secret`: table retained for non-credential metadata; credential rows become unused after VAULT-06 ships

---

## Open Questions

1. **Which service account does `triarch-dev-website` App Hosting actually use?**
   - What we know: Official Firebase App Hosting docs say `firebase-app-hosting-compute@<project>.iam.gserviceaccount.com`; CONTEXT.md says `firebase-adminsdk-fbsvc@`; v1.14 IAM docs don't reference either by name
   - What's unclear: Whether the CONTEXT.md claim is from actual observed output or from training data
   - Recommendation: First task in VAULT-03 plan is a HUMAN verification step: `gcloud iam service-accounts list --project=triarch-dev-website`. The plan must NOT assume either SA name — make the grant command parametric.

2. **Does CRM `triarchsecurity-admin` Firebase project also need vault access?**
   - What we know: VAULT-06 requires CRM to call `getSecret()` at runtime; App Hosting runtime SA for CRM needs `secretAccessor` too
   - What's unclear: Whether the CRM runs on a different Firebase project ID than the admin app (it deploys to `triarchsecurity-admin` per its `apphosting.yaml`)
   - Recommendation: VAULT-03 plan must include IAM grants for BOTH `triarch-dev-website` (admin app) AND `triarchsecurity-admin` (CRM app) service accounts.

3. **Does `GITHUB_APP_PRIVATE_KEY` need special handling for newline normalization in vault?**
   - What we know: `github-app.ts` already normalizes `\n` → actual newlines because Firebase secrets serialize the PEM with literal `\n`. GCP Secret Manager stores secrets as bytes — stores the PEM exactly as submitted.
   - What's unclear: Whether the secret was originally created with literal `\n` in the value or actual newlines
   - Recommendation: When loading the PEM value from vault, keep the existing normalization: `value.replace(/\\n/g, '\n')`. This is harmless if the secret has real newlines and necessary if it has literal `\n`.

---

## Sources

### Primary (HIGH confidence)
- npm registry live query — `@google-cloud/secret-manager` v6.1.2, published 2026-05-01
- https://docs.cloud.google.com/secret-manager/docs/access-secret-version — `accessSecretVersion` API example verified
- https://firebase.google.com/docs/app-hosting/about-app-hosting — `firebase-app-hosting-compute@` runtime SA identity verified
- Project codebase — `src/lib/github-app.ts` (caching pattern), `src/lib/slack.ts` (consumer shape), `src/lib/api-auth.ts` (requireStaff), `apphosting.yaml` (secret config format), `.npmrc` (GitHub Packages registry auth)
- `docs/onboarding-projects.md` — 236-line existing doc, 6 steps

### Secondary (MEDIUM confidence)
- `@myalterlego/shared-ui` package.json (portal repo) — publish config pattern verified by reading the file directly
- Firebase App Hosting IAM roles docs — confirmed `firebase-app-hosting-compute` SA; could not get the specific SA name for each project without a live gcloud query

### Tertiary (LOW confidence)
- CONTEXT.md claim that `firebase-adminsdk-fbsvc` was "verified during v1.14 IAM cascade work" — not corroborated by v1.14 planning docs; rated LOW; requires HUMAN verification

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@google-cloud/secret-manager` v6.1.2 verified against npm registry; API confirmed from official docs
- Architecture: HIGH — caching pattern mirrored from existing `github-app.ts` in codebase; publish pattern from actual `shared-ui` package.json
- Service account identity: MEDIUM — `firebase-app-hosting-compute` confirmed from official docs, but exact SA name for specific projects requires live `gcloud` verification; CONTEXT.md claim of `firebase-adminsdk-fbsvc` not corroborated
- CRM migration: HIGH — CRM `src/lib/slack.ts` read directly; no `.npmrc` confirmed by filesystem
- Pitfalls: HIGH — each pitfall grounded in actual codebase evidence or official docs

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (stable APIs; `@google-cloud/secret-manager` tracks `google-gax` which has minor releases)

---

## Validation Architecture

### Test Layers

**Layer 1 — Package unit tests (`@myalterlego/secrets/src/index.test.ts`)**
- Cache hit: second `getSecret(name)` call within TTL returns cached value, no client call
- Cache miss / TTL expiry: call after `expiresAt` triggers fresh `accessSecretVersion`
- Vault success path: `accessSecretVersion` returns payload → `getSecret` returns `value.payload.data.toString()`
- Vault error → env fallback: `accessSecretVersion` rejects, `process.env[name]` set → returns env value silently
- Vault error → no fallback: `accessSecretVersion` rejects, `process.env[name]` undefined → throws `SecretNotFoundError` with vault console URL in message
- `SecretNotFoundError.name === 'SecretNotFoundError'` (instanceof check works)
- Lazy client init: client constructor not called until first `getSecret`
- Single-flight (recommended): two concurrent `getSecret(name)` calls during cache miss share one `accessSecretVersion` (mirrors `github-app.ts` pattern)

Framework: Vitest 4.x with `vi.mock('@google-cloud/secret-manager')`; matches admin app pattern in `github-app.test.ts`.

**Layer 2 — Consumer integration tests (admin + CRM)**
- Admin: mock `@myalterlego/secrets` `getSecret` in test setup; verify `slack.ts`, `slack-crypto.ts`, `github-app.ts`, `slack-identity.ts` all call `getSecret` with the correct key name
- Admin `slack-identity.ts`: `resolveSlackUserEmail` returns the right email for a known Slack user_id when `SLACK_USER_MAP` JSON is mocked
- CRM: mock `getSecret`; verify `getSlackClient` and `getSlackSigningSecret` no longer query the `settings` table
- Health endpoint: mock `getSecret` to succeed for 5/7 keys, fail for 2 → response is 207 with per-key status array

**Layer 3 — Live vault verification (HUMAN-UAT, post-deploy)**
- Run `GET /api/platform/health/secrets` against deployed `admin.triarch.dev` with staff session → 200 with all 7 keys `ok: true`
- Run same against deployed `admin.triarchsecurity.com` after VAULT-06 ships → 200 with all 7 keys `ok: true`
- Functional smoke: trigger a Slack release approval flow → confirms `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_PAYLOAD_SECRET`, `GITHUB_APP_*` all resolved from vault during a real request

### Sample Rate / Coverage

- **Package callsites:** 100% — the package has only one exported async function (`getSecret`); every code path in it must have a test
- **Consumer callsites:** Every callsite that previously read one of the 7 keys via `process.env` (admin) or `settings` table (CRM) gets updated. Sample required: at least one test per consumer file (4 admin files + 2 CRM files = 6 files minimum)
- **Fallback paths:** All 3 fallback branches (vault success, vault-fail-with-env, vault-fail-no-env) tested at the package level — consumer tests can assume the package works
- **Secret coverage:** All 7 secrets exercised in the health endpoint test; the 7-key list lives in one constant, so a single assertion covers all keys
- **Representative sample:** "All 7 keys present in health endpoint constant" + "every consumer file has at least one test calling `getSecret` with the right key name" — this proves migration completeness without testing every code branch in every consumer

### Validation Commands

**Migration completeness (zero-match grep checks):**
```bash
# Admin: no direct env reads remain for any of the 7 keys
cd /Users/mikegeehan/claude/triarch/development/admin
for KEY in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET SLACK_PAYLOAD_SECRET \
           GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_INSTALLATION_ID; do
  echo "== $KEY ==" && grep -rn "process\.env\.${KEY}" src/ --include='*.ts' || echo "  clean"
done
# Expected: each section reports "clean" (or matches only in test files / fallback comment)

# Admin: SLACK_USER_MAP no longer hardcoded
grep -n "U0AJM4MP2N6" src/lib/slack-identity.ts
# Expected: zero matches (hardcoded map removed)

# CRM: no `settings` table lookups for slack creds
cd /Users/mikegeehan/claude/triarch/security/admin
grep -rn "slack_bot_token\|slack_signing_secret" src/ --include='*.ts'
# Expected: zero matches in src/lib/slack.ts (settings reads removed)
```

**Package published + installed:**
```bash
# Verify package published to GitHub Packages
NODE_AUTH_TOKEN=$GH_PAT npm view @myalterlego/secrets version --registry=https://npm.pkg.github.com
# Expected: "0.1.0" (or current bumped version)

# Verify installed in admin
cd /Users/mikegeehan/claude/triarch/development/admin
npm ls @myalterlego/secrets
# Expected: @myalterlego/secrets@0.x.y listed under dependencies

# Verify installed in CRM
cd /Users/mikegeehan/claude/triarch/security/admin
npm ls @myalterlego/secrets
# Expected: @myalterlego/secrets@0.x.y listed under dependencies
```

**Vault provisioning (HUMAN, gcloud auth required):**
```bash
# All 7 secrets exist
gcloud secrets list --project=triarch-vault --format="value(name)" | sort
# Expected exactly:
#   GITHUB_APP_ID
#   GITHUB_APP_INSTALLATION_ID
#   GITHUB_APP_PRIVATE_KEY
#   SLACK_BOT_TOKEN
#   SLACK_PAYLOAD_SECRET
#   SLACK_SIGNING_SECRET
#   SLACK_USER_MAP

# Each secret has at least one version
for S in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET SLACK_PAYLOAD_SECRET \
         GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_INSTALLATION_ID SLACK_USER_MAP; do
  gcloud secrets versions list "$S" --project=triarch-vault --limit=1 --format="value(name)" || echo "MISSING: $S"
done

# IAM bindings show secretAccessor for the App Hosting compute SA on each secret
for S in SLACK_BOT_TOKEN SLACK_SIGNING_SECRET SLACK_PAYLOAD_SECRET \
         GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_APP_INSTALLATION_ID SLACK_USER_MAP; do
  gcloud secrets get-iam-policy "$S" --project=triarch-vault \
    --filter="bindings.role:roles/secretmanager.secretAccessor"
done

# Round-trip verification: actually read a secret as the runtime SA would
gcloud secrets versions access latest --secret=SLACK_BOT_TOKEN --project=triarch-vault | head -c 20
# Expected: first 20 chars of the token (xoxb-...)
```

**Tests pass:**
```bash
# Package tests (in the @myalterlego/secrets repo)
npm test
# Expected: all tests green

# Admin app tests
cd /Users/mikegeehan/claude/triarch/development/admin
npx vitest run
# Expected: existing tests still green; new tests for migrated files green

# CRM app tests — CRM has no test framework currently; add minimal vitest setup if VAULT-06 introduces tests
```

**Health endpoint live check (post-deploy):**
```bash
# Authenticated curl as staff
curl -s -b "next-auth.session-token=<staff-session>" https://admin.triarch.dev/api/platform/health/secrets | jq .
# Expected: { "ok": true, "secrets": [ { "key": "SLACK_BOT_TOKEN", "ok": true, "length": 56 }, ... ] }
```

### Failure Modes to Validate

| Failure mode | Detection method | Test required |
|--------------|-----------------|---------------|
| **Stale cache after rotation** | Set short TTL in test, advance timers past `expiresAt`, assert second call hits vault | Package unit test |
| **Cache poisoning across secrets** | Cache key collision — two different secrets returning same cached value | Package unit test: two `getSecret` calls with different names return distinct values |
| **Auth failure → silent env fallback masks production outage** | When NO env fallback set, error must surface; when env IS set, log a warning so audit logs show vault was unavailable | Package unit test: assert `console.warn` called when fallback engaged in production-shaped env |
| **Missing IAM grant** | Vault call rejects with `PERMISSION_DENIED`; in production with no env fallback, must throw `SecretNotFoundError` | Package unit test mocks PERMISSION_DENIED + integration test in HUMAN-UAT |
| **Local dev without GCP credentials** | `getSecret` falls back to `process.env`; `.env.local` continues to work | Package unit test simulates rejected client + present env var |
| **PEM newline mangling** (`GITHUB_APP_PRIVATE_KEY`) | Vault returns PEM with literal `\n`; consumer must normalize | Existing `github-app.test.ts` "PEM newline normalization" test still passes after migration |
| **`SLACK_USER_MAP` JSON parse failure** | Vault returns malformed JSON; `resolveSlackUserEmail` throws | New unit test in `slack-identity.test.ts` (created during VAULT-05): malformed JSON → caller-friendly error |
| **Wrong service account granted** | `firebase-adminsdk-fbsvc` granted instead of `firebase-app-hosting-compute` → all vault reads fail in production | HUMAN-UAT health endpoint check post-deploy catches this |
| **Cache hit returning Promise from in-flight fetch** (single-flight bug) | Two concurrent calls before first resolves cause double fetch or wrong shared value | Package unit test: two parallel calls during cache miss, mock fetch returns once, both promises resolve to same value |
| **Closeout step removes Firebase secrets too early** | Firebase secret deleted while CRM still depends on env fallback → outage | Closeout is OUT OF SCOPE for this phase; explicitly deferred per CONTEXT.md |

### Per-Requirement Validation Mapping

| Req | Validation strategy |
|-----|--------------------|
| **VAULT-01** | `gcloud projects describe triarch-vault` returns project; `gcloud services list --project=triarch-vault --filter="name:secretmanager"` shows API enabled; billing linked confirmed via `gcloud beta billing projects describe triarch-vault` |
| **VAULT-02** | `gcloud secrets list --project=triarch-vault` returns exactly the 7 expected names; each has `gcloud secrets versions list ... --limit=1` returning a version |
| **VAULT-03** | `gcloud secrets get-iam-policy <secret> --project=triarch-vault` shows `roles/secretmanager.secretAccessor` for the App Hosting compute SA of each consuming Firebase project (`triarch-dev-website` AND `triarchsecurity-admin`) — for every secret each project consumes; functional confirmation via successful health endpoint call post-deploy |
| **VAULT-04** | `npm view @myalterlego/secrets version --registry=https://npm.pkg.github.com` returns published version; package unit tests green; package importable in a fresh consumer (`npm install @myalterlego/secrets && node -e "import('@myalterlego/secrets').then(m => console.log(typeof m.getSecret))"` prints `function`) |
| **VAULT-05** | Admin `grep -rn "process\.env\.SLACK_BOT_TOKEN" src/` returns no matches (or only in fallback comments); admin vitest suite green; deployed `admin.triarch.dev/api/platform/health/secrets` returns 200 with all 7 keys ok; functional Slack approval flow works end-to-end |
| **VAULT-06** | CRM `grep -rn "slack_bot_token" src/` returns no matches in `src/lib/slack.ts`; CRM `.npmrc` exists with GitHub Packages registry config; `NODE_AUTH_TOKEN` wired in CI; deployed `admin.triarchsecurity.com/api/platform/health/secrets` (or equivalent) returns 200; functional bug-report Slack notification still posts |
| **VAULT-07** | `docs/onboarding-projects.md` contains a "Step 7" or equivalent vault-access section; new `docs/secrets-vault.md` exists; both reference the verified service account name from VAULT-03 |
