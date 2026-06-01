// /api/agents/projects/[idOrKey]/bugs/[bugId]
//
// PATCH — update a single bug report's status / fix metadata.
// Scope: write:bugs (board-approved per-agent grant — TRI-6 / approval 152e44e8).
//
// This is the agent-facing counterpart to the staff PATCH route at
// /api/platform/bug-reports/[id]. It is deliberately narrow: agents may set
// status, fix_commit_sha, fix_version, and triarch_notes only. Setting a
// resolution status (resolved/closed/verified) stamps resolved_at so the
// health rollup (see ../../_bug-status.ts) self-corrects.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bugReports, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { projectBug } from '@/lib/agent-projections';
import { findProject } from '../../../_lookup';
import { isKnownBugStatus, stampsResolvedAt } from '../../../_bug-write';

export const dynamic = 'force-dynamic';

export const PATCH = withAgent(
  [AGENT_SCOPES.WRITE_BUGS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const segments = request.nextUrl.pathname.split('/');
    // .../projects/<idOrKey>/bugs/<bugId>
    const bugId = decodeURIComponent(segments[segments.length - 1]);
    const idOrKey = decodeURIComponent(segments[segments.length - 3]);

    const project = await findProject(idOrKey);
    if (!project) {
      return NextResponse.json({ ok: false, error: 'project not found', idOrKey }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
    }

    const { status, fixCommitSha, fixVersion, triarchNotes, reason } = body as {
      status?: unknown;
      fixCommitSha?: unknown;
      fixVersion?: unknown;
      triarchNotes?: unknown;
      reason?: unknown;
    };

    if (typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'reason is required (non-empty string) for an auditable write' },
        { status: 400 },
      );
    }

    if (status !== undefined && !isKnownBugStatus(status)) {
      return NextResponse.json(
        { ok: false, error: `unknown status '${String(status)}'` },
        { status: 400 },
      );
    }

    const hasMutation =
      status !== undefined ||
      fixCommitSha !== undefined ||
      fixVersion !== undefined ||
      triarchNotes !== undefined;
    if (!hasMutation) {
      return NextResponse.json(
        { ok: false, error: 'no mutable field provided (status, fixCommitSha, fixVersion, triarchNotes)' },
        { status: 400 },
      );
    }

    // Fetch the bug and confirm it belongs to this project. Return the same 404
    // for "no such bug" and "bug not in this project" — do not leak existence.
    const [current] = await db.select().from(bugReports).where(eq(bugReports.id, bugId));
    if (!current || current.project !== project.key) {
      return NextResponse.json({ ok: false, error: 'bug not found', bugId }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (fixCommitSha !== undefined) updates.fixCommitSha = fixCommitSha;
    if (fixVersion !== undefined) updates.fixVersion = fixVersion;
    if (triarchNotes !== undefined) updates.triarchNotes = triarchNotes;
    if (typeof status === 'string' && stampsResolvedAt(status)) {
      updates.resolvedAt = new Date();
    }

    const [updated] = await db
      .update(bugReports)
      .set(updates)
      .where(eq(bugReports.id, bugId))
      .returning();

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'update',
      targetEntityType: 'bug',
      targetEntityId: bugId,
      targetEntityName: current.title,
      reason,
      tool: 'triarch_bug_update',
      extra: {
        project: project.key,
        from_status: current.status,
        to_status: typeof status === 'string' ? status : current.status,
        fix_version: fixVersion ?? current.fixVersion ?? null,
        fix_commit_sha: fixCommitSha ?? current.fixCommitSha ?? null,
      },
    });

    return NextResponse.json({ project_key: project.key, bug: projectBug(updated) });
  },
);
