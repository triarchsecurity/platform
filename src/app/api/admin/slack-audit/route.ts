/**
 * Phase 7 OTTOBOT-06 — load-more endpoint for /admin/platform/slack-audit.
 *
 * GET /api/admin/slack-audit?action_id=X&email=Y&from=...&to=...&offset=N
 *
 * Auth: staff-only via getServerSession + getCurrentUserContext.isStaff (403 otherwise).
 * Returns: { rows: [...], hasMore: boolean }
 *
 * Pagination: limit 51 with offset, hasMore = rows.length > 50, slice to 50.
 * Filters: same shape as page.tsx (Pitfall 7 — ilike only when email is non-empty).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { and, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { slackActionAudit } from '@/db/schema';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const actionIdFilter = searchParams.get('action_id') ?? '';
  const emailFilter = searchParams.get('email') ?? '';
  const fromStr = searchParams.get('from') ?? '';
  const toStr = searchParams.get('to') ?? '';
  const offset = Number(searchParams.get('offset') ?? '0') || 0;

  const fromDate = fromStr ? new Date(fromStr) : undefined;
  const toDate = toStr ? new Date(toStr) : undefined;

  const conditions = [
    actionIdFilter ? eq(slackActionAudit.actionId, actionIdFilter) : undefined,
    emailFilter.trim() ? ilike(slackActionAudit.actorEmail, `%${emailFilter}%`) : undefined,
    fromDate && !Number.isNaN(fromDate.getTime()) ? gte(slackActionAudit.createdAt, fromDate) : undefined,
    toDate && !Number.isNaN(toDate.getTime()) ? lte(slackActionAudit.createdAt, toDate) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const rows = await db
    .select()
    .from(slackActionAudit)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(slackActionAudit.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const trimmed = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r) => ({
    id: r.id,
    actionId: r.actionId,
    actorEmail: r.actorEmail,
    actorSlackId: r.actorSlackId,
    payloadHash: r.payloadHash,
    responseStatus: r.responseStatus,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  return NextResponse.json({ rows: trimmed, hasMore });
}
