// src/lib/cron-health/diff.ts
//
// Pure expected-vs-actual diff logic for the cron-health dashboard.
//
// Given the canonical EXPECTED_CRON_JOBS list and the ACTUAL jobs returned by
// the Cloud Scheduler list API for one tenant project, produce a per-expected-job
// status row (including 'missing' for jobs that should exist but don't), plus a
// list of "extra" actual jobs that don't map to any expected key.
//
// This file has NO I/O and NO framework imports so it is trivially unit-tested.

import { EXPECTED_CRON_JOBS, type ExpectedCronKey } from './tenants';

// ─── Cloud Scheduler shapes (only the fields we read) ───────────────────────

// https://cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs
export interface SchedulerJob {
  // Full resource name: projects/{p}/locations/{l}/jobs/{jobId}
  name: string;
  schedule?: string;
  state?: 'ENABLED' | 'PAUSED' | 'DISABLED' | 'UPDATE_FAILED' | 'STATE_UNSPECIFIED' | string;
  lastAttemptTime?: string;
  // status mirrors a google.rpc.Status; code 0 / absent == last run OK.
  status?: { code?: number; message?: string };
}

// ─── Output shapes ──────────────────────────────────────────────────────────

export type CronHealth = 'green' | 'amber' | 'red';

export interface CronJobStatus {
  key: ExpectedCronKey;
  present: boolean;
  state: 'enabled' | 'paused' | 'disabled' | 'unknown' | null; // null when missing
  schedule: string | null;
  lastAttemptTime: string | null;
  lastRunOk: boolean | null; // null when never run or missing
  health: CronHealth;
  detail: string;
  matchedJobName: string | null; // the actual scheduler job id we matched, if any
}

export interface TenantDiff {
  jobs: CronJobStatus[];
  extraJobs: string[]; // actual job ids that matched no expected key
  missingCount: number;
  failingCount: number;
  pausedOrStaleCount: number;
}

// Considered "stale" if the last attempt is older than this and no newer success.
// 48h covers daily/hourly crons with generous slack for weekend gaps.
const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Trailing job id from a Cloud Scheduler resource name (or the raw value). */
export function jobIdFromName(name: string): string {
  const idx = name.lastIndexOf('/');
  return idx >= 0 ? name.slice(idx + 1) : name;
}

/**
 * Loose match: an expected key matches an actual job id if the id equals the
 * key, or ends with `-<key>` (so `atlas-prod-connector-sync` and
 * `triarch-connector-sync` and `connector-sync` all match 'connector-sync').
 * Comparison is case-insensitive.
 */
export function matchExpectedKey(jobId: string, key: ExpectedCronKey): boolean {
  const id = jobId.toLowerCase();
  const k = key.toLowerCase();
  return id === k || id.endsWith(`-${k}`);
}

function normalizeState(state: string | undefined): CronJobStatus['state'] {
  switch ((state ?? '').toUpperCase()) {
    case 'ENABLED':
      return 'enabled';
    case 'PAUSED':
      return 'paused';
    case 'DISABLED':
      return 'disabled';
    case '':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function lastRunOk(job: SchedulerJob): boolean | null {
  if (!job.lastAttemptTime) return null;
  // google.rpc.Status: absent or code 0 == OK.
  const code = job.status?.code;
  return code === undefined || code === 0;
}

function isStale(lastAttemptTime: string | null, now: number): boolean {
  if (!lastAttemptTime) return true; // enabled-but-never-ran counts as stale
  const t = Date.parse(lastAttemptTime);
  if (Number.isNaN(t)) return true;
  return now - t > STALE_AFTER_MS;
}

// ─── Core diff ──────────────────────────────────────────────────────────────

/**
 * Diff the expected cron suite against the actual scheduler jobs for one tenant.
 * `now` is injectable for deterministic tests.
 */
export function diffCronJobs(actual: SchedulerJob[], now: number = Date.now()): TenantDiff {
  const actualIds = actual.map((j) => jobIdFromName(j.name));
  const matchedActualIdx = new Set<number>();

  const jobs: CronJobStatus[] = EXPECTED_CRON_JOBS.map((key) => {
    const idx = actualIds.findIndex((id, i) => !matchedActualIdx.has(i) && matchExpectedKey(id, key));

    if (idx === -1) {
      return {
        key,
        present: false,
        state: null,
        schedule: null,
        lastAttemptTime: null,
        lastRunOk: null,
        health: 'red' as CronHealth,
        detail: 'Missing — no scheduler job matches this expected cron.',
        matchedJobName: null,
      };
    }

    matchedActualIdx.add(idx);
    const job = actual[idx];
    const state = normalizeState(job.state);
    const okFlag = lastRunOk(job);
    const lastAttempt = job.lastAttemptTime ?? null;
    const stale = isStale(lastAttempt, now);

    let health: CronHealth;
    let detail: string;

    if (state === 'paused' || state === 'disabled') {
      health = 'amber';
      detail = `Job is ${state}.`;
    } else if (okFlag === false) {
      health = 'red';
      detail = `Last run failed${job.status?.message ? `: ${job.status.message}` : '.'}`;
    } else if (state === 'enabled' && lastAttempt && !stale) {
      health = 'green';
      detail = 'Enabled, recent successful run.';
    } else if (state === 'enabled' && stale) {
      health = 'amber';
      detail = lastAttempt
        ? 'Enabled but last run is stale (>48h).'
        : 'Enabled but has never run.';
    } else {
      // unknown state, present but unclassifiable
      health = 'amber';
      detail = 'Present, state could not be classified.';
    }

    return {
      key,
      present: true,
      state,
      schedule: job.schedule ?? null,
      lastAttemptTime: lastAttempt,
      lastRunOk: okFlag,
      health,
      detail,
      matchedJobName: actualIds[idx],
    };
  });

  const extraJobs = actualIds.filter((_, i) => !matchedActualIdx.has(i));

  return {
    jobs,
    extraJobs,
    missingCount: jobs.filter((j) => !j.present).length,
    failingCount: jobs.filter((j) => j.present && j.lastRunOk === false).length,
    pausedOrStaleCount: jobs.filter((j) => j.present && j.health === 'amber').length,
  };
}
