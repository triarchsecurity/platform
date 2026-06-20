import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenantPortfolioRollup } from '@/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/platform/ingest/portfolio-rollup
//
// Central RECEIVER for the cross-tenant Foundry Situational-Awareness portfolio
// rollup. Each Atlas tenant pushes its OWN PII-free rollup here daily; this route
// validates, then REPLACES the rows for that tenant. The per-tenant push cron lives
// in the atlas repo (/api/internal/portfolio-rollup-report, Phase 51 PRT).
//
// AUTH — mirrors /ingest/llm-usage: the frozen wire contract mandates a single shared
// header `x-ingest-secret`, validated against PORTFOLIO_ROLLUP_INGEST_SECRET with a
// CONSTANT-TIME comparison; FAILS CLOSED (503 if unconfigured, 401 on mismatch). The
// secret and full payloads are NEVER logged.
//
// PII: the payload is PII-free by construction (per-category counts + max severity +
// an at-risk-$ SUM). This route stores ONLY those aggregates — never an entity or value.

const CATEGORIES = ['health', 'ingest', 'intelGaps', 'focus'] as const;
type Category = (typeof CATEGORIES)[number];
const SEVERITIES = ['critical', 'warn', 'info', 'unknown'] as const;

interface NormalizedCategory {
  category: Category;
  count: number;
  maxSeverity: string | null;
  severityCounts: { critical: number; warn: number; info: number; unknown: number };
  totalAtRiskMicros: number | null;
}

interface NormalizedBody {
  tenantSlug: string;
  generatedAt: Date;
  categories: NormalizedCategory[];
}

function asInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function normalizeSeverityCounts(raw: unknown): NormalizedCategory['severityCounts'] {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { critical: asInt(r.critical), warn: asInt(r.warn), info: asInt(r.info), unknown: asInt(r.unknown) };
}

/**
 * Validate + normalize the wire body. Returns { ok: false, error } on any structural
 * problem (caller -> 400), or { ok: true, body }. Unknown categories are skipped.
 */
export function normalizeRollupBody(
  raw: unknown,
): { ok: true; body: NormalizedBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body must be a JSON object' };
  const b = raw as Record<string, unknown>;

  const tenantSlug = (typeof b.tenantSlug === 'string' ? b.tenantSlug : '').trim();
  if (!tenantSlug) return { ok: false, error: 'tenantSlug is required' };

  if (typeof b.generatedAt !== 'string') return { ok: false, error: 'generatedAt is required (ISO string)' };
  const generatedAt = new Date(b.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return { ok: false, error: 'generatedAt is not a valid date' };

  const rollup = (b.rollup && typeof b.rollup === 'object' ? b.rollup : null) as Record<string, unknown> | null;
  if (!rollup || !Array.isArray(rollup.categories)) {
    return { ok: false, error: 'rollup.categories must be an array' };
  }

  const categories: NormalizedCategory[] = [];
  for (const c of rollup.categories) {
    if (!c || typeof c !== 'object') continue;
    const cat = c as Record<string, unknown>;
    const category = cat.category;
    if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) continue; // skip unknown
    const maxSeverityRaw = cat.maxSeverity;
    const maxSeverity =
      typeof maxSeverityRaw === 'string' && (SEVERITIES as readonly string[]).includes(maxSeverityRaw)
        ? maxSeverityRaw
        : null;
    const usd = cat.totalAtRiskUsd;
    const totalAtRiskMicros = usd == null || !Number.isFinite(Number(usd)) ? null : Math.round(Number(usd) * 1e6);
    categories.push({
      category: category as Category,
      count: asInt(cat.count),
      maxSeverity,
      severityCounts: normalizeSeverityCounts(cat.severityCounts),
      totalAtRiskMicros,
    });
  }

  return { ok: true, body: { tenantSlug, generatedAt, categories } };
}

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.PORTFOLIO_ROLLUP_INGEST_SECRET;
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

  const parsed = normalizeRollupBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { tenantSlug, generatedAt, categories } = parsed.body;

  const now = new Date();
  let upserted = 0;

  // Replace the tenant's rows atomically: a re-push may carry fewer categories, so
  // DELETE the tenant's rows then INSERT the fresh set inside one transaction.
  try {
    await db.transaction(async (tx) => {
      await tx.delete(tenantPortfolioRollup).where(eq(tenantPortfolioRollup.tenantSlug, tenantSlug));
      for (const c of categories) {
        await tx
          .insert(tenantPortfolioRollup)
          .values({
            tenantSlug,
            category: c.category,
            count: c.count,
            maxSeverity: c.maxSeverity,
            severityCounts: c.severityCounts,
            totalAtRiskMicros: c.totalAtRiskMicros,
            generatedAt,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [tenantPortfolioRollup.tenantSlug, tenantPortfolioRollup.category],
            set: {
              count: c.count,
              maxSeverity: c.maxSeverity,
              severityCounts: c.severityCounts,
              totalAtRiskMicros: c.totalAtRiskMicros,
              generatedAt,
              updatedAt: now,
            },
          });
        upserted += 1;
      }
    });
  } catch (err) {
    console.error('[ingest/portfolio-rollup] upsert failed', {
      tenantSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'ingest failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted }, { status: 200 });
}
