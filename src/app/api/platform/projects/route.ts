import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { asc } from 'drizzle-orm';
import crypto from 'crypto';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const rows = await db.select().from(projects).orderBy(asc(projects.createdAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { key, name, description, firebaseProjectId, crdbCluster, crdbDatabase, crdbUser, subdomain, customDomain, deployedUrl, githubRepo, techStack, currentVersion, ecosystem } = body;

  if (!key || !name) {
    return NextResponse.json({ error: 'key and name are required' }, { status: 400 });
  }

  const apiKey = `tdp_${crypto.randomBytes(24).toString('hex')}`;

  const [project] = await db.insert(projects).values({
    key,
    name,
    description: description ?? null,
    firebaseProjectId: firebaseProjectId ?? null,
    crdbCluster: crdbCluster ?? null,
    crdbDatabase: crdbDatabase ?? null,
    crdbUser: crdbUser ?? null,
    subdomain: subdomain ?? null,
    customDomain: customDomain ?? null,
    deployedUrl: deployedUrl ?? null,
    githubRepo: githubRepo ?? null,
    techStack: techStack ?? {},
    currentVersion: currentVersion ?? null,
    ecosystem: ecosystem ?? 'triarch-dev',
    apiKey,
  }).returning();

  return NextResponse.json(project, { status: 201 });
}
