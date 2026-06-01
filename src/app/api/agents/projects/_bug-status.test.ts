import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { CLOSED_BUG_STATUSES, openBugFilter } from './_bug-status';

// TRI-6 regression guard: open-bug counts and the `status=open` filter must
// exclude resolved, closed AND wontfix. The original bug excluded only
// resolved + wontfix, so `closed` bugs were counted as open and inflated every
// health rollup. Keep this list and the generated SQL in lockstep.

describe('TRI-6 — open-bug status definition', () => {
  it('treats resolved, closed, and wontfix as the closed-out statuses', () => {
    expect([...CLOSED_BUG_STATUSES]).toEqual(['resolved', 'closed', 'wontfix']);
  });

  it('explicitly excludes "closed" (the status the original bug missed)', () => {
    expect(CLOSED_BUG_STATUSES).toContain('closed');
  });

  it('renders a NOT IN filter binding all three closed-out statuses', () => {
    const { sql, params } = new PgDialect().sqlToQuery(openBugFilter());
    expect(sql.toLowerCase()).toContain('not in');
    expect(params).toEqual(['resolved', 'closed', 'wontfix']);
  });
});
