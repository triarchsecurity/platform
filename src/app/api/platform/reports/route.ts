import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { reports } from '@/db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);

  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);

  const conditions = [];
  if (project && project !== 'all') conditions.push(eq(reports.project, project));

  // Membership filter: staff or DB-error fallback see everything; non-staff are scoped.
  if (ctx && !ctx.isStaff) {
    const projectKeys = ctx.memberships
      .filter((m) => m.project_key !== '*')
      .map((m) => m.project_key);

    if (projectKeys.length === 0) {
      // Non-staff with no memberships: empty result, NOT 403.
      return NextResponse.json({ reports: [], total: 0 });
    }

    conditions.push(inArray(reports.project, projectKeys));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select().from(reports).where(where).orderBy(desc(reports.createdAt)).limit(limit);
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(reports).where(where);

  return NextResponse.json({ reports: rows, total: Number(countResult.count) });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const body = await req.json();
  const { project, companyId, title, reportType, periodStart, periodEnd, sections } = body;

  if (!project || !title || !reportType) {
    return NextResponse.json({ error: 'project, title, and reportType are required' }, { status: 400 });
  }

  const ctx = await getCurrentUserContext(session);
  if (ctx && !ctx.isStaff) {
    const isMember = ctx.memberships.some((m) => m.project_key === project);
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [report] = await db.insert(reports).values({
    project,
    companyId: companyId ?? null,
    title,
    reportType,
    periodStart: periodStart ? new Date(periodStart) : null,
    periodEnd: periodEnd ? new Date(periodEnd) : null,
    sections: sections ?? [],
    createdBy: session!.user?.email ?? null,
  }).returning();

  return NextResponse.json(report, { status: 201 });
}
