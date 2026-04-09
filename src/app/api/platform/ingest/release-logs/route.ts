import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';

export async function POST(req: NextRequest) {
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const body = await req.json();
  const { version, releaseType, summary, entries, metadata, releasedBy } = body;

  if (!version || !releaseType) {
    return NextResponse.json({ error: 'version and releaseType are required' }, { status: 400 });
  }

  const [release] = await db.insert(releaseLogs).values({
    project: project!.key,
    version,
    releaseType,
    summary: summary ?? null,
    entries: entries ?? [],
    metadata: metadata ?? {},
    releasedBy: releasedBy ?? null,
  }).returning();

  return NextResponse.json(release, { status: 201 });
}
