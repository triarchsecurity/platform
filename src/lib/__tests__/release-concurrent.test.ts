/**
 * Integration test for RC-08 — concurrent multi-branch approval safety (D-16, D-17).
 *
 * Per RESEARCH.md "approveRelease Concurrency Model":
 *   approveRelease is per-row idempotent, keyed by release.id UUID.
 *   Two concurrent approvals on different branches operate on different rows —
 *   no shared lock, no cross-contamination at the database level.
 *
 * This test does NOT use a real DB. It mocks db.transaction to track per-call
 * insert/update args and asserts that each parallel call sees its own inputs only.
 *
 * End-to-end multi-branch validation against a real GitHub merge is the Phase 8
 * Truth+Treason pilot (PILOT-02).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock: @/lib/github-app (so promoteAndAudit's dispatch call is captured) ──

vi.mock('@/lib/github-app', () => ({
  dispatchWorkflow: vi.fn().mockResolvedValue({ ok: true, status: 204 }),
}));

// ── Mock: @/lib/slack (promoteAndAudit calls postSlackThreadedReply / updateSlackMessage) ──

vi.mock('@/lib/slack', () => ({
  postSlackThreadedReply: vi.fn().mockResolvedValue({ ok: true }),
  updateSlackMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

// ── Mock: @/lib/db with per-call capture ─────────────────────────────────────

// Captures for approveRelease's transaction calls
const txInsertValueCalls: Array<Record<string, unknown>> = [];
const txUpdateCalls: Array<{ status: string }> = [];
// Captures for promoteAndAudit's top-level update calls
const promotionUpdateCalls: Array<Record<string, unknown>> = [];
// Controls what promoteAndAudit's project select returns
const projectSelectResults: Array<{ githubRepo: string }[]> = [];

let selectCallCount = 0;

vi.mock('@/lib/db', () => ({
  db: {
    /**
     * select() is used by:
     *   1. approveRelease idempotency check: .from().where().orderBy().limit() → []
     *   2. promoteAndAudit project lookup: .from().where() → [{ githubRepo }]
     *
     * We distinguish the two by whether .orderBy() is called on the where() result.
     * approveRelease's where() result has .orderBy().limit(), so we provide both.
     * promoteAndAudit's where() result is awaited directly (no orderBy/limit).
     */
    select: () => ({
      from: () => ({
        where: () => {
          const callIndex = selectCallCount++;
          // approveRelease idempotency path — returns empty (no existing approval)
          const orderByResult = {
            orderBy: () => ({
              limit: () => Promise.resolve([]),
            }),
          };
          // promoteAndAudit project lookup — returns project fixture
          // We need the where() result to be thenable for direct await
          const result = Object.assign(
            Promise.resolve(projectSelectResults[callIndex] ?? [{ githubRepo: 'MyAlterLego/truth-treason' }]),
            orderByResult,
          );
          return result;
        },
      }),
    }),

    /**
     * update() is used by promoteAndAudit for the audit metadata write.
     * approveRelease uses tx.update() inside transaction(), not db.update().
     */
    update: () => ({
      set: (args: Record<string, unknown>) => ({
        where: () => {
          promotionUpdateCalls.push(args);
          return Promise.resolve(undefined);
        },
      }),
    }),

    /**
     * transaction() is used by approveRelease exclusively.
     * Each call gets an isolated tx object so concurrent calls don't share state.
     */
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // Track which inserts/updates this particular transaction call makes
      const localInsertValues: Record<string, unknown>[] = [];

      const tx = {
        insert: () => ({
          values: (vals: Record<string, unknown>) => {
            localInsertValues.push(vals);
            txInsertValueCalls.push(vals);
            return {
              returning: () =>
                Promise.resolve([
                  {
                    id: `app-${txInsertValueCalls.length}`,
                    releaseId: vals.releaseId,
                    approverEmail: vals.approverEmail,
                    ipAddress: vals.ipAddress,
                    userAgent: vals.userAgent,
                    decision: vals.decision,
                    reason: vals.reason,
                    approvedAt: new Date(),
                    createdAt: new Date(),
                  },
                ]),
            };
          },
        }),
        update: () => ({
          set: (args: { status: string }) => ({
            where: () => ({
              returning: () => {
                // releaseId is captured from the insert that happened in this same transaction
                const releaseId = localInsertValues[0]?.releaseId ?? 'unknown';
                txUpdateCalls.push({ id: releaseId as string, status: args.status });
                return Promise.resolve([{ id: releaseId, status: args.status }]);
              },
            }),
          }),
        }),
      };
      return fn(tx);
    },
  },
}));

// ── Imports AFTER mocks ──────────────────────────────────────────────────────

import { approveRelease } from '@/lib/release-actions';
import { promoteAndAudit } from '@/lib/release-promotion';
import { dispatchWorkflow } from '@/lib/github-app';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeRelease = (id: string, branch: string, version: string) => ({
  id,
  project: 'truth-treason',
  version,
  releaseType: 'patch' as const,
  releasedAt: new Date(),
  releasedBy: null,
  summary: null,
  entries: [] as unknown[],
  env: 'dev',
  status: 'dev',
  commitSha: `sha-${id.slice(-4)}`,
  deployedAt: new Date(),
  branch,
  promotionDispatchedAt: null,
  promotionDispatchedBy: null,
  metadata: {},
  createdAt: new Date(),
});

const RELEASE_FONT = makeRelease('rel-font-uuid', 'feat/change-font', 'v0.4.2');
const RELEASE_AUDIO = makeRelease('rel-audio-uuid', 'feat/add-audio', 'v0.5.0');

