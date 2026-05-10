// Phase 24 / CI-04 — unit tests for scripts/validate-apphosting.ts
// Writes synthetic apphosting.yaml content to a temp directory and feeds the
// paths into the exported validateApphosting() function. Asserts on the
// returned { ok, missing, dead, devCount } object — never invokes process.exit.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED_ENV } from '../src/lib/env-schema';
import { validateApphosting } from './validate-apphosting';

// Helper: build apphosting.yaml content with a custom env list.
function buildYaml(bindings: Array<{ variable: string; value?: string; secret?: string }>): string {
  const envBlock = bindings
    .map((b) => {
      const lines = [`  - variable: ${b.variable}`];
      if (b.value !== undefined) lines.push(`    value: ${b.value}`);
      if (b.secret !== undefined) lines.push(`    secret: ${b.secret}`);
      return lines.join('\n');
    })
    .join('\n');
  return `runConfig:\n  runtime: nodejs22\n\nenv:\n${envBlock}\n`;
}

// All REQUIRED_ENV bindings, used as the baseline "clean" prod yaml.
const ALL_REQUIRED_BINDINGS = REQUIRED_ENV.map((variable) => ({
  variable,
  secret: variable,
}));

describe('validate-apphosting', () => {
  let tmpDir: string;
  let prodPath: string;
  let devPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'validate-apphosting-test-'));
    prodPath = join(tmpDir, 'apphosting.yaml');
    devPath = join(tmpDir, 'apphosting.dev.yaml');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeYamls(prodBindings: ReturnType<typeof buildYaml> extends string ? Parameters<typeof buildYaml>[0] : never, devBindings: Parameters<typeof buildYaml>[0]): void {
    writeFileSync(prodPath, buildYaml(prodBindings));
    writeFileSync(devPath, buildYaml(devBindings));
  }

  it('returns ok=true when all REQUIRED_ENV vars are bound in apphosting.yaml (clean pass)', () => {
    writeYamls(ALL_REQUIRED_BINDINGS, [{ variable: 'NEXTAUTH_URL', value: 'https://dev.example.com' }]);
    const result = validateApphosting(prodPath, devPath);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.devCount).toBe(1);
  });

  it('returns ok=false with missing names when a REQUIRED_ENV var is unbound', () => {
    // Strip DATABASE_URL from the bindings.
    const bindings = ALL_REQUIRED_BINDINGS.filter((b) => b.variable !== 'DATABASE_URL');
    writeYamls(bindings, []);
    const result = validateApphosting(prodPath, devPath);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('DATABASE_URL');
  });

  it('warns (does not fail) on dead bindings — extra var not in REQUIRED_ENV', () => {
    const bindings = [...ALL_REQUIRED_BINDINGS, { variable: 'BOGUS_VAR', secret: 'BOGUS_VAR' }];
    writeYamls(bindings, []);
    const result = validateApphosting(prodPath, devPath);
    expect(result.ok).toBe(true);
    expect(result.dead).toContain('BOGUS_VAR');
  });

  it('does not warn about NODE_AUTH_TOKEN (BUILD-only allow-list)', () => {
    const bindings = [...ALL_REQUIRED_BINDINGS, { variable: 'NODE_AUTH_TOKEN', secret: 'GITHUB_PACKAGES_TOKEN' }];
    writeYamls(bindings, []);
    const result = validateApphosting(prodPath, devPath);
    expect(result.ok).toBe(true);
    expect(result.dead).not.toContain('NODE_AUTH_TOKEN');
  });

  it('does not warn about NEXT_PUBLIC_* bindings (build-time inlined allow-list)', () => {
    const bindings = [...ALL_REQUIRED_BINDINGS, { variable: 'NEXT_PUBLIC_FOO', value: 'bar' }];
    writeYamls(bindings, []);
    const result = validateApphosting(prodPath, devPath);
    expect(result.ok).toBe(true);
    expect(result.dead).not.toContain('NEXT_PUBLIC_FOO');
  });
});
