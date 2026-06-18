/**
 * Vitest suite for POST /api/platform/ingest/llm-usage.
 *
 * Cross-tenant LLM usage receiver. Mirrors the mock pattern from
 * src/app/api/platform/ingest/release-logs/route.test.ts. All DB operations
 * mocked — no real database. Auth is x-ingest-secret (NOT Bearer/requireApiKey).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock: @/lib/db — a drizzle-like surface with transaction(delete + insert).
const deleteWhereMock = vi.fn();
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));
const onConflictMock = vi.fn();
const insertValuesMock = vi.fn((_row: Record<string, unknown>) => ({ onConflictDoUpdate: onConflictMock }));
const insertMock = vi.fn(() => ({ values: insertValuesMock }));
const transactionMock = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
  await cb({ delete: deleteMock, insert: insertMock });
});

vi.mock('@/lib/db', () => ({
  db: {
    transaction: (...args: unknown[]) => transactionMock(...(args as [(tx: unknown) => Promise<void>])),
  },
}));

// Mock: @/db/schema — import real table refs so route's column references resolve.
vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return { tenantLlmUsage: actual.tenantLlmUsage };
});

const SECRET = 'super-secret-shared-value';

const VALID_BODY = {
  tenantSlug: 'acme-advisory',
  generatedAt: '2026-06-17T00:00:00.000Z',
  keyPosture: { reasoning: 'managed', reasoningNoTrain: true, embedding: 'byok' },
  windows: [
    {
      period: 'last_24h',
      rows: [
        { provider: 'anthropic', model: 'claude', feature: 'chat', project: 'foundry', costMicros: 1500, tokens: 200, calls: 3 },
      ],
    },
    {
      period: 'mtd',
      rows: [
        { provider: 'anthropic', model: 'claude', feature: 'chat', project: 'foundry', costMicros: 45000, tokens: 6000, calls: 90 },
        { provider: 'openai', model: 'gpt', feature: 'embed', project: 'foundry', costMicros: 1000, tokens: 5000, calls: 10 },
      ],
    },
  ],
};

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(new URL('http://localhost/api/platform/ingest/llm-usage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/platform/ingest/llm-usage', () => {
  const ORIGINAL_SECRET = process.env.LLM_USAGE_INGEST_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LLM_USAGE_INGEST_SECRET = SECRET;
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.LLM_USAGE_INGEST_SECRET;
    else process.env.LLM_USAGE_INGEST_SECRET = ORIGINAL_SECRET;
  });

  it('secret unset -> 503, db untouched', async () => {
    delete process.env.LLM_USAGE_INGEST_SECRET;
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_BODY, { 'x-ingest-secret': SECRET }));
    expect(res.status).toBe(503);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('missing x-ingest-secret header -> 401, db untouched', async () => {
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('wrong x-ingest-secret -> 401, db untouched', async () => {
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_BODY, { 'x-ingest-secret': 'wrong' }));
    expect(res.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('correct secret + valid body -> 200 {ok:true}, upserts with period mapping + posture', async () => {
    const { POST } = await import('./route');
    const res = await POST(buildRequest(VALID_BODY, { 'x-ingest-secret': SECRET }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.upserted).toBe(3); // 1 last_24h row + 2 mtd rows

    // one transaction per window
    expect(transactionMock).toHaveBeenCalledTimes(2);
    // delete-then-insert: delete called once per window
    expect(deleteMock).toHaveBeenCalledTimes(2);
    // insert called once per row
    expect(insertValuesMock).toHaveBeenCalledTimes(3);

    // period mapping: last_24h -> 'day', mtd -> 'mtd'
    const periodKinds = insertValuesMock.mock.calls.map((c) => c[0].periodKind as string);
    expect(periodKinds).toContain('day');
    expect(periodKinds).toContain('mtd');
    expect(periodKinds).not.toContain('last_24h');

    // key_posture persisted on every inserted row
    for (const call of insertValuesMock.mock.calls) {
      expect(call[0].keyPosture).toEqual(VALID_BODY.keyPosture);
    }
  });

  it('malformed body (missing windows) -> 400, no db write', async () => {
    const { POST } = await import('./route');
    const body = { tenantSlug: 'acme', generatedAt: '2026-06-17T00:00:00Z', keyPosture: VALID_BODY.keyPosture };
    const res = await POST(buildRequest(body, { 'x-ingest-secret': SECRET }));
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('invalid JSON -> 400, no db write', async () => {
    const { POST } = await import('./route');
    const res = await POST(buildRequest('{not json', { 'x-ingest-secret': SECRET }));
    expect(res.status).toBe(400);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('pure helpers', () => {
  it('mapPeriod maps wire periods', async () => {
    const { mapPeriod } = await import('./route');
    expect(mapPeriod('last_24h')).toBe('day');
    expect(mapPeriod('mtd')).toBe('mtd');
    expect(mapPeriod('weekly')).toBeNull();
  });

  it('normalizeUsageBody coerces numbers and skips unknown periods', async () => {
    const { normalizeUsageBody } = await import('./route');
    const result = normalizeUsageBody({
      tenantSlug: 'acme',
      generatedAt: '2026-06-17T00:00:00Z',
      keyPosture: { reasoning: 'byok', reasoningNoTrain: false, embedding: 'none' },
      windows: [
        { period: 'weekly', rows: [] }, // unknown -> skipped
        { period: 'last_24h', rows: [{ provider: 'a', model: 'm', feature: 'f', project: 'p' }] }, // missing nums -> 0
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.windows).toHaveLength(1);
      expect(result.body.windows[0].periodKind).toBe('day');
      expect(result.body.windows[0].rows[0].costMicros).toBe(0);
    }
  });

  it('normalizeUsageBody rejects bad posture', async () => {
    const { normalizeUsageBody } = await import('./route');
    const result = normalizeUsageBody({
      tenantSlug: 'acme',
      generatedAt: '2026-06-17T00:00:00Z',
      keyPosture: { reasoning: 'invalid', reasoningNoTrain: false, embedding: 'none' },
      windows: [],
    });
    expect(result.ok).toBe(false);
  });
});
