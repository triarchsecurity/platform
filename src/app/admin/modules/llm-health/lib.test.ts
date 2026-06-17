import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  relativeTime,
  tmiBaseUrl,
  loadProviderHealth,
  TMI_BASE_URL_DEFAULT,
  type ProviderHealthResponse,
} from './lib';

describe('relativeTime', () => {
  it('returns "never" for null', () => {
    expect(relativeTime(null)).toBe('never');
  });

  it('formats seconds/minutes/hours/days', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5_000).toISOString())).toBe('5s ago');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago');
  });

  it('passes through an unparseable value', () => {
    expect(relativeTime('not-a-date')).toBe('not-a-date');
  });
});

describe('tmiBaseUrl', () => {
  const original = process.env.TMI_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TMI_BASE_URL;
    else process.env.TMI_BASE_URL = original;
  });

  it('defaults to prod when unset', () => {
    delete process.env.TMI_BASE_URL;
    expect(tmiBaseUrl()).toBe(TMI_BASE_URL_DEFAULT);
  });

  it('uses the env value when set', () => {
    process.env.TMI_BASE_URL = 'https://tmi-dev.example.com';
    expect(tmiBaseUrl()).toBe('https://tmi-dev.example.com');
  });
});

describe('loadProviderHealth — degrade gracefully', () => {
  const originalSecret = process.env.TMI_JOB_SECRET;

  beforeEach(() => {
    process.env.TMI_JOB_SECRET = 'test-secret';
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TMI_JOB_SECRET;
    else process.env.TMI_JOB_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('errors (never throws) when TMI_JOB_SECRET is missing', async () => {
    delete process.env.TMI_JOB_SECRET;
    const r = await loadProviderHealth();
    expect(r.ok).toBe(false);
  });

  it('errors when fetch rejects (TMI unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await loadProviderHealth();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reach TMI/i);
  });

  it('errors on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const r = await loadProviderHealth();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/502/);
  });

  it('returns parsed providers on success', async () => {
    const payload: ProviderHealthResponse = {
      ok: true,
      generatedAt: new Date().toISOString(),
      providers: [
        {
          providerType: 'anthropic',
          modelId: 'claude-x',
          active: true,
          configured: true,
          lastSuccessAt: new Date().toISOString(),
          recent24h: { success: 10, failure: 1 },
          lastFailure: null,
          stalled: false,
          status: 'healthy',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }),
    );
    const r = await loadProviderHealth();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.providers[0].providerType).toBe('anthropic');
  });

  it('errors on an unexpected payload shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    );
    const r = await loadProviderHealth();
    expect(r.ok).toBe(false);
  });
});
