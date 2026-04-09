'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useProjectOptions } from '@/lib/use-projects';
import { Shield, User, Clock, Search } from 'lucide-react';

interface AccessLog {
  id: string;
  project: string;
  actorUserId: string;
  actorEmail: string | null;
  targetEntityType: string;
  targetEntityId: string;
  targetEntityName: string | null;
  action: string;
  reason: string;
  sessionId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  role_assumed: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  role_released: 'bg-green-500/10 text-green-400 border-green-500/20',
  action_taken: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export default function AccessAuditPage() {
  const PROJECTS = useProjectOptions();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (projectFilter !== 'all') params.set('project', projectFilter);

    const res = await fetch(`/api/platform/access-logs?${params}`);
    const data = await res.json();
    setLogs(data.logs);
    setTotal(data.total);
    setLoading(false);
  }, [projectFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Access Audit</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {total} event{total !== 1 ? 's' : ''} logged
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
        >
          {PROJECTS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-zinc-900 border border-zinc-800">
          <Shield size={32} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-500">No access events recorded</p>
          <p className="text-xs text-zinc-600 mt-1">Events will appear here when admins assume roles in portal or player projects.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const date = new Date(log.createdAt);
            return (
              <div key={log.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <User size={16} className="text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200">
                        {log.actorEmail ?? log.actorUserId}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${ACTION_COLORS[log.action] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                        {log.action.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {log.targetEntityType}: {log.targetEntityName ?? log.targetEntityId}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">{log.reason}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {date.toLocaleString()}
                      </span>
                      <span>{log.project}</span>
                      {log.ipAddress && <span>{log.ipAddress}</span>}
                      {log.sessionId && <span className="font-mono">session: {log.sessionId.slice(0, 8)}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
