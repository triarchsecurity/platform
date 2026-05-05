/**
 * Phase 7 OTTOBOT-01 — Slack action audit writer.
 *
 * Called at the END of every Slack route handler (/api/slack/interact,
 * /api/slack/commands, /api/slack/events). Inserts one row to
 * slack_action_audit per request with action_id, actor email, raw Slack
 * user_id, sha256 hash of the raw body, the HTTP status returned to Slack,
 * and the dispatcher latency.
 *
 * Per Phase 7 D-08 (Slack-best-effort pattern from Phase 6 D-15): on insert
 * failure, console.warn and continue. NEVER throws. The Slack 3-second rule
 * wins; audit is best-effort. Callers MUST invoke with `void` prefix or
 * .catch() so the route handler's response never awaits this function.
 *
 * Per Phase 7 D-09: payload_hash is sha256 hex of the raw HTTP body bytes
 * BEFORE any parsing — deterministic and matches what Slack signed.
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { slackActionAudit } from '@/db/schema';

export interface SlackAuditInput {
  /** Slack action_id (interact), `command_subcommand` synthetic id (commands), or `event_<type>` synthetic id (events). */
  actionId: string;
  /** Resolved staff email via resolveSlackUserEmail; null when Slack user is unmapped. */
  actorEmail: string | null;
  /** Raw Slack user_id (Uxxxxx). Always present per Phase 7 D-11; 'unknown' fallback if Slack omitted. */
  actorSlackId: string;
  /** Raw HTTP body bytes (req.text() result). NEVER stored — only hashed. */
  rawBody: string;
  /** HTTP status returned to Slack — 200, 4xx, or 5xx. */
  responseStatus: number;
  /** Dispatcher latency in ms. Always < 3000 per Slack 3-second rule (column type integer). */
  latencyMs: number;
}

/**
 * Writes a slack_action_audit row. Best-effort — never throws.
 * On failure, logs a warning and resolves anyway.
 */
export async function recordSlackAudit(input: SlackAuditInput): Promise<void> {
  try {
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    await db.insert(slackActionAudit).values({
      actionId: input.actionId,
      actorEmail: input.actorEmail,
      actorSlackId: input.actorSlackId,
      payloadHash,
      responseStatus: input.responseStatus,
      latencyMs: input.latencyMs,
    });
  } catch (err) {
    console.warn('[slack-audit] audit insert failed (best-effort):', err);
  }
}
