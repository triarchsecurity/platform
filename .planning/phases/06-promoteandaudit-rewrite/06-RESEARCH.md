# Phase 6: promoteAndAudit Rewrite - Research

**Researched:** 2026-05-05
**Domain:** Release promotion dispatch, Slack notification, JSONB metadata, concurrent-safety testing
**Confidence:** HIGH — all findings grounded in direct code reads

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `promoteAndAudit` calls `dispatchWorkflow({ owner, repo, workflowFile: 'promote-branch.yml', ref: 'main', inputs: { branch: release.branch ?? 'main' } })`. The `tag: release.version` input is removed.
- D-02: `ref: 'main'` — the consumer's `main` branch holds the local `promote-branch.yml` stub.
- D-03: 404 on missing stub → existing failure path handles it — no special pre-flight check.
- D-04: Keep `releaseLogs.promotionDispatchedAt` + `promotionDispatchedBy`; write at dispatch time.
- D-05: `notifyReleaseApproved` gets `branch: string | null`; renders "{branch} {version} approved by {approverEmail}"; null → "main".
- D-06: OttoBot dispatch button payload `value` JSON must include the `branch` field.
- D-07: `notifyReleaseApproved` extension is a single function update — not a new function.
- D-08: Persist Slack `channel_id` + `message_ts` on `release_logs.metadata` JSONB: `metadata.dispatch.{slackChannelId, slackMessageTs, dispatchedAt}`.
- D-09: Write happens inside `promoteAndAudit` immediately after the dispatch attempt.
- D-10: Promote-callback lookup: query `release_logs` filtered by `(project, branch)` ordered by `deployed_at desc, released_at desc`, take the first row.
- D-11: Missing metadata → log warning + skip Slack reply, still record `promote_attempts` row.
- D-12: Conflict reply: `:warning: Cannot promote {branch} — conflicts with main:` + code block file list capped at 50 + `+ N more files` + `Rebase manually on main, push as a new RC to retry.`
- D-13: Symmetric replies — `merged` → `:white_check_mark: Promoted {branch} to main (sha: {merge_sha[:7]})` / `ci_failed` → `:no_entry: CI failed for {branch} — see {ci_run_url}`.
- D-14: `postSlackThreadedReply` with `metadata.dispatch.slackChannelId` as channel and `metadata.dispatch.slackMessageTs` as `thread_ts`.
- D-15: Slack reply is best-effort — `try/catch` around the post; `promote_attempts` insert is source of truth.
- D-16: No admin code change for RC-08; rebase is the workflow's responsibility.
- D-17: RC-08 verified via integration test seeding two releases on different branches + two parallel approve POSTs.

### Claude's Discretion
- Exact lookup query for promote-callback's metadata read (one-shot SELECT vs Drizzle relational helper).
- Whether to add a small `dispatchPromote` extraction in `release-promotion.ts` to keep the function under ~150 lines, or keep the inline path.
- Slack message formatting (rich blocks vs plain text) — recommend keeping plain-text consistent with the existing `:rocket:` dispatched-message format.
- Where to update `onboarding-projects.md` runbook to document the consumer's local `promote-branch.yml` stub.
- Whether to bundle a stub injection helper for the consumer repo, or document manual creation (recommend documentation only).

### Deferred Ideas (OUT OF SCOPE)
- OttoBot Slack scope expansion (slash commands, app mentions) — Phase 7.
- `slack_action_audit` row writes — Phase 7.
- Audit log viewer at `/admin/platform/slack-audit` — Phase 7.
- Consumer repo `promote-branch.yml` stub injection automation.
- AI-mediated conflict resolution.
- Customer-page conflict resolution UI.
- Per-project Slack channel routing.
- Email notifications on lifecycle events.
- Slack notification on prod deploy completion.
- Admin-side reconciliation cron for missed callbacks.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RC-04 | `promoteAndAudit` dispatches `promote-branch.yml` with `branch` input (replaces `deploy-prod.yml` + `tag`) | D-01: single line change at `release-promotion.ts:99–105`; `dispatchWorkflow` contract is generic and already tested |
| RC-05 | OttoBot Slack message includes branch name and version in the approval notification | D-05/D-07: `notifyReleaseApproved` at `slack.ts:237` extended with `branch: string | null`; call site at `approve/route.ts:85`; button `value` JSON gains `branch` field |
| RC-06 | Admin posts threaded `:warning:` reply listing conflict files and rebase instructions when `promote-branch.yml` returns `conflict` | D-10–D-14: `promote-callback/route.ts` extended to lookup release, read metadata, call `postSlackThreadedReply` |
| RC-08 | Concurrent RC approvals on different branches both land in main without revert | D-16–D-17: no admin code change; `approveRelease` is per-row idempotent; integration test verifies |
</phase_requirements>

