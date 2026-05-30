import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });
const projects = ['truth-treason','darksouls-rpg','dev-portal','triarchsecurity-portal','triarchsecurity-admin','triarch-dev'];
for (const key of projects) {
  const r = await pool.query(`
    SELECT env, version, deployed_at, released_by
    FROM release_logs WHERE project=$1
    ORDER BY deployed_at DESC NULLS LAST LIMIT 4`, [key]);
  console.log(`\n${key} (latest 4):`);
  if (r.rows.length === 0) console.log('  (no rows)');
  for (const row of r.rows) console.log(`  ${row.env || '?'}: ${row.version} by=${row.released_by || '?'} at ${row.deployed_at || '?'}`);
}
await pool.end();
