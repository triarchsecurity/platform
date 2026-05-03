import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { bugReports, workflowTransitions } from '@/db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);

  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const conditions = [];
  if (project && project !== 'all') conditions.push(eq(bugReports.project, project));
  if (status) conditions.push(eq(bugReports.status, status));
  if (priority) conditions.push(eq(bugReports.priority, priority));

  // Membership filter: staff or DB-error fallback see everything; non-staff are scoped.
  if (ctx && !ctx.isStaff) {
    const projectKeys = ctx.memberships
      .filter((m) => m.project_key !== '*')
      .map((m) => m.project_key);

    if (projectKeys.length === 0) {
      // Non-staff with no memberships: empty result, NOT 403.
      return NextResponse.json({ bugs: [], total: 0, limit, offset });
    }

    conditions.push(inArray(bugReports.project, projectKeys));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select().from(bugReports).where(where).orderBy(desc(bugReports.createdAt)).limit(limit).offset(offset);
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(bugReports).where(where);

  return NextResponse.json({ bugs: rows, total: Number(countResult.count), limit, offset });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const body = await req.json();
  const { project, reportedByUserId, reportedByName, reportedByEmail, title, description, stepsToReproduce, expectedBehavior, actualBehavior, severity, priority, pageUrl, browserInfo } = body;

  if (!project || !reportedByUserId || !title || !description) {
    return NextResponse.json({ error: 'project, reportedByUserId, title, and description are required' }, { status: 400 });
  }

  const ctx = await getCurrentUserContext(session);
  if (ctx && !ctx.isStaff) {
    const isMember = ctx.memberships.some((m) => m.project_key === project);
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [bug] = await db.insert(bugReports).values({
    project,
    reportedByUserId,
    reportedByName: reportedByName ?? null,
    reportedByEmail: reportedByEmail ?? null,
    title,
    description,
    stepsToReproduce: stepsToReproduce ?? null,
    expectedBehavior: expectedBehavior ?? null,
    actualBehavior: actualBehavior ?? null,
    severity: severity ?? 'medium',
    priority: priority ?? 'fix_later',
    pageUrl: pageUrl ?? null,
    browserInfo: browserInfo ?? {},
  }).returning();

  // Log initial transition
  await db.insert(workflowTransitions).values({
    entityType: 'bug_report',
    entityId: bug.id,
    fromStatus: null,
    toStatus: 'submitted',
    transitionedBy: reportedByUserId,
  });

  return NextResponse.json(bug, { status: 201 });
}
