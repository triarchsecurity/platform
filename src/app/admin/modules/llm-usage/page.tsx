import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { tenantLlmUsage } from '@/db/schema';
import {
  rollupByTenant,
  sortTenants,
  portfolioTotals,
  formatUsd,
  formatCount,
  type UsageRow,
  type KeyPosture,
  type SortKey,
  type TenantUsage,
  type Totals,
} from './rollup';

// /admin/modules/llm-usage
//
// Staff-gated cross-tenant LLM spend / usage / key-posture dashboard. Reads
// tenant_llm_usage (populated by POST /api/platform/ingest/llm-usage, pushed
// daily by each Atlas tenant). The point of this page: surface which tenants
// run on Triarch-MANAGED reasoning keys, because Triarch eats that cost.
//
// SORTING: this is a server component, so sort is driven by the ?sort= search
// param (mtdSpend | daySpend | mtdCalls | tenant). Default is mtdSpend desc.
// To add a new sort column, extend SortKey + sortTenants in ./rollup and add a
// header link below. cost_micros/tokens/calls arrive from CRDB as STRINGS;
// every aggregate is Number()-wrapped in ./rollup before summing.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SORT_KEYS: SortKey[] = ['mtdSpend', 'daySpend', 'mtdCalls', 'tenant'];

function parseSort(raw: string | string[] | undefined): SortKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : 'mtdSpend';
}

