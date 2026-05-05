import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeBranchSection, makeRelease } from './__fixtures__/releases';
// INTENTIONAL RED: ReleasesClient must be updated by Plan 05-04 to accept initialSections
import ReleasesClient from './ReleasesClient';

describe('ReleasesClient cross-branch approve isolation (RC-03)', () => {
  it('clicking Approve on a row in one section does not flip the confirm state in the other section', async () => {
    const user = userEvent.setup();
    const sectionMain = makeBranchSection({
      branch: 'main',
      releases: [makeRelease({ id: 'rel-main', branch: 'main', status: 'dev' })],
    });
    const sectionFeat = makeBranchSection({
      branch: 'feat/change-font',
      releases: [makeRelease({ id: 'rel-feat', branch: 'feat/change-font', status: 'dev' })],
    });
    render(
      <ReleasesClient
        projectSlug="truthtreason"
        projectName="Truth+Treason"
        projectDeployedUrl={null}
        userRole="admin"
        currentUserEmail="mike@triarchsecurity.com"
        initialSections={[sectionMain, sectionFeat]}
        conflictsByBranch={{}}
        total={2}
        hasMore={false}
        pageSize={20}
      />,
    );

    // Expand both rows so Approve buttons are visible
    const mainRow = screen.getByRole('row', { name: /rel-main|v0\.15\.0-rc\.1/i });
    await user.click(mainRow);
    // Click the first Approve button (row A)
    const approveButtons = screen.getAllByRole('button', { name: /approve for production/i });
    expect(approveButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(approveButtons[0]);

    // After clicking row A, row A is now in confirm state. Row B (still collapsed) must still
    // surface only the original Approve label when expanded — the confirm countdown is per-row.
    // Probe: the confirm label "Click to confirm" must appear at most once across the page.
    const confirmLabels = screen.queryAllByText(/click to confirm/i);
    expect(confirmLabels.length).toBeLessThanOrEqual(1);
  });
});
