/**
 * Ad-hoc invocation of the project state backfill. Same lib code that the
 * admin's POST /api/platform/projects/sync-state route calls.
 *
 * Usage: npx tsx scripts/sync-state.ts          # sync all
 *        npx tsx scripts/sync-state.ts <key>    # sync one
 *        DRY_RUN=1 npx tsx scripts/sync-state.ts
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { projects } from '../src/db/schema';
import { syncFromGithub, diff } from '../src/lib/sync-project-state';

function loadDbUrl(): string {
  const env = readFileSync(
    '/Users/mikegeehan/claude/triarch/development/thisnthat/.env.local',
    'utf8'
  );
  const dbLine = env.split('\n').find((l) => l.startsWith('DATABASE_URL=')) ?? '';
  return dbLine.replace(/^DATABASE_URL=/, '').replace('/thisandthat?', '/triarch_dev?');
}

async function main() {
  const filterKey = process.argv[2];
  const dryRun = process.env.DRY_RUN === '1';
  const ghToken = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();

  const pool = new Pool({ connectionString: loadDbUrl() });
  const db = drizzle(pool, { schema: { projects } });
  try {
    const rows = filterKey
      ? await db.select().from(projects).where(eq(projects.key, filterKey))
      : await db.select().from(projects);

    if (filterKey && rows.length === 0) {
      console.error(`No project with key=${filterKey}`);
      process.exit(1);
    }

    let updatedCount = 0;
    for (const project of rows) {
      const synced = await syncFromGithub(project, ghToken);
      const result = diff(project, synced);

      const arrow = result.changed ? '→' : '·';
      const ver =
        result.changed && result.before.currentVersion !== result.after.currentVersion
          ? `${result.before.currentVersion ?? '-'} ${arrow} ${result.after.currentVersion ?? '-'}`
          : `${result.after.currentVersion ?? '-'}`;
      const status =
        result.changed && result.before.status !== result.after.status
          ? `${result.before.status} ${arrow} ${result.after.status}`
          : `${result.after.status}`;
      console.log(`  ${result.key.padEnd(28)} ${ver.padEnd(28)} ${status.padEnd(20)} (${result.detail})`);

      if (result.changed && !dryRun) {
        await db
          .update(projects)
          .set({
            currentVersion: result.after.currentVersion,
            status: result.after.status,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, project.id));
        updatedCount++;
      }
    }
    console.log(`\n${dryRun ? 'DRY RUN — would update' : 'Updated'} ${updatedCount} project(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
