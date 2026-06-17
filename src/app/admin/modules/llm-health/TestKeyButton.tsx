'use client';

// Per-provider "Test key" button. Calls the staff-gated internal proxy
// (/api/admin/llm-health/test) which runs a live key-test against TMI and
// returns the result. Uses the house save pattern: local useState busy flag +
// fetch + router.refresh() (NOT useFormStatus — the repo standardises on this).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import type { ProviderTestResult, StatusClass } from './lib';

interface Props {
  providerType: string;
}

type InlineResult =
  | (ProviderTestResult & { kind: 'result' })
  | { kind: 'error'; message: string };

const STATUS_CLASS_STYLE: Record<StatusClass, string> = {
  ok: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30',
  auth: 'bg-red-900/40 text-red-300 border border-red-700/30',
  rate: 'bg-amber-900/40 text-amber-300 border border-amber-700/30',
  server: 'bg-orange-900/40 text-orange-300 border border-orange-700/30',
  not_configured: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30',
  other: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30',
};

export default function TestKeyButton({ providerType }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InlineResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/llm-health/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType }),
      });
      const data = await res.json();
      if (!res.ok || typeof data?.statusClass !== 'string') {
        setResult({
          kind: 'error',
          message: typeof data?.error === 'string' ? data.error : `Test failed (HTTP ${res.status}).`,
        });
      } else {
        setResult({ kind: 'result', ...(data as ProviderTestResult) });
        // Refresh the page so the health cards pick up the new success/failure
        // that TMI just recorded from the test.
        router.refresh();
      }
    } catch (err) {
      setResult({ kind: 'error', message: err instanceof Error ? err.message : 'Network error.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
        {busy ? 'Testing…' : 'Test key'}
      </button>

      {result?.kind === 'error' && (
        <div className="mt-2 text-xs text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-3 py-2">
          {result.message}
        </div>
      )}

      {result?.kind === 'result' && (
        <div className="mt-2 text-xs bg-zinc-900/60 border border-zinc-800 rounded-md px-3 py-2 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block px-2 py-0.5 rounded-full ${STATUS_CLASS_STYLE[result.statusClass] ?? STATUS_CLASS_STYLE.other}`}
            >
              {result.ok ? 'pass' : 'fail'} · {result.statusClass}
            </span>
            <span className="text-zinc-400 font-mono">
              HTTP {result.httpStatus ?? '—'} · {result.latencyMs}ms
            </span>
          </div>
          {result.message && <div className="text-zinc-400">{result.message}</div>}
        </div>
      )}
    </div>
  );
}
