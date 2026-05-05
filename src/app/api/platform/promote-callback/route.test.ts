/**
 * Vitest suite for POST /api/platform/promote-callback
 *
 * Tests: auth (401/403), validation (400 missing branch, 400 missing result,
 *        400 invalid result enum), 201 success merged, 201 success conflict.
 *
 * All DB operations are mocked — no real database needed.
 * Mock style mirrors src/app/api/releases/promoted/route.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mock: @/lib/api-key-auth ─────────────────────────────────────────────────

const requireApiKeyMock = vi.fn();

vi.mock('@/lib/api-key-auth', () => ({
  requireApiKey: (...args: unknown[]) => requireApiKeyMock(...args),
}));

// ─── Mock: @/lib/db ───────────────────────────────────────────────────────────
//
// Covers: db.insert(promoteAttempts).values({...}).returning()
// The insertMock is captured so tests can assert .values() call args.

const insertValuesMock = vi.fn();
const insertMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

// ─── Mock: @/db/schema ────────────────────────────────────────────────────────

vi.mock('@/db/schema', async () => {
  const actual = await vi.importActual<typeof import('@/db/schema')>('@/db/schema');
  return {
    promoteAttempts: actual.promoteAttempts,
    projects: actual.projects,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_PROJECT = { id: 'proj-uuid', key: 'truth-treason', apiKey: 'valid-token' };

const VALID_MERGED_BODY = {
  branch: 'feat/change-font',
  result: 'merged',
  merge_sha: 'abc123',
  conflict_files: [],
  rebase_error: null,
  ci_run_url: null,
};

const FAKE_INSERTED_ROW = {
  id: 'mock-uuid',
  project: 'truth-treason',
  branch: 'feat/change-font',
  result: 'merged',
  mergeSha: 'abc123',
  conflictFiles: [],
  rebaseError: null,
  ciRunUrl: null,
};

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new URL('http://localhost/api/platform/promote-callback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/platform/promote-callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: auth succeeds
    requireApiKeyMock.mockResolvedValue({ error: null, project: FAKE_PROJECT });

    // Default insert chain: insert().values().returning() → resolves with inserted row
    insertValuesMock.mockReturnValue({
      returning: vi.fn().mockResolvedValue([FAKE_INSERTED_ROW]),
    });
    insertMock.mockReturnValue({
      values: insertValuesMock,
    });
  });

  // Test 1 — 401 no Authorization header
  it('returns 401 when Authorization header is missing', async () => {
    const { NextResponse } = await import('next/server');
    requireApiKeyMock.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Missing Authorization: Bearer <api_key> header' },
        { status: 401 }
      ),
      project: null,
    });

    const { POST } = await import('./route');
    const req = buildRequest(VALID_MERGED_BODY);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Missing Authorization/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 2 — 403 invalid Bearer token
  it('returns 403 when Bearer token is invalid', async () => {
    const { NextResponse } = await import('next/server');
    requireApiKeyMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Invalid API key' }, { status: 403 }),
      project: null,
    });

    const { POST } = await import('./route');
    const req = buildRequest(VALID_MERGED_BODY, { Authorization: 'Bearer wrong-token' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid API key/);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 3 — 400 missing branch
  it('returns 400 and mentions "branch" when branch field is missing', async () => {
    const { POST } = await import('./route');
    const req = buildRequest({ result: 'merged', merge_sha: 'abc' }, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/branch/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 4 — 400 missing result
  it('returns 400 and mentions "result" when result field is missing', async () => {
    const { POST } = await import('./route');
    const req = buildRequest({ branch: 'feat/x' }, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/result/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 5 — 400 result outside enum
  it('returns 400 and mentions "result" when result is not in the valid enum', async () => {
    const { POST } = await import('./route');
    const req = buildRequest(
      { branch: 'feat/x', result: 'frobnicated' },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/result/i);
    expect(insertMock).not.toHaveBeenCalled();
  });

  // Test 6 — 201 valid merged payload, correct camelCase insert values
  it('returns 201 and inserts a merged row with correct camelCase fields', async () => {
    const { POST } = await import('./route');
    const req = buildRequest(VALID_MERGED_BODY, { Authorization: 'Bearer valid' });
    const res = await POST(req);

    expect(res.status).toBe(201);

    // Assert db.insert was called once with promoteAttempts table
    expect(insertMock).toHaveBeenCalledTimes(1);

    // Assert .values() received the camelCase-mapped object
    const valuesCall = insertValuesMock.mock.calls[0][0];
    expect(valuesCall).toMatchObject({
      project: 'truth-treason',
      branch: 'feat/change-font',
      result: 'merged',
      mergeSha: 'abc123',
      conflictFiles: [],
      rebaseError: null,
      ciRunUrl: null,
    });
  });

  // Test 7 — 201 valid conflict payload, conflict_files and rebase_error persisted
  it('returns 201 and persists conflict_files and rebase_error on conflict result', async () => {
    const conflictRow = {
      ...FAKE_INSERTED_ROW,
      result: 'conflict',
      conflictFiles: ['src/foo.ts', 'src/bar.ts'],
      rebaseError: 'CONFLICT (content): Merge conflict in src/foo.ts',
    };
    insertValuesMock.mockReturnValue({
      returning: vi.fn().mockResolvedValue([conflictRow]),
    });
    insertMock.mockReturnValue({ values: insertValuesMock });

    const { POST } = await import('./route');
    const req = buildRequest(
      {
        branch: 'feat/change-font',
        result: 'conflict',
        conflict_files: ['src/foo.ts', 'src/bar.ts'],
        rebase_error: 'CONFLICT (content): Merge conflict in src/foo.ts',
      },
      { Authorization: 'Bearer valid' }
    );
    const res = await POST(req);

    expect(res.status).toBe(201);

    const valuesCall = insertValuesMock.mock.calls[0][0];
    expect(valuesCall.result).toBe('conflict');
    expect(valuesCall.conflictFiles).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(valuesCall.rebaseError).toBe('CONFLICT (content): Merge conflict in src/foo.ts');
  });
});
