// /api/agents/projects/[idOrKey]/style
//
// GET — proxy TMI's writing style to the triarch-dev MCP.
// Scope: read:projects (reuses existing scope — no new scope added).
//
// Scope decision: read:projects is the established scope for all agent/projects/*
// routes (health, bugs, features). Adding a distinct read:tmi-style scope would
// require a schema edit + re-seeding every agent's scopes array, which is
// neither trivial nor consistent with the house pattern. read:projects is correct here.
//
// Only the TMI project (key === 'tmi') has a writing style. All other projects
// return 404 so callers get a clear signal rather than an empty payload.

import { NextRequest, NextResponse } from 'next/server';
import { AGENT_SCOPES } from '@/db/schema';
import { withAgent, logAgentActivity } from '@/lib/agent-auth';
import { findProject } from '../../_lookup';

export const dynamic = 'force-dynamic';

export const GET = withAgent(
  [AGENT_SCOPES.READ_PROJECTS],
  async (request: NextRequest, { agent, sessionId, ipAddress }) => {
    const segments = request.nextUrl.pathname.split('/');
    const idOrKey = decodeURIComponent(segments[segments.length - 2]);

    const project = await findProject(idOrKey);
    if (!project) {
      return NextResponse.json({ ok: false, error: 'project not found', idOrKey }, { status: 404 });
    }

    // Only TMI has a writing style; return a clear 404 for all other projects.
    if (project.key !== 'tmi') {
      return NextResponse.json(
        { ok: false, error: 'no writing style for this project', project_key: project.key },
        { status: 404 },
      );
    }

    // Read env at call time (not module load) — matches house pattern for
    // PORTAL_BASE_URL and similar env-isolated values.
    const tmiBase = process.env.TMI_BASE_URL;
    const jobSecret = process.env.TMI_JOB_SECRET;

    if (!tmiBase || !jobSecret) {
      // Never log the secret value — only log which variable is missing.
      console.error(
        '[style-proxy] missing env:',
        !tmiBase ? 'TMI_BASE_URL' : '',
        !jobSecret ? 'TMI_JOB_SECRET' : '',
      );
      return NextResponse.json(
        { ok: false, error: 'style upstream not configured' },
        { status: 502 },
      );
    }

    // Pass through optional query params supplied by the MCP caller.
    const userId = request.nextUrl.searchParams.get('userId');
    const companySlug = request.nextUrl.searchParams.get('companySlug');

    const upstream = new URL('/api/agents/style', tmiBase);
    if (userId) upstream.searchParams.set('userId', userId);
    if (companySlug) upstream.searchParams.set('companySlug', companySlug);

    let res: Response;
    try {
      res = await fetch(upstream, {
        headers: { 'x-job-secret': jobSecret, accept: 'application/json' },
        cache: 'no-store',
      });
    } catch (err) {
      // Log the error but never log the secret or the upstream URL (which
      // could leak timing or routing information).
      console.error('[style-proxy] fetch error reaching TMI:', err);
      return NextResponse.json(
        { ok: false, error: 'failed to reach style upstream' },
        { status: 502 },
      );
    }

    if (!res.ok) {
      // Log only the HTTP status — never the response body (may contain
      // internal TMI details) and never the secret.
      console.error('[style-proxy] TMI upstream returned', res.status);
      return NextResponse.json(
        { ok: false, error: 'style upstream error', upstream_status: res.status },
        { status: 502 },
      );
    }

    const payload = await res.json();

    await logAgentActivity({
      agent,
      sessionId,
      ipAddress,
      action: 'read',
      targetEntityType: 'style',
      targetEntityId: project.id,
      targetEntityName: project.key,
      reason: 'proxy writing style from TMI',
      tool: 'triarch_project_style',
    });

    return NextResponse.json(payload);
  },
);