---

## Domain Investigation

### 1. `promoteAndAudit` — Current Contract and Required Changes

**File:** `src/lib/release-promotion.ts` (152 lines)

**Current signature (lines 8–14, 38):**
```typescript
export type PromoteAndAuditInput = {
  release: ReleaseRow;
  actorEmail: string;
  channelId: string;
  messageTs: string;
  slackUserName: string;
};

export async function promoteAndAudit(input: PromoteAndAuditInput): Promise<PromoteAndAuditResult>
```

**The single dispatch call to change (lines 99–105):**
```typescript
// BEFORE:
await dispatchWorkflow({
  owner,
  repo,
  workflowFile: 'deploy-prod.yml',
  ref: 'main',
  inputs: { tag: release.version },
});

// AFTER (D-01):
await dispatchWorkflow({
  owner,
  repo,
  workflowFile: 'promote-branch.yml',
  ref: 'main',
  inputs: { branch: release.branch ?? 'main' },
});
```

**Metadata write to add (D-08, D-09) — after the `dispatchOk` assignment at line ~112:**
```typescript
// After dispatch attempt (success or failure), write Slack metadata for later callback lookup.
// Only when channelId and messageTs are present (fire-and-forget fire path always has them from
// /api/slack/interact line 189–201).
await db
  .update(releaseLogs)
  .set({
    promotionDispatchedAt: new Date(),
    promotionDispatchedBy: actorEmail,
    metadata: sql`jsonb_set(
      COALESCE(${releaseLogs.metadata}, '{}'::jsonb),
      '{dispatch}',
      ${JSON.stringify({ slackChannelId: channelId, slackMessageTs: messageTs, dispatchedAt: new Date().toISOString() })}::jsonb,
      true
    )`,
  })
  .where(eq(releaseLogs.id, release.id));
```

**Success threaded reply to update (line 128, currently says `deploy-prod.yml`):**
```typescript
// BEFORE:
text: `:rocket: Workflow dispatched: deploy-prod.yml (${owner}/${repo}, tag=${release.version})`,

// AFTER:
text: `:rocket: Workflow dispatched: promote-branch.yml (${owner}/${repo}, branch=${release.branch ?? 'main'})`,
```

**Signature stays the same** — `PromoteAndAuditInput` does not grow. `release.branch` is already available on `ReleaseRow` because `releaseLogs.$inferSelect` includes `branch` from `schema.ts:152`.

**Existing tests to update** (`src/lib/release-promotion.test.ts`):
- Line 54: asserts `workflowFile: 'deploy-prod.yml'` and `inputs: { tag: 'v0.4.2' }` — both change.
- Line 69: asserts `:rocket:` reply contains `'deploy-prod.yml'` — change to `'promote-branch.yml'`.
- Line 117: dispatch error message includes `deploy-prod.yml` — change to `promote-branch.yml`.
- `baseRelease` object (line 27) only has `id`, `project`, `version`. Phase 6 needs `branch: 'feat/change-font'` added for the new dispatch inputs test.

**New test to add in the same file (SC-1 / RC-04):**
```typescript
it('dispatches promote-branch.yml with branch input (not deploy-prod.yml)', async () => {
  const releaseWithBranch = { ...baseRelease, branch: 'feat/change-font' };
  mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg' }]);
  mockUpdate.mockResolvedValue(undefined);
  (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

  await promoteAndAudit({ ...baseInput, release: releaseWithBranch });

  expect(dispatchWorkflow).toHaveBeenCalledWith({
    owner: 'MyAlterLego',
    repo: 'darksouls-rpg',
    workflowFile: 'promote-branch.yml',
    ref: 'main',
    inputs: { branch: 'feat/change-font' },
  });
});

it('null branch falls back to "main" in dispatch inputs', async () => {
  const releaseNoBranch = { ...baseRelease, branch: null };
  mockSelect.mockResolvedValue([{ githubRepo: 'MyAlterLego/darksouls-rpg' }]);
  mockUpdate.mockResolvedValue(undefined);
  (dispatchWorkflow as any).mockResolvedValue({ ok: true, status: 204 });

  await promoteAndAudit({ ...baseInput, release: releaseNoBranch });

  const call = (dispatchWorkflow as any).mock.calls[0][0];
  expect(call.inputs.branch).toBe('main');
});
```