beforeEach(() => {
  vi.clearAllMocks();
  txInsertValueCalls.length = 0;
  txUpdateCalls.length = 0;
  promotionUpdateCalls.length = 0;
  projectSelectResults.length = 0;
  selectCallCount = 0;
});

describe('Concurrent multi-branch approval safety (RC-08)', () => {
  it('two parallel approveRelease calls on different branches both succeed independently', async () => {
    const [resultFont, resultAudio] = await Promise.all([
      approveRelease({
        release: RELEASE_FONT as Parameters<typeof approveRelease>[0]['release'],
        approverEmail: 'mike@triarchsecurity.com',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0 font-tester',
      }),
      approveRelease({
        release: RELEASE_AUDIO as Parameters<typeof approveRelease>[0]['release'],
        approverEmail: 'sam@triarchsecurity.com',
        ipAddress: '10.0.0.2',
        userAgent: 'Mozilla/5.0 audio-tester',
      }),
    ]);

    // Both succeeded with fresh approvals
    expect(resultFont.ok).toBe(true);
    expect(resultAudio.ok).toBe(true);
    if (resultFont.ok) expect(resultFont.alreadyApproved).toBe(false);
    if (resultAudio.ok) expect(resultAudio.alreadyApproved).toBe(false);

    // Two distinct insert calls captured — each releaseApprovals insert has its own releaseId
    expect(txInsertValueCalls).toHaveLength(2);
    const insertedReleaseIds = txInsertValueCalls.map((c) => c.releaseId).sort();
    expect(insertedReleaseIds).toEqual(['rel-audio-uuid', 'rel-font-uuid']);
  });

  it('per-call inputs (approverEmail, ipAddress, userAgent) flow only into their own insert', async () => {
    await Promise.all([
      approveRelease({
        release: RELEASE_FONT as Parameters<typeof approveRelease>[0]['release'],
        approverEmail: 'mike@triarchsecurity.com',
        ipAddress: '10.0.0.1',
        userAgent: 'font-ua',
      }),
      approveRelease({
        release: RELEASE_AUDIO as Parameters<typeof approveRelease>[0]['release'],
        approverEmail: 'sam@triarchsecurity.com',
        ipAddress: '10.0.0.2',
        userAgent: 'audio-ua',
      }),
    ]);

    // Find each insert by releaseId and assert its specific approverEmail/ipAddress/userAgent
    const fontInsert = txInsertValueCalls.find((c) => c.releaseId === 'rel-font-uuid');
    const audioInsert = txInsertValueCalls.find((c) => c.releaseId === 'rel-audio-uuid');

    expect(fontInsert?.approverEmail).toBe('mike@triarchsecurity.com');
    expect(fontInsert?.ipAddress).toBe('10.0.0.1');
    expect(fontInsert?.userAgent).toBe('font-ua');

    expect(audioInsert?.approverEmail).toBe('sam@triarchsecurity.com');
    expect(audioInsert?.ipAddress).toBe('10.0.0.2');
    expect(audioInsert?.userAgent).toBe('audio-ua');

    // Cross-contamination check: font insert must NOT have audio's email and vice versa
    expect(fontInsert?.approverEmail).not.toBe('sam@triarchsecurity.com');
    expect(audioInsert?.approverEmail).not.toBe('mike@triarchsecurity.com');
  });

  it('two parallel promoteAndAudit calls dispatch with each branch independently (no serialization)', async () => {
    // promoteAndAudit calls db.select for the project lookup — both calls need the same return
    // (both releases belong to the same project 'truth-treason')
    projectSelectResults.push(
      [{ githubRepo: 'MyAlterLego/truth-treason' }],
      [{ githubRepo: 'MyAlterLego/truth-treason' }],
    );

    const makeInput = (release: typeof RELEASE_FONT) => ({
      release: release as Parameters<typeof promoteAndAudit>[0]['release'],
      actorEmail: 'mike@triarchsecurity.com',
      channelId: 'C_RELEASE_APPROVALS',
      messageTs: `170000000.${release.id.slice(-3)}`,
      slackUserName: 'mike',
    });

    await Promise.all([
      promoteAndAudit(makeInput(RELEASE_FONT)),
      promoteAndAudit(makeInput(RELEASE_AUDIO)),
    ]);

    // dispatchWorkflow called once per release
    expect(dispatchWorkflow).toHaveBeenCalledTimes(2);

    // Extract the branch from each dispatch call and assert set membership
    const dispatchCalls = (dispatchWorkflow as ReturnType<typeof vi.fn>).mock.calls as Array<
      [{ owner: string; repo: string; workflowFile: string; ref: string; inputs: { branch: string } }]
    >;
    const branches = dispatchCalls.map((c) => c[0].inputs.branch).sort();
    expect(branches).toEqual(['feat/add-audio', 'feat/change-font']);

    // Each dispatch targets the correct owner/repo
    for (const [callArgs] of dispatchCalls) {
      expect(callArgs.owner).toBe('MyAlterLego');
      expect(callArgs.repo).toBe('truth-treason');
      expect(callArgs.workflowFile).toBe('promote-branch.yml');
    }

    // Both promotion metadata writes captured
    expect(promotionUpdateCalls).toHaveLength(2);
    for (const call of promotionUpdateCalls) {
      expect(call.promotionDispatchedAt).toBeInstanceOf(Date);
      expect(call.promotionDispatchedBy).toBe('mike@triarchsecurity.com');
    }
  });
});
