import { describe, it, expect } from 'vitest';
import {
  diffCronJobs,
  jobIdFromName,
  matchExpectedKey,
  type SchedulerJob,
} from './diff';
import { EXPECTED_CRON_JOBS } from './tenants';

// Fixed "now" so stale checks are deterministic.
const NOW = Date.parse('2026-06-17T12:00:00Z');
const recent = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h ago
const stale = new Date(NOW - 72 * 60 * 60 * 1000).toISOString(); // 72h ago

function job(over: Partial<SchedulerJob>): SchedulerJob {
  return {
    name: 'projects/p/locations/us-central1/jobs/triarch-connector-sync',
    schedule: '*/15 * * * *',
    state: 'ENABLED',
    lastAttemptTime: recent,
    status: { code: 0 },
    ...over,
  };
}

describe('jobIdFromName', () => {
  it('extracts the trailing job id from a full resource name', () => {
    expect(jobIdFromName('projects/p/locations/l/jobs/atlas-prod-connector-sync')).toBe(
      'atlas-prod-connector-sync',
    );
  });
  it('returns the raw value when there is no slash', () => {
    expect(jobIdFromName('connector-sync')).toBe('connector-sync');
  });
});

describe('matchExpectedKey — loose suffix matching', () => {
  it('matches exact bare names', () => {
    expect(matchExpectedKey('connector-sync', 'connector-sync')).toBe(true);
  });
  it('matches <slug>-<job> prefixing', () => {
    expect(matchExpectedKey('triarch-connector-sync', 'connector-sync')).toBe(true);
  });
  it('matches atlas-<env>-<job> prefixing', () => {
    expect(matchExpectedKey('atlas-prod-connector-sync', 'connector-sync')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(matchExpectedKey('Atlas-PROD-Connector-Sync', 'connector-sync')).toBe(true);
  });
  it('does not match a different job', () => {
    expect(matchExpectedKey('triarch-workflow-tick', 'connector-sync')).toBe(false);
  });
  it('does not partial-match without a hyphen boundary', () => {
    expect(matchExpectedKey('xconnector-sync', 'connector-sync')).toBe(false);
  });
});

describe('diffCronJobs — missing detection (the RC/Eve signal)', () => {
  it('flags every expected job as missing when there are zero actual jobs', () => {
    const d = diffCronJobs([], NOW);
    expect(d.jobs).toHaveLength(EXPECTED_CRON_JOBS.length);
    expect(d.missingCount).toBe(EXPECTED_CRON_JOBS.length);
    expect(d.jobs.every((j) => j.present === false)).toBe(true);
    expect(d.jobs.every((j) => j.health === 'red')).toBe(true);
    expect(d.jobs.every((j) => j.state === null)).toBe(true);
  });

  it('flags a single missing job among present ones', () => {
    const actual = EXPECTED_CRON_JOBS.filter((k) => k !== 'retention-purge').map((k) =>
      job({ name: `projects/p/locations/us-central1/jobs/triarch-${k}` }),
    );
    const d = diffCronJobs(actual, NOW);
    expect(d.missingCount).toBe(1);
    const purge = d.jobs.find((j) => j.key === 'retention-purge')!;
    expect(purge.present).toBe(false);
    expect(purge.health).toBe('red');
  });
});

describe('diffCronJobs — per-job health classification', () => {
  it('green: enabled + recent success', () => {
    const d = diffCronJobs(
      [job({ name: 'projects/p/locations/l/jobs/triarch-connector-sync', state: 'ENABLED', lastAttemptTime: recent, status: { code: 0 } })],
      NOW,
    );
    const r = d.jobs.find((j) => j.key === 'connector-sync')!;
    expect(r.present).toBe(true);
    expect(r.state).toBe('enabled');
    expect(r.lastRunOk).toBe(true);
    expect(r.health).toBe('green');
  });

  it('amber: paused job', () => {
    const d = diffCronJobs(
      [job({ name: 'projects/p/locations/l/jobs/triarch-workflow-tick', state: 'PAUSED' })],
      NOW,
    );
    const r = d.jobs.find((j) => j.key === 'workflow-tick')!;
    expect(r.state).toBe('paused');
    expect(r.health).toBe('amber');
    expect(d.pausedOrStaleCount).toBeGreaterThanOrEqual(1);
  });

  it('amber: enabled but stale last run', () => {
    const d = diffCronJobs(
      [job({ name: 'projects/p/locations/l/jobs/triarch-embedding-refresh', state: 'ENABLED', lastAttemptTime: stale, status: { code: 0 } })],
      NOW,
    );
    const r = d.jobs.find((j) => j.key === 'embedding-refresh')!;
    expect(r.health).toBe('amber');
  });

  it('amber: enabled but never ran', () => {
    const d = diffCronJobs(
      [job({ name: 'projects/p/locations/l/jobs/triarch-pipeline-snapshot', state: 'ENABLED', lastAttemptTime: undefined, status: undefined })],
      NOW,
    );
    const r = d.jobs.find((j) => j.key === 'pipeline-snapshot')!;
    expect(r.lastRunOk).toBeNull();
    expect(r.health).toBe('amber');
  });

  it('red: last run failed', () => {
    const d = diffCronJobs(
      [job({ name: 'projects/p/locations/l/jobs/triarch-invoice-overdue-sweep', state: 'ENABLED', lastAttemptTime: recent, status: { code: 13, message: 'boom' } })],
      NOW,
    );
    const r = d.jobs.find((j) => j.key === 'invoice-overdue-sweep')!;
    expect(r.lastRunOk).toBe(false);
    expect(r.health).toBe('red');
    expect(r.detail).toContain('boom');
    expect(d.failingCount).toBe(1);
  });
});

describe('diffCronJobs — extra jobs', () => {
  it('surfaces actual jobs that match no expected key', () => {
    const d = diffCronJobs(
      [job({ name: 'projects/p/locations/l/jobs/triarch-some-bespoke-job' })],
      NOW,
    );
    expect(d.extraJobs).toContain('triarch-some-bespoke-job');
  });
});