---

### 2. Slack Interact Button Payload — Current `value` Format and Branch Addition

**`signPayload` format** (`src/lib/slack-crypto.ts:46–58`):

The button `value` is NOT a JSON blob. It is a packed string: `${releaseId}.${nonce}.${sig}` where `sig` = base64url(HMAC-SHA256(`releaseId:action:nonce`)).

This is verified in `/api/slack/interact` at line 101–104 via `verifyPayload(packedValue, expected)`, which returns `{ ok: true, releaseId, nonce }` — the `releaseId` is the only data extracted from the value.

**D-06 implementation consequence:**

The existing button value format is a security-sensitive HMAC-signed packed string, not a general-purpose JSON payload. You cannot simply add `branch` to the value string without breaking the HMAC signature scheme. The correct approach per the CONTEXT.md D-06 note is:

> The OttoBot dispatch button payload `value` JSON must include the `branch` field so when staff clicks "Promote to Production" in Slack, `/api/slack/interact` can pass `branch` through to `promoteAndAudit` without re-querying the DB.

**Two valid implementation options:**

**Option A (recommended):** Do NOT change the signed `value`. Instead, after `verifyPayload` returns `releaseId`, the existing release lookup at line 119–123 already fetches the full `release` row including `release.branch`. Pass `release.branch` directly into `promoteAndAudit`. This is zero-change to the crypto layer and already works because the route already performs the DB lookup.

Looking at `/api/slack/interact` line 119–130:
```typescript
const [release] = await db
  .select()
  .from(releaseLogs)
  .where(eq(releaseLogs.id, verifiedPayload.releaseId));
// ...
promoteAndAudit({ release, actorEmail: email, channelId, messageTs, slackUserName })
```

The `release` object already includes `branch` from `releaseLogs.$inferSelect`. So `release.branch` is already available when `promoteAndAudit` is called. No change to the button value format is needed at all — D-01 uses `release.branch ?? 'main'` and that's satisfied by the existing release row.

**Option B (D-06 literal):** Add `branch` to the signed payload by extending `signPayload`/`verifyPayload` to sign a JSON `{releaseId, branch}` object. This is more complex and breaks the existing packed-value consumers (the test at `slack-interact.test.ts:104–113` rebuilds the packed format — all those would need updating). The benefit of skipping the DB lookup is negligible since the lookup is already in the route.

**Recommendation:** Option A (no change to `value` format). The `release` row at the time of the Slack button click is already fetched. The CONTEXT.md D-06 intent is satisfied because `promoteAndAudit` receives `release.branch` via the existing release fetch. Document this as a clarification in the plan.

**Where the button is constructed** (`src/lib/slack.ts:276–278`):
```typescript
value: await signPayload(input.releaseId, 'promote'),
```
No change needed here if we take Option A.

**The `notifyReleaseApproved` call site** (`src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts:85–93`):
```typescript
const slackResult = await notifyReleaseApproved({
  releaseId: release.id,
  project: release.project,
  version: release.version,
  approverEmail: ctx.email,
  status: result.release.status ?? 'approved',
  feedbackExcerpt: excerpt,
  feedbackOverflowCount: overflow,
});
```
Phase 6 adds `branch: release.branch ?? null` here. `release` is already fetched at line 49 and includes `branch`.

---

### 3. `notifyReleaseApproved` — Current Contract and Required Change

**File:** `src/lib/slack.ts:237–294`

**Current input shape:**
```typescript
export async function notifyReleaseApproved(input: {
  releaseId: string;
  project: string;
  version: string;
  approverEmail: string;
  status: string;
  feedbackExcerpt: string;
  feedbackOverflowCount: number;
})
```

**Current header block text (line 250–253):**
```typescript
text: `:rocket: *Release Approved: ${input.project} ${input.version}*\n*Approver:* ${input.approverEmail}\n*Status:* ${input.status}`,
```

**Phase 6 change (D-05, D-07):**

1. Extend the input type with `branch: string | null`.
2. Change header text to include branch:
```typescript
const branchDisplay = input.branch ?? 'main';
text: `:rocket: *${branchDisplay} ${input.version} approved by ${input.approverEmail}*\n*Project:* ${input.project}\n*Status:* ${input.status}`,
```

