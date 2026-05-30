import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });
const r = await pool.query(`
  INSERT INTO release_logs (id, project, version, release_type, released_at, released_by, summary, entries, metadata, env, status, commit_sha, deployed_at, branch, created_at)
  SELECT gen_random_uuid(), 'triarch-dev-tmi', 'v', 'patch', NOW(), 'manual-hand-fire', NULL, '[]'::jsonb, '{"source":"manual-replacement-for-skipped-record-release-job-prod"}'::jsonb, 'prod', 'promoted', '1fd44605775363e0f65de425441a8d26adf76f1f', '2026-05-17T20:34:58Z', 'main', NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM release_logs WHERE project='triarch-dev-tmi' AND env='prod' AND commit_sha='1fd44605775363e0f65de425441a8d26adf76f1f'
  )
  RETURNING id, version, env, deployed_at
`);
if (r.rowCount > 0) console.log('Inserted:', r.rows[0]);
else console.log('Already exists, skipped');

const verify = await pool.query(`SELECT version, deployed_at FROM release_logs WHERE project='triarch-dev-tmi' AND env='prod' ORDER BY deployed_at DESC LIMIT 1`);
console.log('version-snapshot prod will now return:', verify.rows[0]);
await pool.end();
