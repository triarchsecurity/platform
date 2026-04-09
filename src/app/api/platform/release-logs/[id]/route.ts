import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { releaseLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const [release] = await db
    .select()
    .from(releaseLogs)
    .where(eq(releaseLogs.id, id));

  if (!release) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  return NextResponse.json(release);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { summary, entries, metadata, releaseType, releasedBy } = body;

  const [updated] = await db.update(releaseLogs)
    .set({
      ...(summary !== undefined && { summary }),
      ...(entries !== undefined && { entries }),
      ...(metadata !== undefined && { metadata }),
      ...(releaseType !== undefined && { releaseType }),
      ...(releasedBy !== undefined && { releasedBy }),
    })
    .where(eq(releaseLogs.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}
