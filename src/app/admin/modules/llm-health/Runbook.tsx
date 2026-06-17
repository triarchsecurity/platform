// Static remediation runbook: error-class → fix decision tree.
// Pure presentational; rendered server-side alongside the page (and also shown
// when TMI is unavailable, so the runbook is always reachable).

const ROWS: {
  statusClass: string;
  http: string;
  cls: string;
  meaning: string;
  fix: React.ReactNode;
}[] = [
  {
    statusClass: 'auth',
    http: '401 / 403',
    cls: 'bg-red-900/40 text-red-300 border border-red-700/30',
    meaning: 'The provider key is invalid, expired, or revoked.',
    fix: (
      <>
        Rotate the key, then roll the backend:
        <pre className="mt-2 whitespace-pre-wrap rounded bg-black/40 p-2 text-[11px] text-amber-200">
{`firebase apphosting:secrets:set ANTHROPIC_API_KEY --project triarch-dev-tmi
# (or GEMINI_API_KEY / OPENAI_API_KEY for the other providers)
# grant the backend access to the new secret version, then:
firebase apphosting:rollouts:create tmi --git-branch main --project triarch-dev-tmi`}
        </pre>
        <span className="mt-2 block text-zinc-500">
          The in-process circuit breaker (threshold 3 fails / 5 min) self-clears on the new
          instances after the rollout.
        </span>
      </>
    ),
  },
  {
    statusClass: 'rate',
    http: '429 / quota',
    cls: 'bg-amber-900/40 text-amber-300 border border-amber-700/30',
    meaning: 'Transient provider capacity or quota ("high demand" / 429).',
    fix: (
      <>
        Usually self-heals — wait and re-check. If persistent, check the provider&apos;s quota /
        billing dashboard.
        <span className="mt-2 block text-zinc-500">
          Note: one provider failing can overload the next via failover, so a sustained rate error
          on one provider may show up as load on another.
        </span>
      </>
    ),
  },
  {
    statusClass: 'server',
    http: '5xx',
    cls: 'bg-orange-900/40 text-orange-300 border border-orange-700/30',
    meaning: 'Provider-side outage.',
    fix: <>Wait and monitor — nothing to rotate. Check the provider&apos;s status page.</>,
  },
  {
    statusClass: 'not_configured',
    http: '—',
    cls: 'bg-zinc-800 text-zinc-400 border border-zinc-700/30',
    meaning: "The provider's apiKeyEnv secret is unset or empty.",
    fix: (
      <>
        Set the provider&apos;s API-key secret (same{' '}
        <code className="text-amber-300">apphosting:secrets:set</code> + grant + rollout flow as the{' '}
        <span className="text-red-300">auth</span> case above), then roll the backend.
      </>
    ),
  },
];

export default function Runbook() {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-1">
        Remediation Runbook
      </h2>
      <p className="text-xs text-zinc-500 mb-4">
        Map the provider&apos;s <span className="font-mono">statusClass</span> / last error to the fix.
      </p>

      <div className="space-y-3">
        {ROWS.map((row) => (
          <div
            key={row.statusClass}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-block text-xs px-2 py-1 rounded-full ${row.cls}`}>
                {row.statusClass}
              </span>
              <span className="text-xs text-zinc-500 font-mono">{row.http}</span>
              <span className="text-sm text-zinc-200">{row.meaning}</span>
            </div>
            <div className="mt-2 text-xs text-zinc-400 leading-relaxed">{row.fix}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