The overall message structure (`postSlackMessage`, `blocks`, `actions`) does not change. `signPayload` still receives only `input.releaseId` — button value format unchanged.

**No existing tests assert the message text of `notifyReleaseApproved`** — there is no `slack.test.ts` or `notify*.test.ts` file in the test inventory. The slack-interact test mocks `promoteAndAudit` directly; the approve route test does not exist yet. New tests for RC-05 go in a new `src/lib/release-promotion.test.ts` extension or a new `src/lib/slack.test.ts`.

**Approval route test** (`src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts`): Does NOT currently exist. Phase 6 will need to create it to assert that `notifyReleaseApproved` is called with `branch`.

---

### 4. `promote-callback/route.ts` — Current Contract and Extension Shape

**File:** `src/app/api/platform/promote-callback/route.ts` (54 lines)

**Current flow:**
1. `requireApiKey` auth.
2. Parse snake_case body: `branch, result, merge_sha, conflict_files, rebase_error, ci_run_url`.
3. Validate required fields.
4. `db.insert(promoteAttempts).values({...}).returning()`.
5. `return NextResponse.json(row, { status: 201 })`.

**Phase 6 extension (after the insert, before the 201 return):**

```typescript
// After successful insert, look up the release to get Slack metadata (D-10).
const [latestRelease] = await db
  .select()
  .from(releaseLogs)
  .where(
    and(
      eq(releaseLogs.project, project!.key),
      eq(releaseLogs.branch, branch as string)
    )
  )
  .orderBy(
    desc(releaseLogs.deployedAt),
    desc(releaseLogs.releasedAt)
  )
  .limit(1);

const slackMeta = latestRelease?.metadata as Record<string, unknown> | null;
const dispatch = slackMeta?.dispatch as { slackChannelId?: string; slackMessageTs?: string } | undefined;

if (!dispatch?.slackChannelId || !dispatch?.slackMessageTs) {
  console.warn('[promote-callback] no Slack metadata on release — skipping threaded reply', {
    project: project!.key,
    branch,
    releaseId: latestRelease?.id ?? 'not found',
  });
  // D-11: still return 201 — promote_attempts insert is source of truth
  return NextResponse.json(row, { status: 201 });
}

// Post threaded reply based on result (D-13, D-14, D-15).
try {
  const replyText = buildPromoteReplyText(
    result as PromoteResult,
    branch as string,
    merge_sha as string | null,
    Array.isArray(conflict_files) ? conflict_files as string[] : [],
    ci_run_url as string | null
  );
  await postSlackThreadedReply({
    channel: dispatch.slackChannelId,
    thread_ts: dispatch.slackMessageTs,
    text: replyText,
  });
} catch (err) {
  console.warn('[promote-callback] Slack threaded reply failed — continuing', err);
}

return NextResponse.json(row, { status: 201 });
```

**Helper function `buildPromoteReplyText` (new, in same file or extracted):**
```typescript
function buildPromoteReplyText(
  result: PromoteResult,
  branch: string,
  mergeSha: string | null,
  conflictFiles: string[],
  ciRunUrl: string | null
): string {
  if (result === 'merged') {
    const sha = mergeSha ? mergeSha.slice(0, 7) : 'unknown';
    return `:white_check_mark: Promoted ${branch} to main (sha: ${sha})`;
  }
  if (result === 'ci_failed') {
    return `:no_entry: CI failed for ${branch} — see ${ciRunUrl ?? 'CI logs'}`;
  }
  // result === 'conflict'
  const cap = 50;
  const shown = conflictFiles.slice(0, cap);
  const overflow = conflictFiles.length - cap;
  const fileList = shown.join('\n');
  const overflowLine = overflow > 0 ? `\n+ ${overflow} more files` : '';
  return `:warning: Cannot promote ${branch} — conflicts with main:\n\`\`\`\n${fileList}${overflowLine}\n\`\`\`\nRebase manually on main, push as a new RC to retry.`;
}
```

**Drizzle imports needed in the route:** `releaseLogs` from `@/db/schema`, `desc, and, eq` from `drizzle-orm`, `postSlackThreadedReply` from `@/lib/slack`.

---

## Codebase Patterns

### releaseLogs.metadata Current Shape

`metadata` is defined as `jsonb('metadata').default({})` in `schema.ts:157`. After Phase 5, the existing known shape is:

```typescript
// Phase 2 (deploy-firebase.yml dev callback)
{ previewUrl: 'https://feat-font--triarch-dev.us-central1.hosted.app' }
```

The column type in TypeScript is `typeof releaseLogs.$inferSelect['metadata']` which Drizzle types as `unknown` (generic `jsonb`).

**Proposed Phase 6 shape (D-08):**
```typescript
{
  previewUrl?: string,       // existing — Phase 2
  dispatch?: {
    slackChannelId: string,  // e.g. "C_RELEASE_APPROVALS"
    slackMessageTs: string,  // e.g. "1714000000.000100"
    dispatchedAt: string,    // ISO-8601
  }
}
```

### JSONB Merge Strategy (Critical — Do Not Replace)

Drizzle's `.set({ metadata: value })` does a full column replacement. If the row already has `{ previewUrl: '...' }` and you set `metadata: { dispatch: {...} }`, the `previewUrl` is lost.

**Safe merge pattern using `jsonb_set`:**
```typescript
import { sql } from 'drizzle-orm';

