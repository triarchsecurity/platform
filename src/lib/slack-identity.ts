/**
 * Maps Slack user_id → staff email.
 * v2.0: SLACK_USER_MAP is now sourced from the central vault (@triarchsecurity/secrets).
 * The vault stores it as a JSON-stringified object: {"<slack_user_id>":"<email>"}.
 * Falls back to {} when vault read fails or JSON is malformed (graceful degradation —
 * the calling slack/interact route already 403s when email lookup returns null).
 */
import { getSecret } from '@triarchsecurity/secrets';

async function loadUserMap(): Promise<Record<string, string>> {
  try {
    const json = await getSecret('SLACK_USER_MAP');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === 'string') result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Resolves a Slack user_id to a staff email address.
 * Returns null for unmapped, null, or undefined input.
 * Returns null on vault read failure or JSON parse error (graceful — caller 403s).
 */
export async function resolveSlackUserEmail(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const map = await loadUserMap();
  return map[userId] ?? null;
}
