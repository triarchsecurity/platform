/**
 * Phase 7 OTTOBOT-06 — staff-only Slack action audit viewer (server component).
 *
 * Per CONTEXT D-23: server component fetches first page; client component
 * (SlackAuditClient) handles filters + load-more.
 * Per CONTEXT D-24: getCurrentUserContext + ctx.isStaff gate; non-staff → redirect.
 * Per CONTEXT D-25: filter defaults from URL search params (action_id, email,
 *                   from, to). Defaults: from = today-7d, to = today.
 * Per CONTEXT D-26: page size 50 + 1 fetch for hasMore detection.
 * Per CONTEXT D-28: ORDER BY created_at DESC (matches slack_action_audit_created_at_idx).
 */
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { and, desc, eq, gte, ilike, lte } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { slackActionAudit } from '@/db/schema';
import SlackAuditClient from './SlackAuditClient';

const PAGE_SIZE = 50;

export default async function SlackAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    redirect('/admin?error=forbidden');
  }

  const params = await searchParams;
  const actionIdFilter = typeof params.action_id === 'string' ? params.action_id : '';
  const emailFilter = typeof params.email === 'string' ? params.email : '';
  const fromStr = typeof params.from === 'string' ? params.from : '';
  const toStr = typeof params.to === 'string' ? params.to : '';

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
    .offset(0);

  const hasMore = rows.length > PAGE_SIZE;
  const initialRows = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r) => ({
    id: r.id,
    actionId: r.actionId,
    actorEmail: r.actorEmail,
    actorSlackId: r.actorSlackId,
    payloadHash: r.payloadHash,
    responseStatus: r.responseStatus,
    latencyMs: r.latencyMs,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-4">Slack Action Audit</h1>
      <SlackAuditClient
        initialRows={initialRows}
        initialHasMore={hasMore}
        initialFilters={{
          actionId: actionIdFilter,
          email: emailFilter,
          from: fromStr,
          to: toStr,
        }}
      />
    </div>
  );
}
