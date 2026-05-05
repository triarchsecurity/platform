// WORKFLOW-05: promote-branch.yml callback ingest.
// Decision refs: 04-CONTEXT.md D-10..D-13. Snake_case wire format (matches /api/releases/promoted convention).
// RC-06: threaded Slack reply for conflict/merged/ci_failed results (06-03-PLAN.md).
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { requireApiKey } from '@/lib/api-key-auth';
import { db } from '@/lib/db';
import { promoteAttempts, releaseLogs } from '@/db/schema';
import { postSlackThreadedReply } from '@/lib/slack';

type PromoteResult = 'merged' | 'conflict' | 'ci_failed';
const VALID_RESULTS: ReadonlyArray<PromoteResult> = ['merged', 'conflict', 'ci_failed'];

/**
 * Build the threaded Slack reply text for a promote-branch.yml result.
 * Per D-12 (conflict) and D-13 (merged / ci_failed).
 */
export function buildPromoteReplyText(
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

export async function POST(req: NextRequest) {
  // Auth — same per-project Bearer token pattern as releases/promoted (D-11).
  const { error, project } = await requireApiKey(req);
  if (error) return error;

  const body = await req.json();
  const { branch, result, merge_sha, conflict_files, rebase_error, ci_run_url } = body as {
    branch: unknown;
    result: unknown;
    merge_sha: unknown;
    conflict_files: unknown;
    rebase_error: unknown;
    ci_run_url: unknown;
  };

  // Validate required fields (D-12 — branch and result are mandatory).
  const missingFields: string[] = [];
  if (!branch || typeof branch !== 'string') missingFields.push('branch');
  if (!result || typeof result !== 'string' || !VALID_RESULTS.includes(result as PromoteResult)) {
    missingFields.push('result');
  }
  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required field(s): ${missingFields.join(', ')}` },
      { status: 400 }
    );
  }

  // Insert into promote_attempts (camelCase TS property names → snake_case DB columns via Drizzle).
  const [row] = await db
    .insert(promoteAttempts)
    .values({
      project: project!.key,
      branch: branch as string,
      result: result as PromoteResult,
      mergeSha: typeof merge_sha === 'string' ? merge_sha : null,
      conflictFiles: Array.isArray(conflict_files) ? conflict_files : [],
      rebaseError: typeof rebase_error === 'string' ? rebase_error : null,
      ciRunUrl: typeof ci_run_url === 'string' ? ci_run_url : null,
    })
    .returning();

  // RC-06: look up the most recent release on (project, branch) to find the Slack thread anchor
  // written by promoteAndAudit (Plan 06-01) at metadata.dispatch.{slackChannelId, slackMessageTs}.
  const [latestRelease] = await db
    .select()
    .from(releaseLogs)
    .where(
      and(
        eq(releaseLogs.project, project!.key),
        eq(releaseLogs.branch, branch as string)
      )
    )
    .orderBy(desc(releaseLogs.deployedAt), desc(releaseLogs.releasedAt))
    .limit(1);

  const meta = (latestRelease?.metadata ?? null) as { dispatch?: { slackChannelId?: string; slackMessageTs?: string } } | null;
  const dispatch = meta?.dispatch;

  if (!dispatch?.slackChannelId || !dispatch?.slackMessageTs) {
    // D-11: best-effort Slack reply — missing thread anchor is logged but does not fail the 201 response
    console.warn('[promote-callback] no Slack metadata on release — skipping threaded reply', {
      project: project!.key,
      branch,
      releaseId: latestRelease?.id ?? null,
    });
    return NextResponse.json(row, { status: 201 });
  }

  // D-15: best-effort Slack post — try/catch around the call
  try {
    const replyText = buildPromoteReplyText(
      result as PromoteResult,
      branch as string,
      typeof merge_sha === 'string' ? merge_sha : null,
      Array.isArray(conflict_files) ? (conflict_files as string[]) : [],
      typeof ci_run_url === 'string' ? ci_run_url : null
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
}
