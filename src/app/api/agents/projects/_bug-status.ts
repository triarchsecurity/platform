// Single source of truth for which bug statuses count as "open" across the
// /api/agents/projects/* health and rollup endpoints.
//
// A bug is OPEN unless it has been closed out. Previously each route inlined
// `ne(status,'resolved') AND ne(status,'wontfix')`, which silently counted
// `closed` bugs as open — inflating every health rollup, severity breakdown,
// and the CEO morning briefing (TRI-6). Keep this list as the only definition;
// all open-bug counts and the `status=open` filter derive from it.

import { notInArray } from 'drizzle-orm';
import { bugReports } from '@/db/schema';

/** Bug statuses that mean the bug is closed out (NOT open). */
export const CLOSED_BUG_STATUSES = ['resolved', 'closed', 'wontfix'] as const;

/** Drizzle condition selecting only open bugs (excludes closed-out statuses). */
export function openBugFilter() {
  return notInArray(bugReports.status, [...CLOSED_BUG_STATUSES]);
}
