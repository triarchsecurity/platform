/**
 * Migration runner for 0024_tenant_llm_usage.sql.
 *
 * Creates the `tenant_llm_usage` table — the central receiver store for the
 * cross-tenant LLM usage/cost dashboard. Each Atlas tenant pushes daily
 * summaries to POST /api/platform/ingest/llm-usage; this table holds them.
 *
 * Uses Node 22's process.loadEnvFile (no dotenv dep) per the
 * security-portal lesson where dotenv was an unwanted dependency add.
 *
 * Usage:
 *   npx tsx scripts/run-migration-0024.ts
 *
 * Reads DATABASE_URL from .env.local at the repo root. If running this
 * from a non-root cwd the path.resolve anchors it to this file's parent.
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const MIGRATION_FILE = '0024_tenant_llm_usage.sql';

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

    console.log('\n=== Verify tenant_llm_usage table ===');
    const cols = await c.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_name = 'tenant_llm_usage'
        ORDER BY ordinal_position`,
    );
    if (cols.rows.length === 0) {
      console.error('  FAIL: tenant_llm_usage table not found');
      process.exit(1);
    }
    cols.rows.forEach((r) => console.log(`  ${r.column_name.padEnd(14)} ${r.data_type} (nullable=${r.is_nullable})`));

    const idx = await c.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'tenant_llm_usage'`,
    );
    const idxNames = new Set(idx.rows.map((r) => r.indexname));
    if (!idxNames.has('tenant_llm_usage_unique')) {
      console.error('  FAIL: tenant_llm_usage_unique index missing');
      process.exit(1);
    }
    console.log('  OK: table + tenant_llm_usage_unique index present');
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
