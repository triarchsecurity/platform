import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

// Discover actual columns
const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='projects' ORDER BY ordinal_position`);
console.log('projects columns:', cols.rows.map(r=>r.column_name).join(', '));
console.log('');

const projects = await pool.query(`SELECT key, name FROM projects ORDER BY key`);
console.log('All projects (' + projects.rows.length + '):');
for (const r of projects.rows) console.log(`  ${r.key.padEnd(28)} ${r.name||''}`);

console.log('\nrelease_logs columns:');
const rcols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='release_logs' ORDER BY ordinal_position`);
console.log('  ' + rcols.rows.map(r=>r.column_name).join(', '));

console.log('\nrelease_logs latest by project + env:');
const logs = await pool.query(`
  WITH ranked AS (
    SELECT project, env, version, deployed_at, status,
           ROW_NUMBER() OVER (PARTITION BY project, env ORDER BY deployed_at DESC NULLS LAST) AS rn
    FROM release_logs
    WHERE project IN ('triarch-dev-tmi', 'triarchsecurity-portal', 'triarchsecurity-admin', 'tmi', 'portal')
  )
  SELECT project, env, version, deployed_at, status FROM ranked WHERE rn <= 2
  ORDER BY project, env, deployed_at DESC NULLS LAST
`);
for (const r of logs.rows) console.log(`  ${(r.project||'?').padEnd(25)} env=${(r.env||'?').padEnd(5)} ver=${(r.version||'?').padEnd(14)} status=${(r.status||'?').padEnd(20)} ${r.deployed_at||'?'}`);
await pool.end();
