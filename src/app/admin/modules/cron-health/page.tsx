import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { readAllTenantCronHealth, type TenantCronResult } from '@/lib/cron-health/reader';
import type { CronHealth, CronJobStatus } from '@/lib/cron-health/diff';

// /admin/modules/cron-health
//
// Central cron-health dashboard. For each known tenant we query Google Cloud
// Scheduler DIRECTLY (see src/lib/cron-health/reader.ts) and diff the actual
// jobs against the canonical EXPECTED_CRON_JOBS suite. The win over a
// tenant-push design: we catch MISSING / disabled crons even when nothing is
// running (today Revolution Cyber and Eve have ZERO scheduler jobs, so they
// light up red here).
//
// Per-tenant error isolation: one project failing (or having Scheduler
// disabled / no access) renders a distinct state for that section without
// breaking the page. Auth is fail-closed (staff only); per-project queries
// fail-open (show the error state, never crash).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEALTH_DOT: Record<CronHealth, string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red: 'bg-red-500',
};

const STATE_PILL: Record<CronJobStatus['state'] & string, string> = {
  enabled: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30',
  paused: 'bg-amber-900/40 text-amber-300 border border-amber-700/40',
  disabled: 'bg-amber-900/40 text-amber-300 border border-amber-700/40',
  unknown: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30',
};

function fmtTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function StateBadge({ status }: { status: CronJobStatus }) {
  if (!status.present) {
    return (
      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-300 border border-red-700/30">
        missing
      </span>
    );
  }
  const cls = status.state ? STATE_PILL[status.state] : STATE_PILL.unknown;
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${cls}`}>
      {status.state ?? 'unknown'}
    </span>
  );
}

function tenantHealth(r: TenantCronResult): CronHealth {
  if (r.state !== 'ok' || !r.diff) return 'red';
  if (r.diff.missingCount > 0 || r.diff.failingCount > 0) return 'red';
  if (r.diff.pausedOrStaleCount > 0) return 'amber';
  return 'green';
}

function TenantSection({ r }: { r: TenantCronResult }) {
  const health = tenantHealth(r);

  return (
    <section className="rounded-lg border border-zinc-800 overflow-hidden">
      <header className="flex items-center justify-between gap-3 bg-zinc-900 px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${HEALTH_DOT[health]}`} />
          <div>
            <div className="font-medium text-zinc-100">{r.tenant.displayName}</div>
            <div className="text-xs text-zinc-500 font-mono">
              {r.tenant.gcpProject} · {r.tenant.location}
            </div>
          </div>
        </div>
        <div className="text-xs text-zinc-400">
          {r.state === 'ok' && r.diff ? (
            <span>
              {r.diff.missingCount} missing · {r.diff.failingCount} failing ·{' '}
              {r.diff.pausedOrStaleCount} paused/stale · {r.jobCount} jobs found
            </span>
          ) : r.state === 'no_access' ? (
            <span className="text-red-300">scheduler not enabled / no access</span>
          ) : (
            <span className="text-red-300">query error</span>
          )}
        </div>
      </header>

      {r.state !== 'ok' && (
        <div className="px-4 py-3 text-sm text-red-200 bg-red-950/30 border-b border-red-900/30">
          <div className="font-medium">
            {r.state === 'no_access'
              ? 'Cloud Scheduler is not enabled on this project, or the platform SA lacks access.'
              : 'Could not query Cloud Scheduler for this project.'}
          </div>
          {r.error && <div className="text-xs text-red-300/80 mt-1 font-mono">{r.error}</div>}
          <div className="text-xs text-red-300/70 mt-1">
            All expected crons are effectively dark until this is resolved (operator step in PR body).
          </div>
        </div>
      )}

      {r.state === 'ok' && r.diff && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Expected job</th>
                <th className="text-left px-4 py-2 font-medium">State</th>
                <th className="text-left px-4 py-2 font-medium">Schedule</th>
                <th className="text-left px-4 py-2 font-medium">Last attempt</th>
                <th className="text-left px-4 py-2 font-medium">Last status</th>
                <th className="text-left px-4 py-2 font-medium">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {r.diff.jobs.map((j) => (
                <tr key={j.key} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-2 align-top">
                    <span className="font-mono text-zinc-200">{j.key}</span>
                    {j.matchedJobName && j.matchedJobName !== j.key && (
                      <div className="text-[11px] text-zinc-600 font-mono mt-0.5">
                        matched: {j.matchedJobName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <StateBadge status={j} />
                  </td>
                  <td className="px-4 py-2 align-top font-mono text-xs text-zinc-400">
                    {j.schedule ?? '—'}
                  </td>
                  <td className="px-4 py-2 align-top text-xs text-zinc-400">
                    {fmtTime(j.lastAttemptTime)}
                  </td>
                  <td className="px-4 py-2 align-top text-xs">
                    {!j.present ? (
                      <span className="text-zinc-600">—</span>
                    ) : j.lastRunOk === null ? (
                      <span className="text-zinc-500">no run yet</span>
                    ) : j.lastRunOk ? (
                      <span className="text-emerald-300">success</span>
                    ) : (
                      <span className="text-red-300">fail</span>
                    )}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <span className="inline-flex items-center gap-2" title={j.detail}>
                      <span className={`inline-block w-2 h-2 rounded-full ${HEALTH_DOT[j.health]}`} />
                      <span className="text-xs text-zinc-400">{j.detail}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {r.diff.extraJobs.length > 0 && (
            <div className="px-4 py-2 text-xs text-zinc-500 border-t border-zinc-800">
              Extra jobs (not in expected suite):{' '}
              <span className="font-mono text-zinc-400">{r.diff.extraJobs.join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default async function CronHealthDashboard() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  const results = await readAllTenantCronHealth();

  const darkTenants = results.filter((r) => tenantHealth(r) === 'red');
  const amberTenants = results.filter((r) => tenantHealth(r) === 'amber');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Cron Health — Cross-Tenant</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Per-tenant scheduled-job health, read live from Google Cloud Scheduler. Each tenant's
            actual jobs are diffed against the canonical expected cron suite, so this catches
            missing or disabled crons even when nothing is running. Green means enabled with a
            recent success, amber means paused or stale, red means missing, failing, or scheduler
            not enabled.
          </p>
        </header>

        {/* Top summary */}
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Tenants</div>
            <div className="text-3xl font-bold font-mono text-zinc-100">{results.length}</div>
          </div>
          <div
            className={`rounded-lg border p-4 ${
              darkTenants.length > 0 ? 'border-red-700/40 bg-red-950/30' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Tenants with dark crons</div>
            <div
              className={`text-3xl font-bold font-mono ${
                darkTenants.length > 0 ? 'text-red-300' : 'text-emerald-300'
              }`}
            >
              {darkTenants.length}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Tenants paused/stale</div>
            <div className="text-3xl font-bold font-mono text-amber-300">{amberTenants.length}</div>
          </div>
        </div>

        {darkTenants.length > 0 && (
          <div className="mb-6 rounded-lg border border-red-700/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            <div className="font-medium">
              {darkTenants.length} tenant{darkTenants.length !== 1 ? 's have' : ' has'} missing,
              failing, or dark crons.
            </div>
            <div className="text-xs text-red-300/80 mt-1">
              {darkTenants.map((r) => r.tenant.displayName).join(', ')}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {results.map((r) => (
            <TenantSection key={r.tenant.slug} r={r} />
          ))}
        </div>

        <footer className="mt-6 text-xs text-zinc-500">
          Source: live{' '}
          <code className="text-amber-300">
            GET cloudscheduler.googleapis.com/v1/projects/{'{project}'}/locations/{'{location}'}/jobs
          </code>{' '}
          per tenant, authenticated with the platform runtime service account. Expected suite and
          tenant registry: <code className="text-amber-300">src/lib/cron-health/tenants.ts</code>.
        </footer>
      </div>
    </div>
  );
}
