// Phase 24 / CI-04 — unit tests for scripts/validate-apphosting.ts
// Mocks node:fs.readFileSync to feed synthetic apphosting.yaml content into
// the exported validateApphosting() function. Asserts on the returned
// { ok, missing, dead, devCount } object — never invokes process.exit.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REQUIRED_ENV } from '../src/lib/env-schema';

// Mock node:fs BEFORE importing the script so the script's readFileSync calls
// resolve to our stub. resolve() is left untouched (we feed plain filenames).
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'node:fs';

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

// Helper: route readFileSync calls based on filename arg.
function setupReadFileSync(prodYaml: string, devYaml: string): void {
  vi.mocked(readFileSync).mockImplementation((file: unknown) => {
    const f = String(file);
    if (f.endsWith('apphosting.yaml')) return prodYaml;
    if (f.endsWith('apphosting.dev.yaml')) return devYaml;
    throw new Error(`Unexpected file in test: ${f}`);
  });
}

describe('validate-apphosting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok=true when all REQUIRED_ENV vars are bound in apphosting.yaml (clean pass)', async () => {
    setupReadFileSync(
      buildYaml(ALL_REQUIRED_BINDINGS),
      buildYaml([{ variable: 'NEXTAUTH_URL', value: 'https://dev.example.com' }]),
    );
    const { validateApphosting } = await import('./validate-apphosting');
    const result = validateApphosting();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.devCount).toBe(1);
  });

  it('returns ok=false with missing names when a REQUIRED_ENV var is unbound', async () => {
    // Strip DATABASE_URL from the bindings.
    const bindings = ALL_REQUIRED_BINDINGS.filter((b) => b.variable !== 'DATABASE_URL');
    setupReadFileSync(buildYaml(bindings), buildYaml([]));
    const { validateApphosting } = await import('./validate-apphosting');
    const result = validateApphosting();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('DATABASE_URL');
  });

  it('warns (does not fail) on dead bindings — extra var not in REQUIRED_ENV', async () => {
    const bindings = [...ALL_REQUIRED_BINDINGS, { variable: 'BOGUS_VAR', secret: 'BOGUS_VAR' }];
    setupReadFileSync(buildYaml(bindings), buildYaml([]));
    const { validateApphosting } = await import('./validate-apphosting');
    const result = validateApphosting();
    expect(result.ok).toBe(true);
    expect(result.dead).toContain('BOGUS_VAR');
  });

  it('does not warn about NODE_AUTH_TOKEN (BUILD-only allow-list)', async () => {
    const bindings = [...ALL_REQUIRED_BINDINGS, { variable: 'NODE_AUTH_TOKEN', secret: 'GITHUB_PACKAGES_TOKEN' }];
    setupReadFileSync(buildYaml(bindings), buildYaml([]));
    const { validateApphosting } = await import('./validate-apphosting');
    const result = validateApphosting();
    expect(result.ok).toBe(true);
    expect(result.dead).not.toContain('NODE_AUTH_TOKEN');
  });

  it('does not warn about NEXT_PUBLIC_* bindings (build-time inlined allow-list)', async () => {
    const bindings = [...ALL_REQUIRED_BINDINGS, { variable: 'NEXT_PUBLIC_FOO', value: 'bar' }];
    setupReadFileSync(buildYaml(bindings), buildYaml([]));
    const { validateApphosting } = await import('./validate-apphosting');
    const result = validateApphosting();
    expect(result.ok).toBe(true);
    expect(result.dead).not.toContain('NEXT_PUBLIC_FOO');
  });
});
