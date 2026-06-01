#!/usr/bin/env tsx
// scripts/grant-agent-scope.ts
//
// Add or remove a scope on an agent_identities row's `scopes` jsonb array.
// Idempotent: granting an existing scope (or revoking a missing one) is a
// no-op that still reports the resulting scope set.
//
// Self-contained: matches the style of mint-agent-token.ts (direct pg Pool +
// DATABASE_URL from env, no @/ aliases, no Drizzle ORM).
//
// Usage:
//   npx tsx scripts/grant-agent-scope.ts --agent operator --grant write:projects
//   npx tsx scripts/grant-agent-scope.ts --agent operator --revoke write:projects
//   npx tsx scripts/grant-agent-scope.ts --agent operator --list
//
// After granting, restart/redeploy the MCP clients that use this agent's
// token so the new scope takes effect on their next call.

import { Pool } from 'pg';

// Keep in sync with AGENT_SCOPES in src/db/schema.ts.
const KNOWN_SCOPES = new Set([
  'read:projects',
  'write:projects',
  'write:audit',
]);

async function main() {
  const args = process.argv.slice(2);
  let agentName = '';
  let grant = '';
  let revoke = '';
  let list = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent') agentName = args[i + 1] ?? '';
    if (args[i] === '--grant') grant = args[i + 1] ?? '';
    if (args[i] === '--revoke') revoke = args[i + 1] ?? '';
    if (args[i] === '--list') list = true;
  }

  if (!agentName || (!grant && !revoke && !list)) {
    console.error(
      'Usage: npx tsx scripts/grant-agent-scope.ts --agent <name> (--grant <scope> | --revoke <scope> | --list)',
    );
    process.exit(1);
  }

  const target = grant || revoke;
  if (target && !KNOWN_SCOPES.has(target)) {
    console.error(`Unknown scope '${target}'. Known: ${[...KNOWN_SCOPES].join(', ')}`);
    console.error('(If this is a new scope, add it to AGENT_SCOPES + KNOWN_SCOPES first.)');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set (check .env.local)');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    const lookup = await c.query<{ id: string; scopes: string[] }>(
      'SELECT id, scopes FROM agent_identities WHERE name = $1',
      [agentName],
    );
    if (lookup.rowCount === 0) {
      console.error(`Agent '${agentName}' not found in agent_identities.`);
      process.exit(2);
    }

    const { id, scopes } = lookup.rows[0];
    const current = new Set(Array.isArray(scopes) ? scopes : []);
    console.log(`Agent '${agentName}' current scopes: [${[...current].join(', ')}]`);

    if (list) return;

    if (grant) current.add(grant);
    if (revoke) current.delete(revoke);

    const next = [...current];
    await c.query('UPDATE agent_identities SET scopes = $1::jsonb WHERE id = $2', [
      JSON.stringify(next),
      id,
    ]);

    console.log(`Agent '${agentName}' updated scopes: [${next.join(', ')}]`);
    if (grant) console.log(`✓ granted '${grant}'`);
    if (revoke) console.log(`✓ revoked '${revoke}'`);
    console.log('Restart/redeploy MCP clients using this token to pick up the change.');
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(99);
});
