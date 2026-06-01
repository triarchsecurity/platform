// Validation helpers for the agent bug-write endpoint (PATCH .../bugs/[bugId]).
//
// Bug status is a free-form varchar in the DB, so the write path validates
// against this known set rather than persisting arbitrary strings. Terminal
// "fixed" statuses additionally stamp resolved_at so the health rollup (see
// _bug-status.ts) and any "time to resolve" reporting stay correct.

/** All bug statuses the tracker recognises. */
export const BUG_STATUSES = [
  'submitted',
  'triaged',
  'in_progress',
  'blocked',
  'resolved',
  'closed',
  'wontfix',
  'verified',
] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

export function isKnownBugStatus(s: unknown): s is BugStatus {
  return typeof s === 'string' && (BUG_STATUSES as readonly string[]).includes(s);
}

/**
 * Statuses that represent a fixed/verified resolution and therefore stamp
 * resolved_at. `wontfix` is terminal for the rollup but is not a "resolution",
 * so it does not set resolved_at (mirrors the staff PATCH route behaviour).
 */
export const RESOLVED_STAMP_STATUSES = ['resolved', 'closed', 'verified'] as const;

export function stampsResolvedAt(status: string): boolean {
  return (RESOLVED_STAMP_STATUSES as readonly string[]).includes(status);
}
