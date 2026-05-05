import { describe, it, expect } from 'vitest';
import { makeRelease } from './__fixtures__/releases';
// INTENTIONAL RED: ./group-sections does not exist until Plan 05-02
import { groupIntoSections } from './group-sections';

describe('groupIntoSections (RC-01)', () => {
  it('pins main first, sorts feature branches by maxDeployedAt desc', () => {
    const releases = [
      makeRelease({ branch: 'feat/add-audio', deployedAt: '2026-05-01T00:00:00.000Z' }),
      makeRelease({ branch: 'feat/change-font', deployedAt: '2026-05-03T00:00:00.000Z' }),
      makeRelease({ branch: 'main', deployedAt: '2026-05-04T00:00:00.000Z' }),
    ];
    const sections = groupIntoSections(releases, new Map(), null);
    expect(sections[0].branch).toBe('main');
    expect(sections[1].branch).toBe('feat/change-font');
    expect(sections[2].branch).toBe('feat/add-audio');
  });

  it('treats null branch as main', () => {
    const releases = [makeRelease({ branch: null, deployedAt: '2026-05-01T00:00:00.000Z' })];
    const sections = groupIntoSections(releases, new Map(), null);
    expect(sections.length).toBe(1);
    expect(sections[0].branch).toBe('main');
  });

  it('produces aggregate counts per branch', () => {
    const releases = [
      makeRelease({ branch: 'feat/x', status: 'pending_approval' }),
      makeRelease({ branch: 'feat/x', status: 'promoted' }),
      makeRelease({ branch: 'feat/x', status: 'dev' }),
    ];
    const sections = groupIntoSections(releases, new Map(), null);
    const featX = sections.find((s) => s.branch === 'feat/x')!;
    expect(featX.aggregate.pending).toBe(1);
    expect(featX.aggregate.promoted).toBe(1);
    expect(featX.aggregate.conflict).toBe(false);
  });
});
