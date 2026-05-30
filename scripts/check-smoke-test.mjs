import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });
const r = await pool.query(`
  SELECT version, env, released_by, deployed_at, status, commit_sha
  FROM release_logs
  WHERE project='triarch-dev-tmi' AND version IN ('v4.46.2','v4.46.1')
  ORDER BY created_at DESC LIMIT 5
`);
for (const row of r.rows) console.log(`  ${row.version}  env=${row.env}  by=${row.released_by}  sha=${(row.commit_sha||'').slice(0,8)}  deployed=${row.deployed_at}`);
console.log('---');
const latest = await pool.query(`SELECT version, deployed_at FROM release_logs WHERE project='triarch-dev-tmi' AND env='dev' ORDER BY deployed_at DESC LIMIT 1`);
console.log('version-snapshot dev now returns:', latest.rows[0]);
await pool.end();
