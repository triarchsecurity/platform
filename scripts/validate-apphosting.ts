// Phase 24 / CI-04 — pre-deploy lint of apphosting.yaml + apphosting.dev.yaml against REQUIRED_ENV.
// Run via: npx tsx scripts/validate-apphosting.ts. CI step gates deploy: in .github/workflows/ci-cd.yml.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { REQUIRED_ENV } from '../src/lib/env-schema';

interface ApphostingEnv {
  variable: string;
  value?: string;
  secret?: string;
  availability?: string[];
}
interface ApphostingDoc {
  env?: ApphostingEnv[];
}

function bindingsIn(file: string): Set<string> {
  const text = readFileSync(resolve(file), 'utf8');
  const doc = parse(text) as ApphostingDoc;
  const names = new Set<string>();
  for (const e of doc.env ?? []) names.add(e.variable);
  return names;
}

export function validateApphosting(
  prodFile = 'apphosting.yaml',
  devFile = 'apphosting.dev.yaml',
): { ok: boolean; missing: string[]; dead: string[]; devCount: number } {
  const prod = bindingsIn(prodFile);
  const dev = bindingsIn(devFile);
  // Dev overlay merges on top of prod — a var bound in prod is inherited by dev unless overridden.
  // For required-at-runtime vars: must be bound in prod (dev inherits). Dev overrides are optional.
  const missing = REQUIRED_ENV.filter((n) => !prod.has(n));
  const dead = [...prod].filter(
    (n) =>
      !(REQUIRED_ENV as readonly string[]).includes(n) &&
      n !== 'NODE_AUTH_TOKEN' &&
      !n.startsWith('NEXT_PUBLIC_'),
  );
  return { ok: missing.length === 0, missing, dead, devCount: dev.size };
}

function main(): void {
  const result = validateApphosting();
  if (!result.ok) {
    console.error(
      `apphosting.yaml is missing required bindings:\n  - ${result.missing.join('\n  - ')}`,
    );
    process.exit(1);
  }
  if (result.dead.length > 0) {
    console.warn(
      `apphosting.yaml has bindings NOT in REQUIRED_ENV (dead?):\n  - ${result.dead.join('\n  - ')}`,
    );
  }
  console.log(
    `OK: all ${REQUIRED_ENV.length} required vars bound; ${result.devCount} dev overrides.`,
  );
}

// Only invoke main() when run directly via npx tsx — guard against test imports
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
