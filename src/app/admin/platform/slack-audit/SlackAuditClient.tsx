'use client';

/**
 * Phase 7 OTTOBOT-06 — Slack action audit viewer client component.
 *
 * Renders a filterable, paginated table of slack_action_audit rows.
 *
 * Per CONTEXT D-25: 4 filter inputs at top — action_id (exact), actor_email
 *                   (ILIKE substring), from/to date range. Defaults: last 7 days.
 * Per CONTEXT D-26: load-more button, 50 rows/page (page.tsx fetches 51 to detect).
 * Per CONTEXT D-27: row collapsed shows created_at, action_id, actor_email,
 *                   actor_slack_id, response_status (color-coded), latency_ms.
 *                   Click expands to show payload_hash.
 * Per CONTEXT D-28: default sort created_at DESC (handled server-side).
 *
 * URL state: filter values mirrored to query string via router.push so a
 * filtered view is shareable (RESEARCH §9). Filters push on change via useEffect.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuditRow {
  id: string;
  actionId: string;
  actorEmail: string | null;
  actorSlackId: string;
  payloadHash: string;
  responseStatus: number;
  latencyMs: number;
  createdAt: string | Date;
}

export interface SlackAuditClientProps {
  initialRows: AuditRow[];
  initialHasMore: boolean;
  initialFilters?: {
    actionId?: string;
    email?: string;
    from?: string;
    to?: string;
  };
}

function statusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return 'bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs';
  }
  if (status >= 400 && status < 500) {
    return 'bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs';
  }
  if (status >= 500) {
    return 'bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs';
  }
  return 'bg-zinc-700 text-zinc-400 border border-zinc-600 px-2 py-0.5 rounded text-xs';
}

function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

export default function SlackAuditClient({
  initialRows,
  initialHasMore,
  initialFilters,
}: SlackAuditClientProps) {
  const router = useRouter();

  // Filter state (URL-mirrored)
  const [actionIdFilter, setActionIdFilter] = useState(initialFilters?.actionId ?? '');
  const [emailFilter, setEmailFilter] = useState(initialFilters?.email ?? '');
  const [fromFilter, setFromFilter] = useState(initialFilters?.from ?? '');
  const [toFilter, setToFilter] = useState(initialFilters?.to ?? '');

  // Table state
  const [rows, setRows] = useState<AuditRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Mirror filter state to URL search params via router.push
  useEffect(() => {
    const params = new URLSearchParams();
    if (actionIdFilter) params.set('action_id', actionIdFilter);
    if (emailFilter) params.set('email', emailFilter);
    if (fromFilter) params.set('from', fromFilter);
    if (toFilter) params.set('to', toFilter);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : '?');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionIdFilter, emailFilter, fromFilter, toFilter]);

  const buildQueryString = useCallback((offset: number): string => {
    const params = new URLSearchParams();
    if (actionIdFilter) params.set('action_id', actionIdFilter);
    if (emailFilter) params.set('email', emailFilter);
    if (fromFilter) params.set('from', fromFilter);
    if (toFilter) params.set('to', toFilter);
    params.set('offset', String(offset));
    return params.toString();
  }, [actionIdFilter, emailFilter, fromFilter, toFilter]);

  async function loadMore() {
    setLoading(true);
    try {
      const qs = buildQueryString(rows.length);
      const res = await fetch(`/api/admin/slack-audit?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { rows: AuditRow[]; hasMore: boolean };
      setRows((prev) => [...prev, ...data.rows]);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('[slack-audit] load-more failed', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <label className="flex flex-col text-sm">
          <span className="text-zinc-400 mb-1">Action ID</span>
          <input
            type="text"
            value={actionIdFilter}
            onChange={(e) => setActionIdFilter(e.target.value)}
            placeholder="e.g. slack_promote"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-zinc-400 mb-1">Actor Email</span>
          <input
            type="text"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            placeholder="e.g. mike"
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-zinc-400 mb-1">From</span>
          <input
            type="date"
            value={fromFilter}
            onChange={(e) => setFromFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="text-zinc-400 mb-1">To</span>
          <input
            type="date"
            value={toFilter}
            onChange={(e) => setToFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100"
          />
        </label>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead className="text-zinc-400 border-b border-zinc-700">
          <tr>
            <th className="text-left py-2 px-2">Created</th>
            <th className="text-left py-2 px-2">Action ID</th>
            <th className="text-left py-2 px-2">Actor Email</th>
            <th className="text-left py-2 px-2">Slack ID</th>
            <th className="text-left py-2 px-2">Status</th>
            <th className="text-left py-2 px-2">Latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <React.Fragment key={r.id}>
                <tr
                  className="border-b border-zinc-800 hover:bg-zinc-900/50 cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                >
                  <td className="py-2 px-2 text-zinc-300">{formatDate(r.createdAt)}</td>
                  <td className="py-2 px-2">{r.actionId}</td>
                  <td className="py-2 px-2 text-zinc-300">{r.actorEmail ?? '—'}</td>
                  <td className="py-2 px-2 text-zinc-500 font-mono text-xs">{r.actorSlackId}</td>
                  <td className="py-2 px-2">
                    <span className={statusBadgeClass(r.responseStatus)}>{r.responseStatus}</span>
                  </td>
                  <td className="py-2 px-2 text-zinc-300">{r.latencyMs}</td>
                </tr>
                {expanded && (
                  <tr className="bg-zinc-900/30 border-b border-zinc-800">
                    <td colSpan={6} className="py-3 px-4 text-xs">
                      <div className="text-zinc-400 mb-1">Payload Hash:</div>
                      <code className="font-mono text-zinc-300 break-all">{r.payloadHash}</code>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="text-zinc-500 text-center py-8">No audit rows match the current filters.</div>
      )}
    </div>
  );
}
