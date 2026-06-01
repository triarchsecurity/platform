// /api/agents/projects/[idOrKey]/features/[featureId]
//
// PATCH — narrow, audited update of a single feature request's tracking
// fields. Added v2.24.0 (TRI-20) so engineering agents can flip a feature
// to "shipped" + record the shipped version after a deploy, without raw DB
// edits or a NextAuth UI session.
//
// Scope: write:projects.
//
// Mutable fields (allowlist — anything else in the body is ignored):
//   status          — submitted | triaged | planned | in_progress | shipped | wontfix | declined
//   shipped_version — free text, e.g. "v4.74.0" (nullable: send null to clear)
//   target_version  — free text (nullable)
//   triarch_notes   — free text (nullable)
//
// At least one mutable field must be present, else 400. This route never
// deletes and never touches user-authored request content (title, description,
// use_case, requester) — it only moves tracking state.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { featureRequests, AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { projectFeature } from '@/lib/agent-projections';
import { findProject } from '../../../_lookup';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_STATUSES = new Set([
  'submitted',
  'triaged',
  'planned',
  'in_progress',
  'shipped',
  'wontfix',
  'declined',
]);

export const PATCH = withAgent(
  [AGENT_SCOPES.WRITE_PROJECTS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const segments = request.nextUrl.pathname.split('/');
    const featureId = decodeURIComponent(segments[segments.length - 1]);
    const idOrKey = decodeURIComponent(segments[segments.length - 3]);

    if (!UUID_RE.test(featureId)) {
      return NextResponse.json(
        { ok: false, error: 'featureId must be a UUID', featureId },
        { status: 400 },
      );
    }

    const project = await findProject(idOrKey);
    if (!project) {
      return NextResponse.json({ ok: false, error: 'project not found', idOrKey }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
    }

    // Build the update set from the allowlist only.
    const updates: Record<string, unknown> = {};

    if ('status' in body) {
      const status = body.status;
      if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
        return NextResponse.json(
          {
            ok: false,
            error: `invalid status; allowed: ${[...ALLOWED_STATUSES].join(', ')}`,
            got: status,
          },
          { status: 400 },
        );
      }
      updates.status = status;
    }

    // Nullable free-text tracking fields. `null` clears, string sets, anything
    // else is rejected.
    for (const [bodyKey, column] of [
      ['shipped_version', 'shippedVersion'],
      ['target_version', 'targetVersion'],
      ['triarch_notes', 'triarchNotes'],
    ] as const) {
      if (bodyKey in body) {
        const v = body[bodyKey];
        if (v !== null && typeof v !== 'string') {
          return NextResponse.json(
            { ok: false, error: `${bodyKey} must be a string or null`, got: v },
            { status: 400 },
          );
        }
        updates[column] = v;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'no updatable fields; provide at least one of status, shipped_version, target_version, triarch_notes',
        },
        { status: 400 },
      );
    }

    updates.updatedAt = sql`now()`;

    // Update only when the row belongs to this project — prevents cross-project
    // mutation via a mismatched idOrKey/featureId pair.
    const [updated] = await db
      .update(featureRequests)
      .set(updates)
      .where(and(eq(featureRequests.id, featureId), eq(featureRequests.project, project.key)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: 'feature not found in this project', featureId, project: project.key },
        { status: 404 },
      );
    }

    const changed = Object.keys(updates).filter((k) => k !== 'updatedAt');

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'update',
      targetEntityType: 'feature',
      targetEntityId: updated.id,
      targetEntityName: updated.title,
      reason: `update feature (${changed.join(', ')})`,
      tool: 'triarch_feature_update',
      extra: {
        project: project.key,
        changed_fields: changed,
        new_status: updates.status ?? undefined,
        new_shipped_version: updates.shippedVersion ?? undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      project_key: project.key,
      feature: projectFeature(updated),
    });
  },
);
