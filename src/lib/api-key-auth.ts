import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function requireApiKey(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!apiKey) {
    return { error: NextResponse.json({ error: 'Missing Authorization: Bearer <api_key> header' }, { status: 401 }), project: null };
  }

  const [project] = await db.select().from(projects).where(eq(projects.apiKey, apiKey));

  if (!project) {
    return { error: NextResponse.json({ error: 'Invalid API key' }, { status: 403 }), project: null };
  }

  return { error: null, project };
}
