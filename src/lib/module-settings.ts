import { db } from '@/lib/db';
import { moduleSettings } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface GetSettingOpts {
  project: string;
  module: string;
  userId?: string;
  companyId?: string;
}

/**
 * Get effective setting with scope inheritance: user > company > global.
 * Returns the merged settings object, or null if no settings exist.
 */
export async function getEffectiveSetting(opts: GetSettingOpts): Promise<Record<string, unknown> | null> {
  const { project, module: mod, userId, companyId } = opts;

  // Fetch all matching scopes in one query
  const rows = await db
    .select()
    .from(moduleSettings)
    .where(
      and(
        eq(moduleSettings.project, project),
        eq(moduleSettings.module, mod),
      )
    );

  const globalRow = rows.find((r) => r.scope === 'global' && !r.scopeId);
  const companyRow = companyId ? rows.find((r) => r.scope === 'company' && r.scopeId === companyId) : undefined;
  const userRow = userId ? rows.find((r) => r.scope === 'user' && r.scopeId === userId) : undefined;

  // Merge: global < company < user (later overrides earlier)
  let merged: Record<string, unknown> = {};
  if (globalRow) merged = { ...merged, ...(globalRow.settings as Record<string, unknown>) };
  if (companyRow) merged = { ...merged, ...(companyRow.settings as Record<string, unknown>) };
  if (userRow) merged = { ...merged, ...(userRow.settings as Record<string, unknown>) };

  return Object.keys(merged).length > 0 ? merged : null;
}

interface SetSettingOpts {
  project: string;
  module: string;
  scope: 'global' | 'company' | 'user';
  scopeId?: string;
  settings: Record<string, unknown>;
}

/**
 * Upsert a module setting. Uses ON CONFLICT to update if exists.
 */
export async function setSetting(opts: SetSettingOpts) {
  const { project, module: mod, scope, scopeId, settings } = opts;

  // Check if exists
  const existing = await db
    .select()
    .from(moduleSettings)
    .where(
      and(
        eq(moduleSettings.project, project),
        eq(moduleSettings.module, mod),
        eq(moduleSettings.scope, scope),
        scopeId ? eq(moduleSettings.scopeId, scopeId) : isNull(moduleSettings.scopeId),
      )
    );

  if (existing.length > 0) {
    await db
      .update(moduleSettings)
      .set({ settings, updatedAt: new Date() })
      .where(eq(moduleSettings.id, existing[0].id));
    return existing[0].id;
  } else {
    const [row] = await db
      .insert(moduleSettings)
      .values({
        project,
        module: mod,
        scope,
        scopeId: scopeId ?? null,
        settings,
      })
      .returning();
    return row.id;
  }
}
