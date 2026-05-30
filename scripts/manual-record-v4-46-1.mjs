import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });
const r = await pool.query(`
  INSERT INTO release_logs (id, project, version, release_type, released_at, released_by, summary, entries, metadata, env, status, commit_sha, deployed_at, branch, created_at)
  VALUES (gen_random_uuid(), 'triarch-dev-tmi', 'v4.46.1', 'patch', NOW(), 'manual-hand-fire', NULL, '[]'::jsonb, '{"source":"manual-replacement-for-skipped-record-release-job"}'::jsonb, 'dev', 'dev', '59c1a1915f2c9507c938b4046b4cecf36cb84571', '2026-05-17T20:21:05Z', 'dev', NOW())
  RETURNING id, version, env, deployed_at, status
`);
console.log('Inserted:', r.rows[0]);
const verify = await pool.query(`SELECT version, deployed_at FROM release_logs WHERE project='triarch-dev-tmi' AND env='dev' ORDER BY deployed_at DESC LIMIT 1`);
console.log('version-snapshot will now return for dev:', verify.rows[0]);
await pool.end();
