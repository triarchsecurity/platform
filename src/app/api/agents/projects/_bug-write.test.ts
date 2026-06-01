import { describe, it, expect } from 'vitest';
import { isKnownBugStatus, stampsResolvedAt, BUG_STATUSES } from './_bug-write';

describe('agent bug-write validation (TRI-6 fold-in)', () => {
  it('accepts every known status', () => {
    for (const s of BUG_STATUSES) expect(isKnownBugStatus(s)).toBe(true);
  });

  it('rejects unknown / non-string statuses', () => {
    expect(isKnownBugStatus('done')).toBe(false);
    expect(isKnownBugStatus('')).toBe(false);
    expect(isKnownBugStatus(undefined)).toBe(false);
    expect(isKnownBugStatus(42)).toBe(false);
  });

  it('stamps resolved_at for fixed/verified resolutions', () => {
    expect(stampsResolvedAt('resolved')).toBe(true);
    expect(stampsResolvedAt('closed')).toBe(true);
    expect(stampsResolvedAt('verified')).toBe(true);
  });

  it('does NOT stamp resolved_at for non-resolution statuses (incl. wontfix)', () => {
    expect(stampsResolvedAt('wontfix')).toBe(false);
    expect(stampsResolvedAt('in_progress')).toBe(false);
    expect(stampsResolvedAt('triaged')).toBe(false);
  });
});
