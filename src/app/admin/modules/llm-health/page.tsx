import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { loadProviderHealth, tmiBaseUrl } from './lib';
import ProviderCard from './ProviderCard';
import Runbook from './Runbook';

// /admin/modules/llm-health
//
// Baseline troubleshooting/remediation surface for the TMI LLM providers.
// Consumes TMI's provider-health API server-side; renders per-provider status
// cards, a live per-provider key test, and a static remediation runbook.
//
// Degrade-gracefully: the TMI fetch is wrapped (in loadProviderHealth) so an
// unreachable / misconfigured / non-200 TMI renders a clear "unavailable" state
// alongside the runbook — the page never crashes.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function LlmProviderHealthPage() {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/login');
  }

  const health = await loadProviderHealth();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">LLM Provider Health</h1>
          <p className="text-zinc-400 text-sm mt-2">
            Live health, last-error visibility, and a key-test for TMI&apos;s LLM providers. Source:{' '}
            <code className="text-amber-300">{tmiBaseUrl()}/api/internal/provider-health</code>.
          </p>
          {health.ok && (
            <p className="text-xs text-zinc-500 mt-2">
              Generated {new Date(health.data.generatedAt).toISOString().replace('T', ' ').slice(0, 19)}Z
            </p>
          )}
        </header>

        {/* Provider health section — isolated: failure here still shows the runbook below. */}
        {health.ok ? (
          health.data.providers.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-6 text-center text-sm text-zinc-500">
              TMI reported no providers.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {health.data.providers.map((p) => (
                <ProviderCard key={p.providerType} provider={p} />
              ))}
            </div>
          )
        ) : (
          <div className="rounded-lg border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            <div className="font-medium">Provider health unavailable.</div>
            <div className="text-xs text-red-300/80 mt-1 font-mono">{health.error}</div>
            <div className="text-xs text-red-300/60 mt-2">
              The remediation runbook below is still available. If this persists, verify{' '}
              <code className="text-amber-300">TMI_BASE_URL</code> /{' '}
              <code className="text-amber-300">TMI_JOB_SECRET</code> are provisioned and that TMI is
              deployed.
            </div>
          </div>
        )}

        {/* Runbook is always rendered — it is the remediation reference. */}
        <Runbook />
      </div>
    </div>
  );
}
