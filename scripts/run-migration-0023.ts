/**
 * Migration runner for 0023_public_note.sql.
 *
 * Adds the nullable `public_note` text column to bug_reports and
 * feature_requests (TRI-16, AC2 of TRI-9) — the customer-visible counterpart
 * to the internal `triarch_notes` column.
 *
 * Uses Node 22's process.loadEnvFile (no dotenv dep) per the
 * security-portal lesson where dotenv was an unwanted dependency add.
 *
 * Usage:
 *   npx tsx scripts/run-migration-0023.ts
 *
 * Reads DATABASE_URL from .env.local at the repo root. If running this
 * from a non-root cwd the path.resolve anchors it to this file's parent.
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const MIGRATION_FILE = '0023_public_note.sql';

async function main() {
  // Anchor .env.local path to the repo root (one level up from scripts/).
  const envPath = path.resolve(__dirname, '..', '.env.local');
  try {
    process.loadEnvFile(envPath);
  } catch (e) {
    // Allow inline DATABASE_URL to win if .env.local is missing.
    console.warn(`[warn] Could not load ${envPath}: ${(e as Error).message}`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set (neither in env nor in .env.local).');
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, '..', 'src', 'db', 'migrations', MIGRATION_FILE);
  const sql = readFileSync(filePath, 'utf8');

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    console.log(`=== Apply ${MIGRATION_FILE} ===`);
    await c.query(sql);
    console.log('  done');

    console.log('\n=== Verify public_note columns ===');
    const cols = await c.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE column_name = 'public_note'
          AND table_name IN ('bug_reports', 'feature_requests')
        ORDER BY table_name`,
    );
    cols.rows.forEach((r) => console.log(`  ${r.table_name.padEnd(18)} ${r.column_name} ${r.data_type} (nullable=${r.is_nullable})`));
    const tablesWithCol = new Set(cols.rows.map((r) => r.table_name));
    const expected = ['bug_reports', 'feature_requests'];
    const missing = expected.filter((t) => !tablesWithCol.has(t));
    if (missing.length > 0) {
      console.error(`  FAIL: public_note missing on: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log('  OK: public_note present on both tables');
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
