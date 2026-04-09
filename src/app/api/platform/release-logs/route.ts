import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { eq, desc, and, like, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const project = searchParams.get('project');
  const limit = parseInt(searchParams.get('limit') ?? '20', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const search = searchParams.get('search');

  const conditions = [];
  if (project && project !== 'all') {
    conditions.push(eq(releaseLogs.project, project));
  }
  if (search) {
    conditions.push(like(releaseLogs.summary, `%${search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(releaseLogs)
    .where(where)
    .orderBy(desc(releaseLogs.releasedAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(releaseLogs)
    .where(where);

  return NextResponse.json({
    releases: rows,
    total: Number(countResult.count),
    limit,
    offset,
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { project, version, releaseType, summary, entries, metadata, releasedBy } = body;

  if (!project || !version || !releaseType) {
    return NextResponse.json({ error: 'project, version, and releaseType are required' }, { status: 400 });
  }

  const [release] = await db.insert(releaseLogs).values({
    project,
    version,
    releaseType,
    summary: summary ?? null,
    entries: entries ?? [],
    metadata: metadata ?? {},
    releasedBy: releasedBy ?? null,
  }).returning();

  return NextResponse.json(release, { status: 201 });
}
