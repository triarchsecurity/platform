// src/lib/cron-health/tenants.ts
//
// Tenant registry + canonical expected-cron suite for the central cron-health
// dashboard (/admin/modules/cron-health).
//
// The dashboard queries Google Cloud Scheduler DIRECTLY per tenant GCP project,
// so it can flag MISSING / disabled crons even when nothing is running (the
// exact gap today: Revolution Cyber and Eve currently have ZERO scheduler
// jobs). To add a tenant, append a row to CRON_HEALTH_TENANTS; to add an
// expected job, append a key to EXPECTED_CRON_JOBS.

export interface CronHealthTenant {
  slug: string;
  displayName: string;
  gcpProject: string;
  location: string;
}

// Known tenants. gcpProject is the GCP project that owns the tenant's Cloud
// Scheduler jobs; location is the Scheduler region (all tenants use us-central1
// today). Extend this list as new tenants are provisioned.
export const CRON_HEALTH_TENANTS: CronHealthTenant[] = [
  {
    slug: 'triarch',
    displayName: 'Triarch (tenant #0)',
    gcpProject: 'triarchsecurity-atlas',
    location: 'us-central1',
  },
  {
    slug: 'revolutioncyber',
    displayName: 'Revolution Cyber',
    gcpProject: 'revolutioncyber-triarchcrm',
    location: 'us-central1',
  },
  {
    slug: 'evesecurity',
    displayName: 'Eve Security',
    gcpProject: 'evesecurity-triarchcrm',
    location: 'us-central1',
  },
];

// The canonical per-tenant job set. Each entry is matched LOOSELY against the
// trailing path segment / job key of a Cloud Scheduler job name, because
// tenants name jobs inconsistently (e.g. `<slug>-<job>` or `atlas-<env>-<job>`
// or a bare `<job>`). See matchExpectedKey in diff.ts for the matching rule.
export const EXPECTED_CRON_JOBS = [
  'connector-sync',
  'event-dispatcher',
  'workflow-dispatcher',
  'workflow-enroll',
  'workflow-tick',
  'workflow-enrich',
  'embedding-refresh',
  'pipeline-snapshot',
  'invoice-overdue-sweep',
  'retention-purge',
  'foundry-ledger-scan',
  'llm-usage-report',
] as const;

export type ExpectedCronKey = (typeof EXPECTED_CRON_JOBS)[number];
