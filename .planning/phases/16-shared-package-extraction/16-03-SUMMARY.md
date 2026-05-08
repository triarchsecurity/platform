---
phase: 16-shared-package-extraction
plan: "03"
subsystem: packages/triarch-shared
tags: [extraction, package, schema, vitest, next-build]
dependency_graph:
  requires:
    - "16-01 (package skeleton)"
    - "16-02 (publish workflow + CI gate)"
  provides:
    - "packages/triarch-shared/src/{schema,auth-context,sanitize-commit,slack-status,db}.ts"
    - "admin shims: src/db/schema.ts, src/lib/{auth-context,sanitize-commit,slack-status,db}.ts"
    - "@myalterlego/triarch-shared file: dep in admin package.json"
    - "vitest plugin for package-internal import redirect"
  affects:
    - "admin test suite (324/324 GREEN)"
    - "admin next build (clean)"
tech_stack:
  added:
    - "@myalterlego/triarch-shared file:./packages/triarch-shared (admin dep)"
  patterns:
    - "1-line re-export shim pattern for admin source files"
    - "vitest Vite plugin (resolveId hook, enforce:pre) to redirect dist imports through admin shims"
    - "file: dep for local monorepo package consumption before registry publish"
key_files:
  created:
    - packages/triarch-shared/src/schema.ts
    - packages/triarch-shared/src/auth-context.ts
    - packages/triarch-shared/src/sanitize-commit.ts
    - packages/triarch-shared/src/slack-status.ts
    - packages/triarch-shared/src/db.ts
    - packages/triarch-shared/src/index.ts
  modified:
    - src/db/schema.ts (→ 1-line shim)
    - src/lib/auth-context.ts (→ 1-line shim)
    - src/lib/sanitize-commit.ts (→ 1-line shim)
    - src/lib/slack-status.ts (→ 1-line shim)
    - src/lib/db.ts (→ 1-line shim)
    - package.json (dep + version bump)
    - next.config.ts (transpilePackages)
    - vitest.config.ts (packageTestRedirectPlugin)
decisions:
  - "vitest plugin (resolveId, enforce:pre) to redirect package dist imports — see Deviations section"
  - "file: dep until 16-04 publishes @myalterlego/triarch-shared@0.1.0 to GitHub Packages"
metrics:
  duration: "12 minutes"
  completed_date: "2026-05-08"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 8
---

# Phase 16 Plan 03: Source Extraction to triarch-shared Summary

Moved five admin source files into `packages/triarch-shared/src/`, replaced admin originals with 1-line re-export shims, wired the package as a `file:` dep, added to `transpilePackages`, and bumped admin to v2.9.0. All 324 Vitest tests stay GREEN; `next build` is clean.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Move 5 source files into package, rewrite internal imports, build standalone | f3f1b71 |
| 2 | Replace admin source with 1-line shims, wire dep + transpilePackages, run verification | 0051a5b |

## Source Files Moved

| File | Lines (pre-move) | Package path | Import rewrites |
|------|-----------------|--------------|-----------------|
| src/db/schema.ts | 490 | packages/triarch-shared/src/schema.ts | None (drizzle-orm/pg-core only) |
| src/lib/sanitize-commit.ts | 85 | packages/triarch-shared/src/sanitize-commit.ts | None (pure functions) |
| src/lib/db.ts | 9 | packages/triarch-shared/src/db.ts | `@/db/schema` → `./schema` |
| src/lib/auth-context.ts | 49 | packages/triarch-shared/src/auth-context.ts | `@/lib/db` + `@/db/schema` → `./db` + `./schema` |
| src/lib/slack-status.ts | 172 | packages/triarch-shared/src/slack-status.ts | `@/lib/db` + `@/db/schema` → `./db` + `./schema` |

## Admin Shims (post-move)

All five admin source files are now 1-line re-export shims:

```typescript
// src/db/schema.ts
export * from '@myalterlego/triarch-shared/schema';

// src/lib/db.ts
export * from '@myalterlego/triarch-shared/db';

// src/lib/auth-context.ts
export * from '@myalterlego/triarch-shared/auth';

// src/lib/sanitize-commit.ts
export * from '@myalterlego/triarch-shared/sanitize-commit';

// src/lib/slack-status.ts
export * from '@myalterlego/triarch-shared/slack';
```

