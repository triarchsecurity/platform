/**
 * Destruction primitives for projects registered in the dev admin.
 *
 * Each function is idempotent and best-effort: returns {ok, detail} so the
 * orchestrator can report partial-failure rather than aborting the whole
 * cascade. Used by:
 *   - POST /api/platform/projects/[id]/destroy (HTTP orchestrator)
 *   - scripts/destroy-project.ts                (direct CLI invocation)
 */
import { Pool } from 'pg';

export type StepResult = { ok: boolean; detail: string };

const CLUSTER_HOST = 'triarchdev-24092.j77.aws-us-east-2.cockroachlabs.cloud:26257';

/**
 * Drop a CockroachDB database and its dedicated user. Uses DATABASE_URL as
 * the cluster admin connection (must point at defaultdb on the same cluster
 * with privileges to DROP). Database and user names are validated against
 * /^[a-z0-9_-]+$/i to prevent SQL injection in DROP statements (CRDB does
 * not support parameterized DROP DATABASE).
 */
export async function dropCrdbDatabaseAndUser(
  databaseName: string,
  userName: string | null,
  adminUrl: string
): Promise<{ database: StepResult; user: StepResult }> {
  const safe = /^[a-z0-9_-]+$/i;
  if (!safe.test(databaseName)) {
    return {
      database: { ok: false, detail: `invalid db name: ${databaseName}` },
      user: { ok: false, detail: 'skipped (db name invalid)' },
    };
  }

  const pool = new Pool({ connectionString: adminUrl });
  const out = {
    database: { ok: false, detail: '' } as StepResult,
    user: { ok: false, detail: '' } as StepResult,
  };
  try {
    try {
      await pool.query(`DROP DATABASE IF EXISTS "${databaseName}" CASCADE`);
      out.database = { ok: true, detail: `dropped database ${databaseName}` };
    } catch (err) {
      out.database = {
        ok: false,
        detail: `DROP DATABASE failed: ${(err as Error).message}`,
      };
    }

    if (userName && safe.test(userName)) {
      try {
        await pool.query(`DROP USER IF EXISTS "${userName}"`);
        out.user = { ok: true, detail: `dropped user ${userName}` };
      } catch (err) {
        out.user = {
          ok: false,
          detail: `DROP USER failed: ${(err as Error).message}`,
        };
      }
    } else {
      out.user = { ok: true, detail: 'no user to drop' };
    }
  } finally {
    await pool.end();
  }
  return out;
}

/**
 * Remove all known DNS records for `<subdomain>.triarch.dev` from GoDaddy:
 *   - A          <subdomain>
 *   - TXT        <subdomain>             (fah-claim)
 *   - CNAME      _acme-challenge_rvlyulquknfzxvy4.<subdomain>
 *   - TXT        _acme-challenge.<subdomain>  (Firebase Hosting variant)
 *
 * Returns one StepResult per record type.
 */
export async function removeDnsRecords(
  subdomain: string,
  godaddyApiKey: string,
  godaddyApiSecret: string
): Promise<Array<{ name: string; type: string; result: StepResult }>> {
  const auth = `sso-key ${godaddyApiKey}:${godaddyApiSecret}`;
  const targets = [
    { name: subdomain, type: 'A' },
    { name: subdomain, type: 'TXT' },
    { name: `_acme-challenge_rvlyulquknfzxvy4.${subdomain}`, type: 'CNAME' },
    { name: `_acme-challenge.${subdomain}`, type: 'TXT' },
  ];
  const results: Array<{ name: string; type: string; result: StepResult }> = [];
  for (const t of targets) {
    try {
      const res = await fetch(
        `https://api.godaddy.com/v1/domains/triarch.dev/records/${t.type}/${t.name}`,
        { method: 'DELETE', headers: { Authorization: auth } }
      );
      if (res.status === 204 || res.status === 200) {
        results.push({
          ...t,
          result: { ok: true, detail: `deleted ${t.type} ${t.name}` },
        });
      } else if (res.status === 404) {
        results.push({
          ...t,
          result: { ok: true, detail: `${t.type} ${t.name} did not exist (skipped)` },
        });
      } else {
        const body = await res.text();
        results.push({
          ...t,
          result: {
            ok: false,
            detail: `GoDaddy ${res.status}: ${body.slice(0, 160)}`,
          },
        });
      }
    } catch (err) {
      results.push({
        ...t,
        result: { ok: false, detail: (err as Error).message },
      });
    }
  }
  return results;
}

/**
 * Delete a GitHub repo. Token must have `delete_repo` scope (separate from
 * the `repo` scope used for creation). 204 = success, 403 = scope missing,
 * 404 = already gone.
 */
export async function deleteGithubRepo(
  fullName: string,
  ghToken: string
): Promise<StepResult> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 204) return { ok: true, detail: `deleted ${fullName}` };
    if (res.status === 404) return { ok: true, detail: `${fullName} did not exist` };
    if (res.status === 403) {
      return {
        ok: false,
        detail: `403 — token missing delete_repo scope. Run: gh auth refresh -s delete_repo`,
      };
    }
    const body = await res.text();
    return { ok: false, detail: `GitHub ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

/**
 * Delete a Firebase / GCP project via Cloud Resource Manager. Requires a
 * gcloud access token with cloud-platform scope and the user must have
 * resourcemanager.projects.delete on the project. Project enters a 30-day
 * soft-delete window before permanent removal.
 */
export async function deleteFirebaseProject(
  projectId: string,
  gcloudAccessToken: string
): Promise<StepResult> {
  try {
    const res = await fetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${gcloudAccessToken}`,
          'x-goog-user-project': projectId,
        },
      }
    );
    if (res.ok) {
      return { ok: true, detail: `marked ${projectId} for deletion (30-day window)` };
    }
    if (res.status === 404) return { ok: true, detail: `${projectId} did not exist` };
    const body = await res.text();
    return { ok: false, detail: `GCP ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export const CLUSTER_URL = CLUSTER_HOST;
