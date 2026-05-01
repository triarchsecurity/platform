import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GitHub webhook listener for deploy / release events.
 *
 * Registered automatically per-project by /api/platform/projects/scaffold-repo
 * (events: workflow_run, release). Updates `projects.currentVersion`,
 * `projects.deployedUrl`, and `projects.status` so the admin dashboard
 * reflects live deploy state.
 *
 * Security: HMAC-SHA256 signature in `x-hub-signature-256` header verified
 * against DEPLOY_WEBHOOK_SECRET. Reject if missing or mismatched.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'DEPLOY_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  const sig = req.headers.get('x-hub-signature-256');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 401 });

  const raw = await req.text();
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = req.headers.get('x-github-event');
  const payload = JSON.parse(raw);
  const repoFullName: string | undefined = payload?.repository?.full_name;
  if (!repoFullName) return NextResponse.json({ ignored: 'no repo' });

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.githubRepo, repoFullName))
    .limit(1);
  if (!project) return NextResponse.json({ ignored: 'unknown repo', repo: repoFullName });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  let action: string | null = null;

  if (event === 'release' && payload.action === 'published') {
    const tagName: string | undefined = payload.release?.tag_name;
    if (tagName) {
      updates.currentVersion = tagName.startsWith('v') ? tagName : `v${tagName}`;
      action = `release ${tagName}`;
    }
  } else if (event === 'workflow_run' && payload.action === 'completed') {
    const run = payload.workflow_run;
    const conclusion: string | undefined = run?.conclusion;
    const headBranch: string | undefined = run?.head_branch;
    const commitMsg: string | undefined = run?.head_commit?.message;

    if (headBranch === 'main') {
      if (conclusion === 'success') {
        updates.status = 'active';
        const versionMatch = commitMsg?.match(/^v(\d+\.\d+\.\d+(?:[\w.-]+)?)/);
        if (versionMatch) updates.currentVersion = `v${versionMatch[1]}`;
        action = `deploy success${versionMatch ? ` (${versionMatch[0]})` : ''}`;
      } else if (conclusion === 'failure') {
        updates.status = 'deploy_failed';
        action = 'deploy failure';
      }
    }
  }

  if (action) {
    await db.update(projects).set(updates).where(eq(projects.id, project.id));
  }

  return NextResponse.json({
    received: true,
    event,
    repo: repoFullName,
    project: project.key,
    action: action ?? 'no-op',
  });
}