## Call Sites (unchanged — shims preserve specifiers)

| Import path | Pre-move count | Post-move count |
|-------------|---------------|-----------------|
| `from '@/db/schema'` | 72 | 72 |
| `from '@/lib/auth-context'` | 31 | 31 |
| `from '@/lib/db'` | 71 | 71 |
| `from '@/lib/sanitize-commit'` | 2 | 2 |
| `from '@/lib/slack-status'` | 2 | 2 |

Zero call-site changes. All 60+ schema, 30+ auth-context, and 20+ db import sites continue resolving through the shims transparently.

## Verification Results

- Package standalone build: `npx tsc --build` exits 0 — 6 .d.ts + 6 .js dist files emitted
- Admin tests: 324/324 GREEN (same count as baseline; zero tests dropped)
- Admin next build: clean, all 55+ routes compiled, zero TypeScript errors
- Admin version: 2.8.1 → 2.9.0 (`package.json`)
- file: dep: `@myalterlego/triarch-shared: file:./packages/triarch-shared` in dependencies
- transpilePackages: `['@myalterlego/shared-ui', '@myalterlego/triarch-shared']` in next.config.ts
- node_modules symlink: `node_modules/@myalterlego/triarch-shared → ../../packages/triarch-shared`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added vitest plugin to redirect package dist imports through admin shims**

- **Found during:** Task 2 vitest run
- **Issue:** After extraction, the package dist files (`dist/slack-status.js`, `dist/auth-context.js`) have static imports like `import { db } from './db'` that resolve to `dist/db.js` — a real Pool factory. Test mocks using `vi.mock('@/lib/db')` intercept `src/lib/db.ts` (the shim) but NOT `dist/db.js`. Result: 6 tests in `commands/route.test.ts` and `events/route.test.ts` failed with `ECONNREFUSED` because `fetchProjectStatus` attempted real DB connection.
- **Root cause:** The plan's identity preservation note ("vi.mock intercepts the `@/lib/db` specifier BEFORE Node resolves the re-export") is true for the shim itself but not for package-internal cross-imports. The dist `slack-status.js` uses a relative `./db` import that resolves to `dist/db.js` — a completely separate module identity from the `@/lib/db` shim.
- **Fix:** Added `packageTestRedirectPlugin` to `vitest.config.ts`. The plugin uses a `resolveId` hook with `enforce: 'pre'` that intercepts relative imports from `packages/triarch-shared/dist/` and redirects them to admin's shim paths (`src/lib/db.ts`, etc.). When `dist/slack-status.js` imports `./db`, the plugin redirects to `src/lib/db.ts`, which is what `vi.mock('@/lib/db')` patches. Mock interception restored.
- **Plugin does NOT affect production:** `next.config.ts` uses `transpilePackages` for compile-time bundling; the plugin is vitest-only and has zero production surface.
- **Files modified:** `vitest.config.ts`
- **Commit:** 0051a5b

## Package File Structure (post-plan)

```
packages/triarch-shared/
  src/
    schema.ts         (490 lines — Drizzle schema: 29 `export const`, 7 relations)
    auth-context.ts   (49 lines — UserContext + getCurrentUserContext)
    sanitize-commit.ts (85 lines — sanitizeForSlack + sanitizeForRender)
    slack-status.ts   (172 lines — ProjectStatusData + 4 functions)
    db.ts             (9 lines — drizzle Pool factory)
    index.ts          (14 lines — barrel: export * from 5 modules)
  dist/               (6 .js + 6 .d.ts — from tsc --build)
  package.json        (0.1.0, exports field: 6 subpaths)
  tsconfig.json
```

## Next Step

Plan 16-04: tag `shared/v0.1.0` to publish `@myalterlego/triarch-shared@0.1.0` to GitHub Packages registry. After publish, the `file:./packages/triarch-shared` dep in admin's `package.json` can be swapped to `^0.1.0` (registry version). Portal (Phase 18+) will `npm install @myalterlego/triarch-shared` from the registry.

## Known Stubs

None. All five modules export real implementations. No placeholder values, no hardcoded empty collections, no TODO stubs.

## Self-Check: PASSED