// In promoteAndAudit, after dispatch attempt:
const dispatchMeta = JSON.stringify({
  slackChannelId: channelId,
  slackMessageTs: messageTs,
  dispatchedAt: new Date().toISOString(),
});

await db
  .update(releaseLogs)
  .set({
    promotionDispatchedAt: new Date(),
    promotionDispatchedBy: actorEmail,
    metadata: sql`jsonb_set(
      COALESCE(${releaseLogs.metadata}, '{}'::jsonb),
      '{dispatch}',
      ${dispatchMeta}::jsonb,
      true
    )`,
  })
  .where(eq(releaseLogs.id, release.id));
```

`jsonb_set(target, path, new_value, create_if_missing)` — the `true` fourth argument creates the `dispatch` key if it doesn't exist. This preserves `previewUrl` and any other top-level keys. The `COALESCE` guard handles the `DEFAULT {}` case for rows that were inserted without metadata.

This is standard PostgreSQL/CockroachDB `jsonb_set` — identical behavior on both engines. CockroachDB documentation confirms `jsonb_set` support.

**Alternative: fetch-then-merge in TypeScript:**
```typescript
// Less efficient (extra round-trip) but simpler if SQL feels heavy:
const [current] = await db.select({ metadata: releaseLogs.metadata })
  .from(releaseLogs).where(eq(releaseLogs.id, release.id));
