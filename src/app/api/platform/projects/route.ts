import { NextRequest, NextResponse } from 'next/server';
import { requireSignedIn, requireStaff } from '@/lib/api-auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { asc, inArray } from 'drizzle-orm';
import { getProjectPipelineSummaries } from '@/lib/pipeline-summary';
import crypto from 'crypto';

// Attach dev/prod pipeline versions + state to each project row so the
// Projects page can show both versions and gate the Promote button on a
// real differential. Keyed by project.key (pipeline summaries use projectKey).
async function withPipeline<T extends { key: string }>(rows: T[]) {
  const summaries = await getProjectPipelineSummaries(rows.map((r) => r.key));
  const byKey = new Map(summaries.map((s) => [s.projectKey, s]));
  return rows.map((r) => {
    const p = byKey.get(r.key);
    return {
      ...r,
      devVersion: p?.devVersion ?? null,
      prodVersion: p?.prodVersion ?? null,
      pipelineState: p?.pipelineState ?? 'parity',
    };
  });
}

export async function GET() {
  const { error, session } = await requireSignedIn();
  if (error) return error;

  const ctx = await getCurrentUserContext(session);

  // Staff (or DB-error fallback for an authenticated user): return the full list.
  // The fallback path mirrors the env-allowlist policy in src/lib/auth.ts —
  // if the membership table is unreachable, an authenticated session that got
  // past the signIn callback is treated as trusted.
  if (!ctx || ctx.isStaff) {
    const rows = await db.select().from(projects).orderBy(asc(projects.createdAt));
    return NextResponse.json({ projects: await withPipeline(rows) });
  }

  // Non-staff: filter to projects where the user has a per-project membership.
  const projectKeys = ctx.memberships
    .filter((m) => m.project_key !== '*')
    .map((m) => m.project_key);

  if (projectKeys.length === 0) {
    return NextResponse.json({ projects: [] });
  }

  const rows = await db
    .select()
    .from(projects)
    .where(inArray(projects.key, projectKeys))
    .orderBy(asc(projects.createdAt));

  return NextResponse.json({ projects: await withPipeline(rows) });
}

export async function POST(req: NextRequest) {
  const { error } = await requireStaff();
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
