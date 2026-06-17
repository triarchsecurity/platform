// POST /api/admin/llm-health/test
//
// Staff-gated proxy that runs a live key-test against a TMI LLM provider via
// TMI's internal provider-test endpoint. The TMI_JOB_SECRET never leaves the
// server — the browser only sees the test result.
//
// Body: { providerType: string }
// Returns TMI's ProviderTestResult on success, or a clear error on failure.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext } from '@/lib/auth-context';
import { tmiBaseUrl, type ProviderTestResult } from '@/app/admin/modules/llm-health/lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Gate to the same admin role as the page (staff-only).
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const ctx = await getCurrentUserContext(session);
  if (!ctx?.isStaff) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let body: { providerType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const providerType = body.providerType;
  if (typeof providerType !== 'string' || !providerType.trim()) {
    return NextResponse.json({ ok: false, error: 'providerType required' }, { status: 400 });
  }

  const jobSecret = process.env.TMI_JOB_SECRET;
  if (!jobSecret) {
    console.error('[llm-health/test] missing env: TMI_JOB_SECRET');
    return NextResponse.json(
      { ok: false, error: 'TMI_JOB_SECRET is not configured on this deployment.' },
      { status: 502 },
    );
  }

  const url = new URL('/api/internal/provider-test', tmiBaseUrl());

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-job-secret': jobSecret,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ providerType }),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[llm-health/test] fetch error reaching TMI provider-test:', err);
    return NextResponse.json(
      { ok: false, error: 'Could not reach TMI to run the key test.' },
      { status: 502 },
    );
  }

  if (!res.ok) {
    console.error('[llm-health/test] TMI provider-test returned', res.status);
    return NextResponse.json(
      { ok: false, error: `TMI provider-test returned HTTP ${res.status}.` },
      { status: 502 },
    );
  }

  try {
    const data = (await res.json()) as ProviderTestResult;
    return NextResponse.json(data);
  } catch (err) {
    console.error('[llm-health/test] failed to parse TMI provider-test payload:', err);
    return NextResponse.json(
      { ok: false, error: 'TMI provider-test returned an unparseable payload.' },
      { status: 502 },
    );
  }
}
