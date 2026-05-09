---
phase: 16-shared-package-extraction
plan: "01"
subsystem: packages/triarch-shared
tags: [npm-package, typescript, drizzle, shared-schema, scaffold]
dependency_graph:
  requires: []
  provides: [packages/triarch-shared/package.json, packages/triarch-shared/tsconfig.json, packages/triarch-shared/src/index.ts]
  affects: [16-02, 16-03, 16-04]
tech_stack:
  added: ["@myalterlego/triarch-shared@0.1.0 package scaffold"]
  patterns: [subpath-exports, github-packages-registry, standalone-tsc-build]
key_files:
  created:
    - packages/triarch-shared/package.json
    - packages/triarch-shared/tsconfig.json
    - packages/triarch-shared/.gitignore
    - packages/triarch-shared/README.md
    - packages/triarch-shared/src/index.ts
  modified: []
decisions:
  - "Package targets ES2022 + ESNext module (library, not Next.js runtime)"
  - "Both peerDependencies AND devDependencies for drizzle-orm/pg: peerDeps signal contract; devDeps make local tsc --build work"
  - "private: false + publishConfig.access restricted: GitHub Packages requires registry URL; restricted keeps package private to MyAlterLego org"
  - "Subpath exports declared up front so 16-03 source drops land without package.json changes"
metrics:
  duration: "1m"
  completed: "2026-05-08"
  tasks_completed: 2
  files_created: 5
  files_modified: 0
---

# Phase 16 Plan 01: Scaffold packages/triarch-shared/ Skeleton Summary

**One-liner:** `@myalterlego/triarch-shared@0.1.0` npm package skeleton with 6 subpath exports, strict TypeScript config emitting to dist/, and a stub index.ts that builds clean.

## What Was Built

Scaffolded `packages/triarch-shared/` inside the admin repo as a standalone, buildable npm package. This is the destination package for Plan 16-03's source moves. No admin source was touched.

### Subpath Export Contract (for 16-03 reference)

| Subpath | Declared .d.ts | Declared .js | Admin source to move |
|---------|----------------|--------------|----------------------|
| `.` (root) | `dist/index.d.ts` | `dist/index.js` | `src/index.ts` (barrel) |
| `./schema` | `dist/schema.d.ts` | `dist/schema.js` | `src/db/schema.ts` |
| `./auth` | `dist/auth-context.d.ts` | `dist/auth-context.js` | `src/lib/auth-context.ts` |
| `./sanitize-commit` | `dist/sanitize-commit.d.ts` | `dist/sanitize-commit.js` | `src/lib/sanitize-commit.ts` |
| `./slack` | `dist/slack-status.d.ts` | `dist/slack-status.js` | `src/lib/slack-status.ts` |
| `./db` | `dist/db.d.ts` | `dist/db.js` | `src/lib/db.ts` |

### Files Created

| File | Purpose |
|------|---------|
| `packages/triarch-shared/package.json` | Package metadata: `@myalterlego/triarch-shared@0.1.0`, 6 subpath exports, peerDeps + devDeps for drizzle-orm/pg/typescript, publishConfig pointing at `npm.pkg.github.com` |
| `packages/triarch-shared/tsconfig.json` | Build config: ES2022 target, ESNext module, bundler resolution, outDir `./dist`, strict mode, declaration + declarationMap + sourceMap |
| `packages/triarch-shared/.gitignore` | Excludes `dist/`, `tsconfig.tsbuildinfo`, `node_modules/`, `*.tgz` from source control |
| `packages/triarch-shared/README.md` | Documents migration authority (admin-only `db:push`), subpath exports, and version bump convention |
| `packages/triarch-shared/src/index.ts` | Stub barrel with `PACKAGE_VERSION = '0.1.0'` — prevents empty emit warning, marks fill-in point for 16-03 |

## Verification Results

- `npx tsc --build packages/triarch-shared` exits 0
- `dist/index.js` and `dist/index.d.ts` emitted
- `dist/` is gitignored (`.gitignore` entry confirmed via `git check-ignore`)
- Admin source (`src/`) shows no modifications
- Admin build (`npx next build`) not affected — package is not yet a dep

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| `92c7655` | feat(16-02): add check-shared-version.yml (included scaffold files) | All 5 package scaffold files |

Note: The parallel 16-02 executor committed these files as part of commit `92c7655` since both agents ran concurrently and produced identical content. The scaffold is fully committed at the expected spec.

## Deviations from Plan

None — plan executed exactly as written. The concurrent 16-02 executor happened to commit these files first (parallel wave execution), but the content is byte-identical to what this plan specified.

## Next Steps

- **Plan 16-02** (CI workflows): Can reference `packages/triarch-shared/package.json` to read version field — already committed in this wave
- **Plan 16-03** (source move): Drop `schema.ts` / `auth-context.ts` / `sanitize-commit.ts` / `slack-status.ts` / `db.ts` into `packages/triarch-shared/src/` — the exports field already routes them correctly
- **Plan 16-04** (publish): Tag `shared/v0.1.0` to trigger the publish workflow

## Known Stubs

| File | Export | Reason |
|------|--------|--------|
| `packages/triarch-shared/src/index.ts` | `PACKAGE_VERSION` | Placeholder until Plan 16-03 moves real source; intentional scaffold marker |

These stubs are intentional — they exist only to make `tsc --build` succeed on the empty package. Plan 16-03 replaces them with real re-exports.

## Self-Check: PASSED

- [x] `packages/triarch-shared/package.json` exists
- [x] `packages/triarch-shared/tsconfig.json` exists
- [x] `packages/triarch-shared/.gitignore` exists
- [x] `packages/triarch-shared/README.md` exists
- [x] `packages/triarch-shared/src/index.ts` exists
- [x] Commit `92c7655` exists in git log
- [x] `dist/` is gitignored
- [x] Package builds clean (`tsc --build` exits 0)
