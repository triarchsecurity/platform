import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { reports } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const [report] = await db.select().from(reports).where(eq(reports.id, id));
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(report);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { title, status, sections, periodStart, periodEnd, metadata } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (status !== undefined) updates.status = status;
  if (sections !== undefined) updates.sections = sections;
  if (periodStart !== undefined) updates.periodStart = periodStart ? new Date(periodStart) : null;
  if (periodEnd !== undefined) updates.periodEnd = periodEnd ? new Date(periodEnd) : null;
  if (metadata !== undefined) updates.metadata = metadata;

  const [updated] = await db.update(reports).set(updates).where(eq(reports.id, id)).returning();
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const [deleted] = await db.delete(reports).where(eq(reports.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