const existingMeta = (current?.metadata as Record<string, unknown>) ?? {};
await db.update(releaseLogs).set({
  metadata: { ...existingMeta, dispatch: { slackChannelId, slackMessageTs, dispatchedAt } },
  ...
}).where(eq(releaseLogs.id, release.id));
```

Recommend the `jsonb_set` approach — single round-trip, no race between fetch and write, consistent with SQL-side JSONB manipulation precedent in CockroachDB.

### Slack Threaded Reply Pattern

`postSlackThreadedReply` (`src/lib/slack.ts:47–74`) — already implemented. Takes `{ channel, thread_ts, text }`. No blocks support (plain text only). For the conflict reply, plain text with a backtick code block renders correctly in Slack mrkdwn.

The function:
- Gets bot token from vault.
- Posts to `chat.postMessage` with `thread_ts`.
- Returns `{ ok, ts?, error? }`.
- Warns and returns on failure — never throws.

**Phase 6 promote-callback uses this directly.** No new Slack primitives needed.

### dispatchWorkflow Contract

`src/lib/github-app.ts:118–148` — generic over `workflowFile` and `inputs`. Already handles 4xx by throwing an `Error` with the response body. Returns `{ ok: true, status: 204 }` on success. Phase 6 only changes the call arguments, not the helper itself.

### approveRelease Concurrency Model

`src/lib/release-actions.ts:21–68` — per-row idempotent keyed by `release.id`. Each RC has a distinct `release.id` UUID. Two concurrent approvals on different branches operate on different rows — no shared lock, no shared sequence, no cross-contamination possible at the database level.

The only shared concern is `promoteAndAudit`'s project lookup (SELECT on `projects` table by `project.key`). This is a read-only query — no lock acquired, no state written. The GitHub App token cache (`github-app.ts:14–20`) is module-scoped but single-flight-guarded — concurrent callers share the same token correctly.

**Conclusion:** No code change needed for RC-08. The concurrency guarantee comes from `promote-branch.yml`'s `git rebase origin/main` step. Admin's role is to dispatch independently per branch — which is exactly what D-01 achieves.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config | `vitest.config.ts` (root) — `environment: 'jsdom'` global; NextRequest mocking still works in jsdom |
| Quick run | `npx vitest run src/lib/release-promotion src/app/api/platform/promote-callback src/app/api/projects/\[slug\]/releases/\[releaseId\]/approve src/lib/__tests__/release-concurrent` |
| Full suite | `npx vitest run` |

### Per-Requirement Test Strategy

**SC-1 (RC-04): promote-branch.yml dispatch — unit test**

File: `src/lib/release-promotion.test.ts` (extend existing)

Mock `dispatchWorkflow` (from `@/lib/github-app`). Seed a release row with `branch: 'feat/change-font'`. Call `promoteAndAudit`. Assert:
- `dispatchWorkflow` called once with `workflowFile: 'promote-branch.yml'`
- `inputs.branch === 'feat/change-font'`
- `inputs.tag` is undefined (legacy field removed)
- Threaded reply text mentions `promote-branch.yml` (or branch + version)

Plus null-branch test: seed `branch: null`, assert `inputs.branch === 'main'`.

Plus metadata-merge test: seed release with `metadata: { previewUrl: 'https://...' }`, assert post-call metadata contains BOTH `previewUrl` AND `dispatch.{slackChannelId, slackMessageTs, dispatchedAt}` (Pitfall 1 — `jsonb_set` not replace).

**SC-2 (RC-05): branch in approval Slack message — unit test**

File: `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts` (new)

Mock `@/lib/slack` (`notifyReleaseApproved`). Seed a release with `branch: 'feat/audio'`. Call POST `/api/projects/{slug}/releases/{releaseId}/approve`. Assert `notifyReleaseApproved` called with `branch: 'feat/audio'`.

Plus separate slack.ts unit test (`src/lib/__tests__/slack-notify.test.ts` — new): assert message header text matches `feat/audio v0.X approved by ...`. Null branch → `main v0.X approved by ...`.

**SC-3 (RC-06): conflict threaded reply — unit test**

File: `src/app/api/platform/promote-callback/route.test.ts` (extend existing 7 tests)

Mock `db.select` to return a release row with `metadata.dispatch.slackChannelId` + `metadata.dispatch.slackMessageTs`. Mock `postSlackThreadedReply`. POST callback with `result: 'conflict'`, `conflict_files: [50 paths]`, `rebase_error: '...'`.

Assert:
- 201 returned
- `db.insert(promote_attempts)` called once
- `postSlackThreadedReply` called once with `channel`, `thread_ts`, `text` containing `:warning: Cannot promote feat/X — conflicts with main:` AND first 50 files AND `Rebase manually on main, push as a new RC to retry.`
- For >50 files: assert text ends with `+ N more files` line

Plus symmetric tests:
- `result: 'merged'` → `:white_check_mark: Promoted feat/X to main (sha: abc1234)`
- `result: 'ci_failed'` → `:no_entry: CI failed for feat/X — see https://...`

Plus missing-metadata test: release row with `metadata.dispatch === undefined`. Assert 201, db.insert still called, `postSlackThreadedReply` NOT called, console.warn fires.

**SC-4 (RC-08): concurrent approval safety — integration test**

File: `src/lib/__tests__/release-concurrent.test.ts` (new)

Seed two `release_logs` rows in a real test DB (or mocked) on `feat/change-font` and `feat/add-audio`. Run `approveRelease` for both concurrently with `await Promise.all([...])`. Assert:
- Both `releaseApprovals` rows inserted (decision=approved)
- Both `releaseLogs.status === 'approved'`
- No cross-contamination: each release's approver, ipAddress, userAgent matches its own input
- After mocked `promoteAndAudit` calls, two independent `promote_attempts` mocks recorded with their respective branches

This proves D-16: per-row keying by `release.id` UUID prevents serialization.

### Wave 0 Gaps

- [ ] `src/lib/release-promotion.test.ts` — extend to cover RC-04 (workflow file, branch input, null-branch fallback, metadata merge preserving previewUrl)
- [ ] `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts` (NEW) — covers RC-05 server-side (branch passed to notifyReleaseApproved)
- [ ] `src/lib/__tests__/slack-notify.test.ts` (NEW) — covers RC-05 message format
- [ ] `src/app/api/platform/promote-callback/route.test.ts` — extend with 4 new tests (conflict, merged, ci_failed, missing-metadata) — covers RC-06
- [ ] `src/lib/__tests__/release-concurrent.test.ts` (NEW) — covers RC-08
- [ ] No new devDeps required (Vitest, NextRequest mocking, all already in place from Phase 5 Wave 0)

