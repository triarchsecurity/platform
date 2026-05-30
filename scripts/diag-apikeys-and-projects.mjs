import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

// Check api_key column shape — is it raw, hashed, or what?
const cols = await pool.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name='projects' 
  ORDER BY ordinal_position`);
console.log('projects columns:');
for (const r of cols.rows) console.log(`  ${r.column_name.padEnd(28)} ${r.data_type}`);

console.log('\n=== sample api_key value shape (first 12 chars only — don\'t leak) ===');
const sample = await pool.query(`SELECT key, LEFT(api_key, 12) AS prefix FROM projects WHERE key='triarch-dev-tmi'`);
console.log(sample.rows[0]);

console.log('\n=== full project→FAH mapping ===');
const m = await pool.query(`
  SELECT key, firebase_project_id, github_repo
  FROM projects WHERE active = true OR active IS NULL
  ORDER BY key`);
for (const r of m.rows) console.log(`  ${r.key.padEnd(25)} firebase=${(r.firebase_project_id||'?').padEnd(28)} repo=${r.github_repo||'?'}`);

await pool.end();
