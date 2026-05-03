import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentUserContext, type UserContext } from '@/lib/auth-context';

/**
 * Verifies the request has an authenticated session. Does NOT check role
 * or membership — just "is somebody signed in".
 *
 * Returns 401 if not signed in.
 */
export async function requireSignedIn(): Promise<{
  error: NextResponse | null;
  session: Session | null;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
    };
  }
  return { error: null, session };
}

/**
 * Verifies the request has an authenticated session AND the user holds the
 * staff role (wildcard project_members row with project_key='*', role='staff').
 *
 * Returns 401 if not signed in, 403 if signed in but not staff (or if the
 * membership table is unreachable — we cannot prove staff so we deny).
 */
export async function requireStaff(): Promise<{
  error: NextResponse | null;
  session: Session | null;
  ctx: UserContext | null;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
      ctx: null,
    };
  }
  const ctx = await getCurrentUserContext(session);
  if (!ctx || !ctx.isStaff) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session,
      ctx,
    };
  }
  return { error: null, session, ctx };
}

/**
 * Verifies the request has an authenticated session AND the user is a
 * member of the given project (or holds the staff role, which bypasses).
 *
 * Returns 401 if not signed in, 403 if signed in but neither staff nor a
 * member of `projectKey` (or if membership lookup failed — cannot prove
 * access so we deny). Callers that already know the project exists may
 * surface this 403 directly; callers that want the 404-no-leak pattern
 * (mirroring page-level membership pages) should fetch the row first and
 * translate the 403 into a 404 themselves.
 */
export async function requireMembership(projectKey: string): Promise<{
  error: NextResponse | null;
  session: Session | null;
  ctx: UserContext | null;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      session: null,
      ctx: null,
    };
  }
  const ctx = await getCurrentUserContext(session);
  if (!ctx) {
    // DB unreachable — cannot prove membership, deny.
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session,
      ctx: null,
    };
  }
  if (ctx.isStaff) {
    return { error: null, session, ctx };
  }
  const isMember = ctx.memberships.some((m) => m.project_key === projectKey);
  if (!isMember) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session,
      ctx,
    };
  }
  return { error: null, session, ctx };
}

/**
 * @deprecated Use `requireSignedIn` for "any authenticated user", or
 * `requireStaff` / `requireMembership` for role-aware checks. This alias
 * exists only to keep in-flight branches and pre-Phase-1.1 callsites
 * compiling during the v1.14.x rollout. Remove in v1.15 once every
 * caller has been migrated.
 */
export const requireAdmin = requireSignedIn;
