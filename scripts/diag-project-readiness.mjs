import { Pool } from 'pg';
import { readFileSync } from 'fs';
const env = readFileSync('/Users/mikegeehan/claude/triarch/development/admin/.env.local', 'utf-8');
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '');
const pool = new Pool({ connectionString: url });

const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name LIKE 'api%'`);
const apiCol = cols.rows[0]?.column_name || 'api_key';
console.log('apiKey column:', apiCol);

const r = await pool.query(`
  SELECT
    p.key,
    CASE WHEN p.${apiCol} IS NOT NULL THEN 'yes' ELSE 'no' END AS has_apikey,
    (SELECT COUNT(*) FROM release_logs WHERE project=p.key AND env='dev') AS dev_logs,
    (SELECT COUNT(*) FROM release_logs WHERE project=p.key AND env='prod') AS prod_logs
  FROM projects p ORDER BY p.key`);
console.log('project'.padEnd(28), 'apiKey', 'dev_logs', 'prod_logs');
for (const row of r.rows) console.log(row.key.padEnd(28), row.has_apikey.padEnd(6), String(row.dev_logs).padEnd(8), row.prod_logs);
await pool.end();
