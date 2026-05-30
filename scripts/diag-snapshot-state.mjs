import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });
for (const e of ['dev','prod']) {
  const r = await pool.query(
    `SELECT version, deployed_at, status FROM release_logs WHERE project='triarch-dev-tmi' AND env=$1 ORDER BY deployed_at DESC LIMIT 1`, [e]);
  console.log(`triarch-dev-tmi ${e.padEnd(5)}: ${r.rows[0]?.version || 'NULL'}  ${r.rows[0]?.deployed_at || ''}  status=${r.rows[0]?.status || ''}`);
}
const j = await pool.query(`SELECT COUNT(*) AS n FROM release_logs WHERE project='triarch-dev-tmi' AND version IN ('0.7.4','0.7.2','v0.7.4','v0.7.2')`);
console.log(`Remaining junk rows: ${j.rows[0].n}`);
await pool.end();