function PostureBadge({ label, value }: { label: string; value: string }) {
  const cls =
    value === 'managed'
      ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
      : value === 'byok'
        ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30'
        : 'bg-zinc-800 text-zinc-400 border border-zinc-700/30';
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${cls}`}>
      {label}: {value}
    </span>
  );
}

function PostureRow({ posture }: { posture: KeyPosture | null }) {
  if (!posture) {
    return <span className="text-xs text-zinc-600">no posture reported</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <PostureBadge label="reasoning" value={posture.reasoning} />
      <PostureBadge label="embedding" value={posture.embedding} />
      <span
        className={`inline-block text-xs px-2 py-0.5 rounded-full ${
          posture.reasoningNoTrain
            ? 'bg-sky-900/40 text-sky-300 border border-sky-700/30'
            : 'bg-zinc-800 text-zinc-400 border border-zinc-700/30'
        }`}
      >
        no-train: {posture.reasoningNoTrain ? 'on' : 'off'}
      </span>
    </div>
  );
}

function TotalsCell({ totals }: { totals: Totals }) {
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-zinc-100">{formatUsd(totals.costMicros)}</div>
      <div className="text-xs text-zinc-500">
        {formatCount(totals.tokens)} tok · {formatCount(totals.calls)} calls
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
}) {
  const isActive = active === sortKey;
  return (
    <Link
      href={`/admin/modules/llm-usage?sort=${sortKey}`}
      className={`hover:text-amber-300 ${isActive ? 'text-amber-300' : ''}`}
    >
      {label}
      {isActive ? ' ↓' : ''}
    </Link>
  );
}

async function loadRows(): Promise<{ rows: UsageRow[]; error: string | null }> {
  try {
    const raw = await db
      .select({
        tenantSlug: tenantLlmUsage.tenantSlug,
        periodKind: tenantLlmUsage.periodKind,
        provider: tenantLlmUsage.provider,
        model: tenantLlmUsage.model,
        feature: tenantLlmUsage.feature,
        project: tenantLlmUsage.project,
        costMicros: tenantLlmUsage.costMicros,
        tokens: tenantLlmUsage.tokens,
        calls: tenantLlmUsage.calls,
        keyPosture: tenantLlmUsage.keyPosture,
      })
      .from(tenantLlmUsage);

    const rows: UsageRow[] = raw.map((r) => ({
      tenantSlug: r.tenantSlug,
      periodKind: r.periodKind === 'mtd' ? 'mtd' : 'day',
      provider: r.provider,
      model: r.model,
      feature: r.feature,
      project: r.project,
      costMicros: r.costMicros as unknown as string | number,
      tokens: r.tokens as unknown as string | number,
      calls: r.calls as unknown as string | number,
      keyPosture: (r.keyPosture as KeyPosture | null) ?? null,
    }));
    return { rows, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { rows: [], error: msg };
  }
}

export default async function LlmUsageDashboard({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  const sp = await searchParams;
  const sort = parseSort(sp.sort);

  const { rows, error } = await loadRows();
  const tenantsUnsorted = rollupByTenant(rows);
  const tenants = sortTenants(tenantsUnsorted, sort);

  const portfolioDay = portfolioTotals(tenants, 'day');
  const portfolioMtd = portfolioTotals(tenants, 'mtd');
  const managedCount = tenants.filter((t) => t.keyPosture?.reasoning === 'managed').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">LLM Usage — Cross-Tenant</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Per-tenant LLM spend, token usage, call volume, and key posture. Each tenant pushes a
            daily summary; amber-highlighted tenants run on Triarch-managed reasoning keys, which
            means Triarch pays for that spend.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            <div className="font-medium">Could not load tenant usage.</div>
            <div className="text-xs text-red-300/80 mt-1 font-mono">{error}</div>
          </div>
        )}

        {/* Portfolio totals */}
        <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Portfolio — last 24h
            </div>
            <div className="text-3xl font-bold font-mono text-zinc-100">
              {formatUsd(portfolioDay.costMicros)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {formatCount(portfolioDay.tokens)} tokens · {formatCount(portfolioDay.calls)} calls
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Portfolio — month to date
            </div>
            <div className="text-3xl font-bold font-mono text-zinc-100">
              {formatUsd(portfolioMtd.costMicros)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {formatCount(portfolioMtd.tokens)} tokens · {formatCount(portfolioMtd.calls)} calls
            </div>
          </div>
        </div>

        {managedCount > 0 && (
          <div className="mb-6 rounded-lg border border-amber-700/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            {managedCount} tenant{managedCount !== 1 ? 's' : ''} running on Triarch-managed reasoning
            keys. Triarch pays for the highlighted spend below.
          </div>
        )}

        {tenants.length === 0 && !error ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-10 text-center">
            <div className="text-zinc-300 font-medium">No tenant usage reported yet.</div>
            <div className="text-zinc-500 text-sm mt-1">
              Tenants push a usage summary once per day. Rows will appear here after the first push.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">
                    <SortHeader label="Tenant" sortKey="tenant" active={sort} />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Key posture</th>
                  <th className="text-left px-4 py-3 font-medium">
                    <SortHeader label="Last 24h" sortKey="daySpend" active={sort} />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    <SortHeader label="Month to date" sortKey="mtdSpend" active={sort} />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    <SortHeader label="Calls (MTD)" sortKey="mtdCalls" active={sort} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {tenants.map((t: TenantUsage) => {
                  const managed = t.keyPosture?.reasoning === 'managed';
                  return (
                    <tr
                      key={t.tenantSlug}
                      className={managed ? 'bg-amber-950/20 hover:bg-amber-950/30' : 'hover:bg-zinc-900/40'}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-zinc-100">{t.tenantSlug}</div>
                        {managed && (
                          <span className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Triarch-managed - Triarch pays
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <PostureRow posture={t.keyPosture} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <TotalsCell totals={t.day.totals} />
                        <ProviderModelBreakdown rollup={t.day.byProviderModel} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <TotalsCell totals={t.mtd.totals} />
                        <ProviderModelBreakdown rollup={t.mtd.byProviderModel} />
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-zinc-300">
                        {formatCount(t.mtd.totals.calls)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="mt-6 text-xs text-zinc-500">
          Source: <code className="text-amber-300">tenant_llm_usage</code> · ingest:{' '}
          <code className="text-amber-300">POST /api/platform/ingest/llm-usage</code> (x-ingest-secret).
          Default sort: month-to-date spend, descending.
        </footer>
      </div>
    </div>
  );
}

function ProviderModelBreakdown({
  rollup,
}: {
  rollup: TenantUsage['day']['byProviderModel'];
}) {
  if (rollup.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-zinc-500 hover:text-amber-300">
        {rollup.length} model{rollup.length !== 1 ? 's' : ''}
      </summary>
      <table className="mt-1 w-full text-xs">
        <tbody>
          {rollup.map((pm) => (
            <tr key={`${pm.provider} ${pm.model}`} className="text-zinc-400">
              <td className="pr-3 py-0.5 align-top">
                <span className="text-zinc-300">{pm.provider}</span>
                <span className="text-zinc-500"> / {pm.model}</span>
              </td>
              <td className="py-0.5 align-top font-mono text-right whitespace-nowrap">
                {formatUsd(pm.totals.costMicros)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
