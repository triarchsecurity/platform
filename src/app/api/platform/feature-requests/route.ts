import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn } from '@/lib/api-auth';
import { requireApiKey } from '@/lib/api-key-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { featureRequests, workflowTransitions } from '@/db/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { INCLUSION_STATES, type InclusionState } from '@/lib/inclusion-state';

// Public-safe projection for the customer-app read path (TRI-9). Excludes
// internal fields (triarchNotes, buildPlan, slack ids, inclusion state).
const PUBLIC_FEATURE_COLUMNS = {
  id: featureRequests.id,
  project: featureRequests.project,
  title: featureRequests.title,
  status: featureRequests.status,
  priority: featureRequests.priority,
  buildPlanStatus: featureRequests.buildPlanStatus,
  upvotes: featureRequests.upvotes,
  shippedVersion: featureRequests.shippedVersion,
  createdAt: featureRequests.createdAt,
  updatedAt: featureRequests.updatedAt,
} as const;

/**
 * Customer-app read path (TRI-9): API-key authenticated, scoped to a single
 * requester's own feature requests for the given project. See bug-reports route.
 */
async function getForApiKey(req: NextRequest): Promise<NextResponse> {
  const { error } = await requireApiKey(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const userId = searchParams.get('userId');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  if (!project) return NextResponse.json({ error: 'project query param is required' }, { status: 400 });
  if (!userId) return NextResponse.json({ error: 'userId query param is required for API-key reads' }, { status: 400 });

  const where = and(eq(featureRequests.project, project), eq(featureRequests.requestedByUserId, userId));

  const rows = await db.select(PUBLIC_FEATURE_COLUMNS).from(featureRequests).where(where).orderBy(desc(featureRequests.createdAt)).limit(limit).offset(offset);
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(featureRequests).where(where);

  return NextResponse.json({ features: rows, total: Number(countResult.count), limit, offset });
}

export async function GET(req: NextRequest) {
  // Service-to-service (customer apps): Bearer project API key → user-scoped read.
  if (req.headers.get('authorization')?.startsWith('Bearer ')) {
    return getForApiKey(req);
  }

  // Central console: session-authed, membership-scoped (unchanged).
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);

  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const status = searchParams.get('status');
  const inclusionState = searchParams.get('inclusion_state');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  // ── Phase 36 Pitfall 8: validate inclusion_state filter input ──
  if (inclusionState !== null && !INCLUSION_STATES.includes(inclusionState as InclusionState)) {
    return NextResponse.json({ error: 'invalid_inclusion_state' }, { status: 400 });
  }

  const conditions = [];
  if (project && project !== 'all') conditions.push(eq(featureRequests.project, project));
  if (status) conditions.push(eq(featureRequests.status, status));
  if (inclusionState) conditions.push(eq(featureRequests.inclusionState, inclusionState));

  // Membership filter: staff or DB-error fallback see everything; non-staff are scoped.
  if (ctx && !ctx.isStaff) {
    const projectKeys = ctx.memberships
      .filter((m) => m.project_key !== '*')
      .map((m) => m.project_key);

    if (projectKeys.length === 0) {
      // Non-staff with no memberships: empty result, NOT 403.
      return NextResponse.json({ features: [], total: 0, limit, offset });
    }

    conditions.push(inArray(featureRequests.project, projectKeys));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select().from(featureRequests).where(where).orderBy(desc(featureRequests.createdAt)).limit(limit).offset(offset);
  const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(featureRequests).where(where);

  return NextResponse.json({ features: rows, total: Number(countResult.count), limit, offset });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const body = await req.json();
  const { project, requestedByUserId, requestedByName, requestedByEmail, title, description, useCase, priority } = body;

  if (!project || !requestedByUserId || !title || !description) {
    return NextResponse.json({ error: 'project, requestedByUserId, title, and description are required' }, { status: 400 });
  }

  const ctx = await getCurrentUserContext(session);
  if (ctx && !ctx.isStaff) {
    const isMember = ctx.memberships.some((m) => m.project_key === project);
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [feature] = await db.insert(featureRequests).values({
    project,
    requestedByUserId,
    requestedByName: requestedByName ?? null,
    requestedByEmail: requestedByEmail ?? null,
    title,
    description,
    useCase: useCase ?? null,
    priority: priority ?? 'normal',
  }).returning();

  await db.insert(workflowTransitions).values({
    entityType: 'feature_request',
    entityId: feature.id,
    fromStatus: null,
    toStatus: 'submitted',
    transitionedBy: requestedByUserId,
  });

  return NextResponse.json(feature, { status: 201 });
}
