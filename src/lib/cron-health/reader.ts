// src/lib/cron-health/reader.ts
//
// Server-side Cloud Scheduler reader for the cron-health dashboard.
//
// For each tenant GCP project we call the Cloud Scheduler list API:
//   GET https://cloudscheduler.googleapis.com/v1/projects/{p}/locations/{l}/jobs
// authenticated with the platform runtime SA's access token (minted by
// mintFahAccessToken — already scoped to cloud-platform, which covers Scheduler).
//
// Per-project error isolation is the whole point: if Scheduler is not enabled or
// the SA lacks access on a project, we return a DISTINCT 'no_access' result for
// that tenant (the RC/Eve signal today) WITHOUT crashing the page or affecting
// other tenants.

import { mintFahAccessToken } from '@/lib/fah-rollout';
import { diffCronJobs, type SchedulerJob, type TenantDiff } from './diff';
import { CRON_HEALTH_TENANTS, type CronHealthTenant } from './tenants';

const SCHEDULER_API_BASE = 'https://cloudscheduler.googleapis.com/v1';

export type TenantQueryState =
  | 'ok'
  | 'no_access' // API disabled OR permission denied — scheduler is "dark"
  | 'error'; // unexpected failure (network, parse, token mint)

export interface TenantCronResult {
  tenant: CronHealthTenant;
  state: TenantQueryState;
  diff: TenantDiff | null;
  jobCount: number;
  error: string | null;
}

interface SchedulerListResponse {
  jobs?: SchedulerJob[];
  nextPageToken?: string;
}

/** Classify a non-OK Scheduler HTTP response into a tenant query state. */
function classifyHttpError(status: number, body: string): { state: TenantQueryState; error: string } {
  // 403 with SERVICE_DISABLED, or 404 on the location, both mean "scheduler not
  // enabled / no access" from the operator's point of view.
  if (status === 403 || status === 404) {
    return {
      state: 'no_access',
      error: `Scheduler not enabled or no access (HTTP ${status}): ${body.slice(0, 300)}`,
    };
  }
  return { state: 'error', error: `Scheduler list failed (HTTP ${status}): ${body.slice(0, 300)}` };
}

/** Query one tenant project. Never throws — always resolves to a result. */
export async function readTenantCronHealth(
  tenant: CronHealthTenant,
  now: number = Date.now(),
): Promise<TenantCronResult> {
  try {
    const token = await mintFahAccessToken();

    const jobs: SchedulerJob[] = [];
    let pageToken: string | undefined;

    // Paginate defensively, though tenants have well under one page of jobs.
    do {
      const url = new URL(
        `${SCHEDULER_API_BASE}/projects/${tenant.gcpProject}/locations/${tenant.location}/jobs`,
      );
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const body = await res.text();
        const { state, error } = classifyHttpError(res.status, body);
        return { tenant, state, diff: null, jobCount: 0, error };
      }

      const data = (await res.json()) as SchedulerListResponse;
      if (Array.isArray(data.jobs)) jobs.push(...data.jobs);
      pageToken = data.nextPageToken;
    } while (pageToken);

    const diff = diffCronJobs(jobs, now);
    return { tenant, state: 'ok', diff, jobCount: jobs.length, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { tenant, state: 'error', diff: null, jobCount: 0, error: msg };
  }
}

/** Read all registered tenants concurrently with per-tenant isolation. */
export async function readAllTenantCronHealth(now: number = Date.now()): Promise<TenantCronResult[]> {
  return Promise.all(CRON_HEALTH_TENANTS.map((t) => readTenantCronHealth(t, now)));
}
