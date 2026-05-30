import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });
const r = await pool.query(`
  SELECT version, env, released_by, status, commit_sha, deployed_at
  FROM release_logs
  WHERE project='triarch-dev-tmi' AND version='v4.46.3'
  ORDER BY created_at DESC LIMIT 3
`);
if (r.rows.length === 0) console.log('No v4.46.3 rows yet');
for (const row of r.rows) console.log(`  ${row.version} env=${row.env} by=${row.released_by} sha=${(row.commit_sha||'').slice(0,8)} deployed=${row.deployed_at}`);
await pool.end();
