import { describe, it, expect } from 'vitest';
import {
  rollupByTenant,
  sortTenants,
  portfolioTotals,
  formatUsd,
  formatCount,
  type UsageRow,
  type KeyPosture,
} from './rollup';

const managedPosture: KeyPosture = { reasoning: 'managed', reasoningNoTrain: true, embedding: 'byok' };
const byokPosture: KeyPosture = { reasoning: 'byok', reasoningNoTrain: false, embedding: 'byok' };

function row(over: Partial<UsageRow>): UsageRow {
  return {
    tenantSlug: 'acme',
    periodKind: 'mtd',
    provider: 'anthropic',
    model: 'claude',
    feature: 'chat',
    project: 'foundry',
    costMicros: 0,
    tokens: 0,
    calls: 0,
    keyPosture: null,
    ...over,
  };
}

describe('rollup — bigint-as-string safety', () => {
  it('Number()-wraps string aggregates instead of concatenating', () => {
    const rows: UsageRow[] = [
      row({ costMicros: '5', tokens: '100', calls: '2' }),
      row({ costMicros: '5', tokens: '100', calls: '3' }),
    ];
    const [t] = rollupByTenant(rows);
    expect(t.mtd.totals.costMicros).toBe(10); // not '55'
    expect(t.mtd.totals.tokens).toBe(200);
    expect(t.mtd.totals.calls).toBe(5);
  });
});

describe('rollup — grouping + posture', () => {
  it('groups by tenant and splits day vs mtd', () => {
    const rows: UsageRow[] = [
      row({ tenantSlug: 'acme', periodKind: 'day', costMicros: 1_000_000 }),
      row({ tenantSlug: 'acme', periodKind: 'mtd', costMicros: 5_000_000 }),
      row({ tenantSlug: 'globex', periodKind: 'mtd', costMicros: 2_000_000 }),
    ];
    const tenants = rollupByTenant(rows);
    const acme = tenants.find((t) => t.tenantSlug === 'acme')!;
    expect(acme.day.totals.costMicros).toBe(1_000_000);
    expect(acme.mtd.totals.costMicros).toBe(5_000_000);
  });

  it('picks up keyPosture from any row that carries one', () => {
    const rows: UsageRow[] = [
      row({ keyPosture: null }),
      row({ keyPosture: managedPosture, model: 'claude-2' }),
    ];
    const [t] = rollupByTenant(rows);
    expect(t.keyPosture).toEqual(managedPosture);
  });

  it('rolls up by provider/model within a period', () => {
    const rows: UsageRow[] = [
      row({ periodKind: 'mtd', provider: 'anthropic', model: 'claude', costMicros: 100, feature: 'chat' }),
      row({ periodKind: 'mtd', provider: 'anthropic', model: 'claude', costMicros: 200, feature: 'synth' }),
      row({ periodKind: 'mtd', provider: 'openai', model: 'gpt', costMicros: 50 }),
    ];
    const [t] = rollupByTenant(rows);
    expect(t.mtd.byProviderModel).toHaveLength(2);
    // sorted by cost desc — anthropic/claude (300) first
    expect(t.mtd.byProviderModel[0]).toMatchObject({ provider: 'anthropic', model: 'claude' });
    expect(t.mtd.byProviderModel[0].totals.costMicros).toBe(300);
  });
});

describe('rollup — sorting + portfolio totals', () => {
  const rows: UsageRow[] = [
    row({ tenantSlug: 'low', periodKind: 'mtd', costMicros: 1_000_000, calls: 9 }),
    row({ tenantSlug: 'high', periodKind: 'mtd', costMicros: 9_000_000, calls: 1 }),
  ];

  it('defaults to mtd spend descending', () => {
    const tenants = rollupByTenant(rows);
    expect(tenants[0].tenantSlug).toBe('high');
  });

  it('sorts by mtdCalls', () => {
    const sorted = sortTenants(rollupByTenant(rows), 'mtdCalls');
    expect(sorted[0].tenantSlug).toBe('low'); // 9 calls
  });

  it('sums portfolio totals across tenants', () => {
    const tenants = rollupByTenant(rows);
    expect(portfolioTotals(tenants, 'mtd').costMicros).toBe(10_000_000);
  });
});

describe('formatters', () => {
  it('formats USD with 2 decimals for whole cents', () => {
    expect(formatUsd(1_500_000)).toBe('$1.50');
  });
  it('formats USD with 4 decimals for sub-cent spend', () => {
    expect(formatUsd(1_234)).toBe('$0.0012');
  });
  it('formats counts with thousands separators', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});