---

## Implementation Approach

### Recommended Plan Sequencing (4 Plans)

**Plan 06-01: promoteAndAudit dispatch target + metadata write (RC-04)**

Files modified:
- `src/lib/release-promotion.ts`: change `workflowFile` + `inputs`, add `jsonb_set` metadata write, update success threaded reply text.
- `src/lib/release-promotion.test.ts`: update 3 existing assertions (workflow file name, inputs, reply text), add 2 new tests (branch dispatch, null-branch fallback), add 1 test for metadata write mock call.

This is the foundation — all downstream plans assume the `dispatch.*` metadata is written here.

**Plan 06-02: notifyReleaseApproved branch inclusion (RC-05)**

Files modified:
- `src/lib/slack.ts`: extend `notifyReleaseApproved` input type with `branch: string | null`, update header text.
- `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts`: add `branch: release.branch ?? null` to the `notifyReleaseApproved` call.

New test file:
- `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.test.ts`: assert `notifyReleaseApproved` called with `branch`; mock `@/lib/slack`.

**Plan 06-03: promote-callback Slack threaded reply (RC-06)**

Files modified:
- `src/app/api/platform/promote-callback/route.ts`: add imports (`releaseLogs`, `desc`, Slack helper), add `buildPromoteReplyText` helper, add release lookup + metadata read + `postSlackThreadedReply` call after insert.

Tests extended:
- `src/app/api/platform/promote-callback/route.test.ts`: add test cases for conflict reply (mocked `postSlackThreadedReply` called with correct text + truncation at 50 files), merged reply, ci_failed reply, missing metadata (skip Slack, still 201), db mock for release lookup.

**Plan 06-04: RC-08 integration test + onboarding-projects.md update**

New test file:
- `src/lib/__tests__/release-concurrent.test.ts`: seed two `release_logs` rows on different branches, call `approveRelease` concurrently on both, assert both produce independent `promote_attempts` inserts, assert both `releaseLogs.promotionDispatchedAt` populated.

Documentation:
- `docs/onboarding-projects.md`: new step documenting the consumer's local `promote-branch.yml` stub YAML content and how to add `ADMIN_API_TOKEN` Actions secret.

---

## Risks & Pitfalls

### Pitfall 1: JSONB Replace Overwrites previewUrl

**What goes wrong:** Naively calling `db.update(releaseLogs).set({ metadata: { dispatch: {...} } })` replaces the entire `metadata` object, losing `previewUrl` that Phase 2 wrote.

**Why it happens:** Drizzle's `set()` with a plain JS object performs a full column UPDATE, not a merge.

**How to avoid:** Use `sql\`jsonb_set(...)\`` as shown in the Codebase Patterns section. Confirmed safe on CockroachDB.

**Warning sign:** Any test that seeds a release with `metadata: { previewUrl: '...' }` and asserts `previewUrl` still exists after `promoteAndAudit` would catch this — add such an assertion to the plan 06-01 test.

---

### Pitfall 2: `db.update` Chain Mock in Existing Tests

The existing `release-promotion.test.ts` mock (lines 15–18) only supports `.set().where()` — it does NOT support `sql` tagged template literals as the value of a `set()` property:

```typescript
const mockUpdate = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: mockSelect }) }),
    update: () => ({ set: () => ({ where: mockUpdate }) }),
  },
}));
```

If `promoteAndAudit` passes `metadata: sql\`jsonb_set(...)\`` to `.set()`, the mock still works because `.set()` just calls `mockUpdate` via `.where()`. The SQL tag expression is a value — Drizzle doesn't execute it until query time. The mock captures the call correctly.

**Verify:** In the new test, assert `mockUpdate` was called once (the single `.update().set().where()` call), not that the exact SQL was passed — SQL template literal assertions are brittle. Instead, assert the auditable fields (`promotionDispatchedAt`, `promotionDispatchedBy`) were part of the object passed to `.set()`. This requires the mock to capture the arguments:

```typescript
const mockSetCapture = vi.fn().mockReturnValue({ where: mockUpdate });
// replace: update: () => ({ set: () => ({ where: mockUpdate }) })
// with:    update: () => ({ set: mockSetCapture })
```

Plan 06-01 should update the mock to capture `.set()` args.

---

### Pitfall 3: promote-callback Mock Needs Second DB Query

