'use client';

// Per-provider status card: colored status badge, model id, last success
// (relative), 24h success/fail counts, last error (when present), a prominent
// stalled flag, and the Test-key button.

import { AlertTriangle } from 'lucide-react';
import type { ProviderHealth, ProviderStatus } from './lib';
import { relativeTime } from './lib';
import TestKeyButton from './TestKeyButton';

const STATUS_BADGE: Record<ProviderStatus, { label: string; cls: string }> = {
  healthy: { label: 'healthy', cls: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' },
  degraded: { label: 'degraded', cls: 'bg-amber-900/40 text-amber-300 border border-amber-700/30' },
  down: { label: 'down', cls: 'bg-red-900/40 text-red-300 border border-red-700/30' },
  idle: { label: 'idle', cls: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30' },
  not_configured: { label: 'not configured', cls: 'bg-transparent text-zinc-500 border border-zinc-700/60' },
};

export default function ProviderCard({ provider }: { provider: ProviderHealth }) {
  const badge = STATUS_BADGE[provider.status] ?? STATUS_BADGE.idle;
  const { success, failure } = provider.recent24h;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      {/* Header: provider type + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{provider.providerType}</div>
          <div className="text-xs text-zinc-500 font-mono mt-0.5">{provider.modelId || '—'}</div>
        </div>
        <span className={`inline-block text-xs px-2 py-1 rounded-full shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Stalled flag — prominent when set */}
      {provider.stalled && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-red-700/40 bg-red-950/50 px-3 py-2 text-xs font-medium text-red-200">
          <AlertTriangle size={14} className="shrink-0" />
          Stalled — no successful call recently; this provider is not making progress.
        </div>
      )}

      {/* Metrics */}
      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 w-24 shrink-0">last success</span>
          <span className="text-zinc-300">{relativeTime(provider.lastSuccessAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 w-24 shrink-0">24h</span>
          <span className="text-emerald-400">{success} ok</span>
          <span className="text-zinc-600">/</span>
          <span className={failure > 0 ? 'text-red-400' : 'text-zinc-500'}>{failure} fail</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 w-24 shrink-0">configured</span>
          <span className={provider.configured ? 'text-zinc-300' : 'text-amber-400'}>
            {provider.configured ? 'yes' : 'no — secret unset'}
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-500">active</span>
          <span className={provider.active ? 'text-zinc-300' : 'text-zinc-500'}>
            {provider.active ? 'yes' : 'no'}
          </span>
        </div>
      </div>

      {/* Last error (when present) */}
      {provider.lastFailure && (
        <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-block px-2 py-0.5 rounded-full bg-red-900/50 text-red-200 border border-red-700/40">
              {provider.lastFailure.statusClass}
            </span>
            <span className="text-zinc-400 font-mono">
              HTTP {provider.lastFailure.httpStatus ?? '—'}
            </span>
            <span className="text-zinc-500">· {relativeTime(provider.lastFailure.at)}</span>
          </div>
          {provider.lastFailure.message && (
            <div className="mt-1.5 text-red-300/90 break-words">{provider.lastFailure.message}</div>
          )}
        </div>
      )}

      {/* Live key test */}
      <TestKeyButton providerType={provider.providerType} />
    </div>
  );
}
