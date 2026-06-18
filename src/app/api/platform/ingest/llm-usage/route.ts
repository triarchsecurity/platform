import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenantLlmUsage } from '@/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/platform/ingest/llm-usage
//
// Central RECEIVER for the cross-tenant LLM usage/cost dashboard. Each Atlas
// tenant pushes daily summaries here; this route validates, then REPLACES the
// rows for each (tenant, period) window. The per-tenant push cron lives in the
// atlas repo (branch feat/llm-usage-report).
//
// AUTH — intentional deviation from the release-logs route:
//   release-logs uses requireApiKey() (Bearer token validated against the
//   projects table). That model does not fit here: tenants are not rows in
//   this app's projects table, and the frozen wire contract mandates a single
//   shared header `x-ingest-secret`. So this route validates that header
//   against LLM_USAGE_INGEST_SECRET with a CONSTANT-TIME comparison and FAILS
//   CLOSED (503 if unconfigured, 401 on any mismatch). The secret and full
//   payloads are NEVER logged.

const VALID_WIRE_PERIODS = ['last_24h', 'mtd'] as const;
type WirePeriod = (typeof VALID_WIRE_PERIODS)[number];

type PeriodKind = 'day' | 'mtd';

interface KeyPosture {
  reasoning: 'byok' | 'managed' | 'none';
  reasoningNoTrain: boolean;
  embedding: 'byok' | 'managed' | 'none';
}

interface NormalizedRow {
  provider: string;
  model: string;
  feature: string;
  project: string;
  costMicros: number;
  tokens: number;
  calls: number;
}

interface NormalizedWindow {
  periodKind: PeriodKind;
  rows: NormalizedRow[];
}

interface NormalizedBody {
  tenantSlug: string;
  generatedAt: Date;
  keyPosture: KeyPosture;
  windows: NormalizedWindow[];
}

/**
 * Map the wire window period to the stored period_kind.
 *   'last_24h' -> 'day'
 *   'mtd'      -> 'mtd'
 * Returns null for any unknown period (caller skips it defensively).
 */
export function mapPeriod(period: unknown): PeriodKind | null {
  if (period === 'last_24h') return 'day';
  if (period === 'mtd') return 'mtd';
  return null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Coerce a wire number safely; missing/invalid -> 0. Floors to an integer. */
function asInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizePosture(raw: unknown): KeyPosture | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const reasoning = asString(p.reasoning);
  const embedding = asString(p.embedding);
  if (!['byok', 'managed', 'none'].includes(reasoning)) return null;
  if (!['byok', 'managed', 'none'].includes(embedding)) return null;
  return {
    reasoning: reasoning as KeyPosture['reasoning'],
    reasoningNoTrain: p.reasoningNoTrain === true,
    embedding: embedding as KeyPosture['embedding'],
  };
}

/**
 * Validate + normalize the wire body into the shape the upsert needs.
 * Returns { ok: false, error } on any structural problem (caller -> 400),
 * or { ok: true, body } on success. Unknown window periods are skipped.
 */
export function normalizeUsageBody(
  raw: unknown,
): { ok: true; body: NormalizedBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const b = raw as Record<string, unknown>;

  const tenantSlug = asString(b.tenantSlug).trim();
  if (!tenantSlug) return { ok: false, error: 'tenantSlug is required' };

  if (typeof b.generatedAt !== 'string') {
    return { ok: false, error: 'generatedAt is required (ISO string)' };
  }
  const generatedAt = new Date(b.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return { ok: false, error: 'generatedAt is not a valid date' };
  }

  const keyPosture = normalizePosture(b.keyPosture);
  if (!keyPosture) {
    return { ok: false, error: 'keyPosture must include valid reasoning/reasoningNoTrain/embedding' };
  }

  if (!Array.isArray(b.windows)) {
    return { ok: false, error: 'windows must be an array' };
  }

  const windows: NormalizedWindow[] = [];
  for (const w of b.windows) {
    if (!w || typeof w !== 'object') continue;
    const win = w as Record<string, unknown>;
    const periodKind = mapPeriod(win.period);
    if (!periodKind) continue; // skip unknown periods defensively
    if (!Array.isArray(win.rows)) continue;

    const rows: NormalizedRow[] = [];
    for (const r of win.rows) {
      if (!r || typeof r !== 'object') {
        return { ok: false, error: 'each window row must be an object' };
      }
      const row = r as Record<string, unknown>;
      const provider = asString(row.provider);
      const model = asString(row.model);
      const feature = asString(row.feature);
      const project = asString(row.project);
      if (!provider || !model || !feature || !project) {
        return { ok: false, error: 'row provider/model/feature/project are required strings' };
      }
      rows.push({
        provider,
        model,
        feature,
        project,
        costMicros: asInt(row.costMicros),
        tokens: asInt(row.tokens),
        calls: asInt(row.calls),
      });
    }
    windows.push({ periodKind, rows });
  }

  return { ok: true, body: { tenantSlug, generatedAt, keyPosture, windows } };
}

/** Constant-time secret comparison; guards undefined + length mismatch. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.LLM_USAGE_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'ingest not configured' }, { status: 503 });
  }

  const provided = req.headers.get('x-ingest-secret');
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const parsed = normalizeUsageBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { tenantSlug, generatedAt, keyPosture, windows } = parsed.body;

  const now = new Date();
  let upserted = 0;

  // Replace each (tenant, period) window atomically: a re-push may carry FEWER
  // rows than before (a feature stopped being used), so the unique-key upsert
  // alone would leave stale rows. We DELETE the window's existing rows then
  // INSERT the fresh set. db is a NodePgDatabase, so db.transaction is
  // available — wrap each window's delete+insert in one transaction.
  try {
    for (const win of windows) {
      await db.transaction(async (tx) => {
        await tx
          .delete(tenantLlmUsage)
          .where(
            and(
              eq(tenantLlmUsage.tenantSlug, tenantSlug),
              eq(tenantLlmUsage.periodKind, win.periodKind),
            ),
          );

        for (const row of win.rows) {
          // onConflictDoUpdate backstops any duplicate natural key within the
          // same fresh set (delete already cleared the prior window).
          await tx
            .insert(tenantLlmUsage)
            .values({
              tenantSlug,
              periodKind: win.periodKind,
              provider: row.provider,
              model: row.model,
              feature: row.feature,
              project: row.project,
              costMicros: row.costMicros,
              tokens: row.tokens,
              calls: row.calls,
              keyPosture,
              generatedAt,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                tenantLlmUsage.tenantSlug,
                tenantLlmUsage.periodKind,
                tenantLlmUsage.provider,
                tenantLlmUsage.model,
                tenantLlmUsage.feature,
                tenantLlmUsage.project,
              ],
              set: {
                costMicros: row.costMicros,
                tokens: row.tokens,
                calls: row.calls,
                keyPosture,
                generatedAt,
                updatedAt: now,
              },
            });
          upserted += 1;
        }
      });
    }
  } catch (err) {
    // Never log the secret or full payload; log tenant + a terse message only.
    console.error('[ingest/llm-usage] upsert failed', {
      tenantSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'ingest failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted }, { status: 200 });
}
