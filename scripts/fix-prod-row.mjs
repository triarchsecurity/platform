import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

// Delete the bad 'v'-only row
const del = await pool.query(`DELETE FROM release_logs WHERE project='triarch-dev-tmi' AND env='prod' AND version='v' RETURNING id`);
console.log('Deleted bad row(s):', del.rowCount);

// Insert correct
const ins = await pool.query(`
  INSERT INTO release_logs (id, project, version, release_type, released_at, released_by, summary, entries, metadata, env, status, commit_sha, deployed_at, branch, created_at)
  SELECT gen_random_uuid(), 'triarch-dev-tmi', 'v4.46.1', 'patch', NOW(), 'manual-hand-fire', NULL, '[]'::jsonb, '{"source":"manual-replacement-for-skipped-record-release-job-prod","note":"first-prod-cl4-pass-after-backfill"}'::jsonb, 'prod', 'promoted', '1fd44605775363e0f65de425441a8d26adf76f1f', '2026-05-17T20:34:58Z', 'main', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM release_logs WHERE project='triarch-dev-tmi' AND env='prod' AND commit_sha='1fd44605775363e0f65de425441a8d26adf76f1f' AND version != 'v'
  )
  RETURNING version, deployed_at
`);
console.log('Inserted:', ins.rows[0] || '(skipped - exists)');

const final = await pool.query(`SELECT version, deployed_at FROM release_logs WHERE project='triarch-dev-tmi' AND env='prod' ORDER BY deployed_at DESC LIMIT 1`);
console.log('prod now:', final.rows[0]);
await pool.end();
