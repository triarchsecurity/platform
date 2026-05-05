// Shared test fixtures for the releases page
// Used by group-sections.test.ts, PreviewLink.test.tsx, ReleasesClient.test.tsx, BranchSection.test.tsx
// Defaults are valid ReleaseRow / BranchSection objects; spread `overrides` to customise.

import type { ReleaseRow, BranchSection, ConflictState } from '../types';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `00000000-0000-0000-0000-${String(idCounter).padStart(12, '0')}`;
}

export function makeRelease(overrides: Partial<ReleaseRow> = {}): ReleaseRow {
  const releasedAt = overrides.releasedAt ?? '2026-05-01T12:00:00.000Z';
  return {
    id: overrides.id ?? nextId(),
    project: overrides.project ?? 'truthtreason',
    version: overrides.version ?? 'v0.15.0-rc.1',
    env: overrides.env ?? 'dev',
    status: overrides.status ?? 'dev',
    commitSha: overrides.commitSha ?? 'abc1234',
    deployedAt: overrides.deployedAt ?? releasedAt,
    releasedAt,
    releasedBy: overrides.releasedBy ?? 'mike@triarchsecurity.com',
    summary: overrides.summary ?? null,
    feedback: overrides.feedback ?? [],
    approvals: overrides.approvals ?? [],
    promotionDispatchedAt: overrides.promotionDispatchedAt ?? null,
    promotionDispatchedBy: overrides.promotionDispatchedBy ?? null,
    pairedProd: overrides.pairedProd ?? null,
    // Phase 5 additions (Plan 05-02 extends ReleaseRow with these):
    branch: overrides.branch ?? 'main',
    metadata: overrides.metadata ?? null,
  };
}

export function makeConflict(overrides: Partial<ConflictState> = {}): ConflictState {
  return {
    files: overrides.files ?? ['src/foo.ts', 'src/bar.ts'],
    rebaseError: overrides.rebaseError ?? null,
    createdAt: overrides.createdAt ?? '2026-05-04T12:00:00.000Z',
  };
}

export function makeBranchSection(overrides: Partial<BranchSection> = {}): BranchSection {
  const branch = overrides.branch ?? 'main';
  const releases = overrides.releases ?? [makeRelease({ branch })];
  const maxDeployedAt = overrides.maxDeployedAt ?? releases[0]?.deployedAt ?? null;
  return {
    branch,
    releases,
    conflict: overrides.conflict ?? null,
    maxDeployedAt,
    isActive: overrides.isActive ?? true,
    aggregate: overrides.aggregate ?? {
      pending: releases.filter((r) => r.status === 'pending_approval').length,
      promoted: releases.filter((r) => r.status === 'promoted').length,
      conflict: !!overrides.conflict,
    },
  };
}
