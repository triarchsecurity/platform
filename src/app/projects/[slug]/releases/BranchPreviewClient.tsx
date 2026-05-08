'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { GitBranch, Loader2, AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';
import Toast, { type ToastKind } from '@/components/Toast';
import { formatRelativeTime } from './format';
import type { UserRole } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusResponse = {
  branch: string | null;
  state:
    | 'idle'
    | 'PENDING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'timeout';
  locked_at: string | null;
  locked_by: string | null;
  started_at: string | null;
  terminal: boolean;
  errorMessage?: string;
  rolloutResourcePath?: string;
};

type Props = {
  projectSlug: string;
  userRole: UserRole;
  branches: string[];
  fahProjectId: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IN_FLIGHT_STATES = new Set(['PENDING', 'BUILDING', 'DEPLOYING']);

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

const fetcher = async (url: string): Promise<StatusResponse> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`status fetch failed: ${res.status}`);
  return res.json();
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BranchPreviewClient({
  projectSlug,
  userRole,
  branches,
  fahProjectId,
}: Props) {
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: ToastKind; message: string; key: number } | null>(
    null,
  );

  const { data, mutate } = useSWR<StatusResponse>(
    `/api/projects/${projectSlug}/branch/preview/status`,
    fetcher,
    {
      // refreshInterval as function: receives latest cached data — pause when terminal
      refreshInterval: (latest) => (latest?.terminal ? 0 : 5000),
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
    },
  );

  const inFlight = data ? IN_FLIGHT_STATES.has(data.state) : false;
  const isAdmin = userRole === 'admin';

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handlePreview(branch: string) {
    setDispatching(branch);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/branch/preview`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      const payload = await res.json().catch(() => ({}));

      if (res.status === 202) {
        // Force immediate re-fetch so SWR picks up the new lock
        mutate();
      } else if (res.status === 400) {
        setToast({ kind: 'error', message: 'Branch name not allowed', key: Date.now() });
      } else if (res.status === 409) {
        setToast({
          kind: 'error',
          message: 'Another preview is already in flight',
          key: Date.now(),
        });
        // Re-fetch to show existing lock state
        mutate();
      } else if (res.status === 502) {
        const detail = (payload as { detail?: string }).detail;
        setToast({
          kind: 'error',
          message: `Preview dispatch failed${detail ? `: ${detail}` : ''}`,
          key: Date.now(),
        });
      } else {
        setToast({ kind: 'error', message: 'Could not start preview swap', key: Date.now() });
      }
    } catch {
      setToast({ kind: 'error', message: 'Network error during preview swap', key: Date.now() });
    } finally {
      setDispatching(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderBanner() {
    if (!data || !inFlight) return null;

    const lockedTime = data.locked_at ? formatRelativeTime(data.locked_at) : 'just now';

    return (
      // In-flight banner: violet-400 spinner + bg-violet-500/10 border-violet-500/30 halo
      // per DESIGN-REFERENCE.md active/in-flight pattern
      <div role="status" aria-live="polite" className="flex items-center gap-3 px-4 py-3 rounded-md bg-violet-500/10 border border-violet-500/30 text-violet-300 text-sm mb-3">
        <Loader2 size={14} className="animate-spin text-violet-400 flex-shrink-0" />
        <span>
          <span className="font-mono font-semibold">{data.branch}</span>
          {' currently previewing'}
          {data.locked_by && (
            <>
              {' — set '}
              {lockedTime}
              {' by '}
              <span className="font-mono">{data.locked_by}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  function renderSucceededPill() {
    if (!data || data.state !== 'SUCCEEDED') return null;

    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm mb-3">
        <CheckCircle2 size={14} className="flex-shrink-0" />
        <span>
          {'Preview ready — branch '}
          <span className="font-mono font-semibold">{data.branch}</span>
          {' deployed'}
        </span>
      </div>
    );
  }

  function renderFailedPill() {
    if (!data || data.state !== 'FAILED') return null;

    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-3">
        <AlertCircle size={14} className="flex-shrink-0" />
        <span className="flex-1">
          {'Preview failed'}
          {data.errorMessage ? ` — ${data.errorMessage}` : ''}
        </span>
        {fahProjectId && (
          <a
            href={`https://console.firebase.google.com/project/${fahProjectId}/apphosting`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-200 ml-2 flex-shrink-0"
          >
            View in Firebase console
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    );
  }

  function renderTimeoutPill() {
    if (!data || data.state !== 'timeout') return null;

    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm mb-3">
        <AlertCircle size={14} className="flex-shrink-0" />
        <span>Preview did not complete in 8 minutes — preview slot was reset</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4 mb-4">
      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          kind={toast.kind}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={14} className="text-violet-400" />
        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
          Branch Preview
        </span>
      </div>

      {/* Status pills — one visible at a time */}
      {renderBanner()}
      {renderSucceededPill()}
      {renderFailedPill()}
      {renderTimeoutPill()}

      {/* Preview buttons — admin only */}
      {isAdmin && branches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {branches.map((branch) => {
            const isDisabled = inFlight || dispatching === branch;
            const isSpinning = dispatching === branch;

            return (
              <button
                key={branch}
                onClick={() => handlePreview(branch)}
                disabled={isDisabled}
                title={inFlight ? 'A preview swap is in flight; please wait' : undefined}
                aria-label="Preview this branch"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-violet-500/30 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSpinning ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <GitBranch size={11} />
                )}
                <span className="font-mono">{branch}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
