import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

const r = await pool.query(`
  UPDATE projects 
  SET firebase_project_id = 'triarchsecurity-portal', updated_at = NOW()
  WHERE key = 'triarchsecurity-portal' AND firebase_project_id IS NULL
  RETURNING key, firebase_project_id
`);
if (r.rowCount === 0) {
  // Maybe already set?
  const cur = await pool.query(`SELECT firebase_project_id FROM projects WHERE key='triarchsecurity-portal'`);
  console.log('No update (current value):', cur.rows[0]);
} else {
  console.log('Updated:', r.rows[0]);
}
await pool.end();
