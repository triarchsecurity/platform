import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

const DRY_RUN = !process.argv.includes('--execute');
console.log(DRY_RUN ? '[DRY-RUN]' : '[EXECUTE]', 'mode');

// Load backfill CSV from TMI repo
const csv = readFileSync('/Users/mikegeehan/claude/triarch/development/tmi/scripts/fah-backfill.csv', 'utf-8');
const rows = csv.trim().split('\n').slice(1).map(l => {
  const [project,env,version,deployed_at,rollout,sha] = l.split(',');
  return { project, env, version, deployed_at, rollout, sha };
}).filter(r => r.version && r.version !== 'v?' && r.sha !== '?');

console.log(`Loaded ${rows.length} backfill rows from FAH manifest`);
const branchFor = e => e === 'prod' ? 'main' : 'dev';

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Step 1: DELETE junk
  console.log('\n=== STEP 1: DELETE junk rows ===');
  const delQuery = `DELETE FROM release_logs 
    WHERE project='triarch-dev-tmi' 
      AND env IN ('dev','prod') 
      AND version IN ('0.7.4','0.7.2','v0.7.4','v0.7.2')
    RETURNING id, env, version, deployed_at`;
  const delResult = await client.query(delQuery);
  console.log(`Would delete ${delResult.rows.length} junk rows:`);
  for (const r of delResult.rows) console.log(`  - ${r.env} ${r.version} ${r.deployed_at}`);

  // Step 2: INSERT backfill (idempotent — skip if a row with same project+env+commit_sha exists)
  console.log('\n=== STEP 2: INSERT backfill rows ===');
  let inserted = 0, skipped = 0;
  for (const r of rows) {
    const exists = await client.query(
      `SELECT 1 FROM release_logs WHERE project=$1 AND env=$2 AND commit_sha=$3 LIMIT 1`,
      ['triarch-dev-tmi', r.env, r.sha === '?' ? null : r.sha]
    );
    if (exists.rowCount > 0) { skipped++; continue; }
    await client.query(
      `INSERT INTO release_logs 
        (id, project, version, release_type, released_at, released_by, summary, entries, metadata, env, status, commit_sha, deployed_at, branch, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'unknown', $3, 'fah-backfill', NULL, '[]'::jsonb, '{"source":"fah-backfill-2026-05-17"}'::jsonb, $4, $5, $6, $3, $7, NOW())`,
      ['triarch-dev-tmi', r.version, r.deployed_at, r.env, r.env === 'prod' ? 'promoted' : 'dev', r.sha, branchFor(r.env)]
    );
    inserted++;
  }
  console.log(`Would insert ${inserted} new rows; skipped ${skipped} existing (idempotent)`);

  // Step 3: Verify what version-snapshot will return
  console.log('\n=== STEP 3: Verify (what version-snapshot will see post-commit) ===');
  for (const env of ['dev','prod']) {
    const q = await client.query(
      `SELECT version, deployed_at, status FROM release_logs 
       WHERE project='triarch-dev-tmi' AND env=$1 
       ORDER BY deployed_at DESC NULLS LAST LIMIT 1`,
      [env]
    );
    if (q.rows[0]) console.log(`  ${env.padEnd(5)}: ${q.rows[0].version}  (${q.rows[0].deployed_at})  status=${q.rows[0].status}`);
    else console.log(`  ${env.padEnd(5)}: NO ROWS`);
  }

  if (DRY_RUN) {
    await client.query('ROLLBACK');
    console.log('\n[DRY-RUN] Rolled back. Re-run with --execute to commit.');
  } else {
    await client.query('COMMIT');
    console.log('\n[COMMITTED]');
  }
} catch (e) {
  await client.query('ROLLBACK');
  console.error('Error, rolled back:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
