/**
 * Backfill / refresh live state for projects in the registry.
 *
 * The github-deploy webhook only fires on FUTURE deploys, so existing
 * projects have stale `currentVersion`/`status` from seed data. This module
 * polls GitHub for each project's latest release + last main-branch CI run
 * and writes the result back to the projects table.
 *
 * Used by:
 *   - POST /api/platform/projects/sync-state (UI button / cron)
 *   - scripts/sync-state.ts                  (ad-hoc CLI)
 */
import type { projects } from '@/db/schema';

type Project = typeof projects.$inferSelect;

export type SyncedFields = {
  currentVersion?: string;
  status?: string;
  source: string[];
};

export type SyncResult = {
  key: string;
  ok: boolean;
  changed: boolean;
  before: { currentVersion: string | null; status: string };
  after: { currentVersion: string | null; status: string };
  detail: string;
};

async function ghJson<T>(path: string, ghToken: string): Promise<T | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${path}: ${res.status} ${body.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Determine the latest version + status for a project by querying GitHub.
 * Priority order for currentVersion:
 *   1. Latest release tag (if any)
 *   2. Version prefix in the most recent main commit message (vX.Y.Z)
 *   3. unchanged
 */
export async function syncFromGithub(
  project: Project,
  ghToken: string
): Promise<SyncedFields> {
  const sources: string[] = [];
  const out: SyncedFields = { source: sources };

  if (!project.githubRepo) return out;
  const [owner, repo] = project.githubRepo.split('/');
  if (!owner || !repo) return out;

  try {
    const release = await ghJson<{ tag_name: string }>(
      `/repos/${owner}/${repo}/releases/latest`,
      ghToken
    );
    if (release?.tag_name) {
      out.currentVersion = release.tag_name.startsWith('v')
        ? release.tag_name
        : `v${release.tag_name}`;
      sources.push('releases.latest');
    }
  } catch {
    // ignore — fall through to commit message fallback
  }

  if (!out.currentVersion) {
    try {
      const commits = await ghJson<Array<{ commit: { message: string } }>>(
        `/repos/${owner}/${repo}/commits?sha=main&per_page=1`,
        ghToken
      );
      const msg = commits?.[0]?.commit?.message ?? '';
      const m = msg.match(/^v(\d+\.\d+\.\d+(?:[\w.-]+)?)/);
      if (m) {
        out.currentVersion = `v${m[1]}`;
        sources.push('commits.head.message');
      }
    } catch {
      // ignore
    }
  }

  try {
    const runs = await ghJson<{
      workflow_runs?: Array<{ conclusion: string | null; status: string }>;
    }>(`/repos/${owner}/${repo}/actions/runs?branch=main&per_page=1`, ghToken);
    const latest = runs?.workflow_runs?.[0];
    if (latest) {
      if (latest.status === 'in_progress' || latest.status === 'queued') {
        out.status = 'deploying';
      } else if (latest.conclusion === 'success') {
        out.status = 'active';
      } else if (latest.conclusion === 'failure' || latest.conclusion === 'startup_failure') {
        out.status = 'deploy_failed';
      }
      sources.push(`actions.runs.latest=${latest.status}/${latest.conclusion ?? '-'}`);
    }
  } catch {
    // ignore
  }

  return out;
}

/**
 * Compare synced fields against current row, return what would change.
 */
export function diff(project: Project, synced: SyncedFields): SyncResult {
  const before = { currentVersion: project.currentVersion, status: project.status };
  const after = {
    currentVersion: synced.currentVersion ?? project.currentVersion,
    status: synced.status ?? project.status,
  };
  const changed =
    after.currentVersion !== before.currentVersion || after.status !== before.status;
  return {
    key: project.key,
    ok: true,
    changed,
    before,
    after,
    detail: synced.source.length ? synced.source.join(', ') : 'no signals',
  };
}
