// Shared types + helpers for the LLM Provider Health module.
//
// Consumes TMI's provider-health API (built in TMI prod):
//   GET  {TMI_BASE_URL}/api/internal/provider-health
//   POST {TMI_BASE_URL}/api/internal/provider-test  { providerType }
// Auth header: x-job-secret: <TMI_JOB_SECRET>.
//
// Env vars (already bound in apphosting.yaml / apphosting.dev.yaml):
//   TMI_BASE_URL    (default https://tmiengine.com if unset)
//   TMI_JOB_SECRET  (secret — TMI's JOB_SECRET value)

export const TMI_BASE_URL_DEFAULT = 'https://tmiengine.com';

export type ProviderStatus =
  | 'healthy'
  | 'degraded'
  | 'down'
  | 'idle'
  | 'not_configured';

export type StatusClass = 'ok' | 'auth' | 'rate' | 'server' | 'not_configured' | 'other';

export interface ProviderLastFailure {
  at: string;
  statusClass: StatusClass;
  httpStatus: number | null;
  message: string | null;
}

export interface ProviderHealth {
  providerType: string;
  modelId: string;
  active: boolean;
  configured: boolean;
  lastSuccessAt: string | null;
  recent24h: { success: number; failure: number };
  lastFailure: ProviderLastFailure | null;
  stalled: boolean;
  status: ProviderStatus;
}

export interface ProviderHealthResponse {
  ok: true;
  generatedAt: string;
  providers: ProviderHealth[];
}

export interface ProviderTestResult {
  ok: boolean;
  providerType: string;
  httpStatus: number | null;
  statusClass: StatusClass;
  latencyMs: number;
  message: string;
}

export type HealthLoad =
  | { ok: true; data: ProviderHealthResponse }
  | { ok: false; error: string };

/** Resolve the TMI base URL from env, defaulting to prod when unset. */
export function tmiBaseUrl(): string {
  const v = process.env.TMI_BASE_URL;
  return v && v.trim() ? v.trim() : TMI_BASE_URL_DEFAULT;
}

/**
 * Server-side fetch of provider-health from TMI. Wrapped so the caller can
 * render a graceful "unavailable" state instead of crashing the page if TMI
 * is unreachable, misconfigured, or returns a non-200.
 */
export async function loadProviderHealth(): Promise<HealthLoad> {
  const jobSecret = process.env.TMI_JOB_SECRET;
  if (!jobSecret) {
    // Never log the secret value — only that it is missing.
    console.error('[llm-health] missing env: TMI_JOB_SECRET');
    return { ok: false, error: 'TMI_JOB_SECRET is not configured on this deployment.' };
  }

  const url = new URL('/api/internal/provider-health', tmiBaseUrl());

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-job-secret': jobSecret, accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[llm-health] fetch error reaching TMI provider-health:', err);
    return { ok: false, error: 'Could not reach TMI to load provider health.' };
  }

  if (!res.ok) {
    console.error('[llm-health] TMI provider-health returned', res.status);
    return { ok: false, error: `TMI provider-health returned HTTP ${res.status}.` };
  }

  try {
    const data = (await res.json()) as ProviderHealthResponse;
    if (!data || data.ok !== true || !Array.isArray(data.providers)) {
      return { ok: false, error: 'TMI provider-health returned an unexpected payload.' };
    }
    return { ok: true, data };
  } catch (err) {
    console.error('[llm-health] failed to parse TMI provider-health payload:', err);
    return { ok: false, error: 'TMI provider-health returned an unparseable payload.' };
  }
}

/** Compact relative-time formatter (no external dep). */
export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}