The existing `promote-callback/route.test.ts` mocks only `db.insert`. Phase 6 adds a `db.select` call for the release lookup. The test file will need a second mock:

```typescript
const selectMock = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve(selectMock()) }) }) }) }),
  },
}));
```

All existing 7 tests pass `selectMock` returning an empty array (default), which triggers D-11 (skip Slack). New tests explicitly seed `selectMock` with a release row containing `metadata.dispatch.*`.

---

### Pitfall 4: Backwards Compat — Old Slack Messages Without Branch

Slack messages posted before Phase 6 will have button values that decode to `releaseId` only. The `release` DB lookup in `/api/slack/interact` always fetches `release.branch` from the current DB state — not from the Slack payload. So old messages work correctly: the Slack click still fetches the current release row, `release.branch` comes from the DB (Phase 3 backfilled all to `'main'`), and `promoteAndAudit` uses `release.branch ?? 'main'`. No special backwards-compat code needed.

---

### Pitfall 5: `postSlackThreadedReply` Not Exported to promote-callback Route

Currently `postSlackThreadedReply` is exported from `src/lib/slack.ts` (line 47: `export async function postSlackThreadedReply`). The promote-callback route does not currently import from `@/lib/slack`. Phase 6 adds this import — no conflict.

---

### Pitfall 6: `releaseLogs` Not Imported in promote-callback Route

The route currently imports only `promoteAttempts` from `@/db/schema`. Phase 6 adds `releaseLogs`. Also needs `desc`, `and`, `eq` from `drizzle-orm` (currently only `drizzle-orm` is not imported — check: the route only uses the schema object, no query builders). Add: `import { releaseLogs } from '@/db/schema'` and `import { and, desc, eq } from 'drizzle-orm'`.

---

### Pitfall 7: `jsdom` Environment and `sql` Tagged Template

`vitest.config.ts` sets `environment: 'jsdom'` globally. API route tests use `NextRequest` which is available in jsdom as a global via `next/server`. The `sql` template tag from `drizzle-orm` is a pure Node.js module — it does not interact with the DOM. No environment mismatch issue.

The existing `promote-callback/route.test.ts` and `release-promotion.test.ts` both work under jsdom (they use `NextRequest` and Drizzle mocks successfully). The new Phase 6 tests follow the same pattern.

---

### Pitfall 8: Metadata Write Timing vs. 3-Second Slack Rule

`promoteAndAudit` is called fire-and-forget from `/api/slack/interact` (line 192). The 3-second Slack window is handled by responding to Slack BEFORE the `promoteAndAudit` call returns (the outer `return NextResponse.json(...)` at line 205 runs immediately after `.catch()` is attached).

The metadata write is inside `promoteAndAudit` itself — it does NOT block the Slack response. The fire-and-forget pattern established in v1.14 (STATE.md) is preserved. No risk to the 3-second window.

---

### Pitfall 9: `promote-callback` Release Lookup — Project from Auth vs. Body

The promote-callback route uses `project!.key` from `requireApiKey` (not from the request body). The release lookup must use this same `project.key`:
```typescript
.where(and(
  eq(releaseLogs.project, project!.key),   // from requireApiKey
  eq(releaseLogs.branch, branch as string) // from body
))
```
This matches the `promoteAttempts` insert which also uses `project!.key`. Consistent.

---

### Pitfall 10: `branch` Column Null on Legacy Release Rows

Phase 3 backfilled all legacy `release_logs.branch` rows to `'main'`. New rows from Phase 2's `deploy-firebase.yml` include the branch from the `git_branch` workflow input. The `releaseLogs.branch` column is defined as `.default('main')` with no `.notNull()`.

In the promote-callback lookup, if a row has `branch = null` (extremely unlikely after backfill, but defensive), the `eq(releaseLogs.branch, 'main')` filter would NOT match it (SQL `NULL != 'main'`). Handle by using `coalesce` or adding `branch ?? 'main'` before passing to the filter — but since Phase 3 backfill ran and all new rows default to 'main', this is LOW risk. Document the assumption in the plan.

---

## Open Questions

None — ready to plan.

All D-01 through D-17 decisions are clear and grounded in the existing codebase. The button value format question (D-06) is resolved: Option A (no change to the signed value; branch flows from the DB-fetched release row) is the correct implementation and requires no changes to `slack-crypto.ts` or `notifyReleaseApproved`'s button construction.

---

## RESEARCH COMPLETE
