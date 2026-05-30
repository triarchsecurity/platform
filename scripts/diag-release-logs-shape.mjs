import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

// Check release_type + status distribution + non-null fields used in real data
const r = await pool.query(`
  SELECT release_type, status, env, COUNT(*) AS n
  FROM release_logs
  WHERE project IN ('triarch-dev-tmi', 'triarchsecurity-portal', 'triarchsecurity-admin')
  GROUP BY release_type, status, env
  ORDER BY release_type, status, env
`);
console.log('release_type/status/env distribution (existing real data):');
for (const row of r.rows) console.log(`  type=${(row.release_type||'NULL').padEnd(14)} status=${(row.status||'NULL').padEnd(15)} env=${(row.env||'NULL').padEnd(6)} n=${row.n}`);

// Sample row for a recent admin release to see what fields are populated
const sample = await pool.query(`
  SELECT *
  FROM release_logs
  WHERE project='triarchsecurity-admin' AND env='dev' AND version LIKE 'v3.5%'
  ORDER BY deployed_at DESC LIMIT 1
`);
console.log('\nSample admin dev release row:');
console.log(JSON.stringify(sample.rows[0], null, 2));

await pool.end();
