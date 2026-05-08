---
phase: 21-release-page-port-read
plan: "05"
subsystem: portal
tags: [portal, pipeline-summary, PORTAL-02, tile-ui]
dependency_graph:
  requires:
    - "21-01 (getProjectPipelineSummaries in shared package)"
    - "21-04 (/projects/[slug]/releases route tiles link to)"
  provides:
    - "Portal /projects — membership-filtered pipeline-summary tile list"
  affects:
    - "portal/src/app/projects/page.tsx (replaced 18-04 stub)"
tech_stack:
  added: []
  patterns:
    - "getProjectPipelineSummaries() — membership-scoped call with explicit projectKeys array (not null)"
    - "Parallel Promise.all for pipeline summaries + project name lookup"
    - "nameByKey fallback — orphaned membership row shows key when project name missing"
key_files:
  created: []
  modified:
    - "portal/src/app/projects/page.tsx"
    - "portal/package.json"
decisions:
  - "projectKeys passed as string[] (not null) — null means all-projects staff view; portal users always see scoped view"
  - "formatRelativeTime imported from ./[slug]/releases/format — reuses portal-local copy ported in 21-02"
  - "Empty-state card rendered when all memberships are wildcard-only — defense-in-depth even though redirect('/no-memberships') fires first"
  - "Version correction PR (#10) needed after parallel 21-04 squash merge overwrote 0.2.5 bump with 0.2.4"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-05-08"
  tasks_completed: 2
  files_modified: 2
---

# Phase 21 Plan 05: Projects Tile UI Summary

**One-liner:** Portal /projects replaced 18-04 stub with membership-filtered pipeline-summary tile grid using getProjectPipelineSummaries() — each tile links to /projects/[slug]/releases with prod/dev versions, pending pill, and what-changed oneliner.

## What Was Built

Replaced the 18-04 stub (`<a href>` list + "Full pipeline summary view ships in Phase 21" note) with a full pipeline-summary tile grid that:

- Calls `getProjectPipelineSummaries(projectKeys)` scoped to ctx.memberships (non-wildcard only)
- Does a parallel `db.select` for project names by key (with `nameByKey[key] ?? key` fallback for orphaned membership rows)
- Renders a responsive grid (`md:grid-cols-2`) of Next.js `<Link>` tiles to `/projects/${key}/releases`
- Each tile: project name (h3), prod/dev version (font-mono) + relative time via `formatRelativeTime`, pending-approval pill (hidden when count = 0), what-changed oneliner (only when `pipelineState === 'dev-ahead'`)
- Empty-state card when projectMemberships.length === 0 with "No projects yet — contact your project admin."

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| Task 1 | Replace /projects stub + version bump (0.2.3→0.2.5) | 45a6d60 |
| Task 2 (recovery) | Version correction PR after parallel merge overwrote 0.2.4 | 46f6322 |

PRs: #10 (squash-merged, v0.2.5 on main)

## Verification Results

- `npx tsc --noEmit` — clean (pre-existing auth.test.ts errors excluded; not caused by this plan)
- `npx vitest run` — 9 files, 51 passed, 1 skipped
- `npx next build` — clean (6 routes, all dynamic)
- `getProjectPipelineSummaries` present in page.tsx: PASS
- `Link` present in page.tsx: PASS
- "Full pipeline summary view ships" stub note removed: PASS
- `"version": "0.2.5"` in package.json: PASS
- `v0.2.5` in git log: PASS

## Deviations from Plan

### Auto-handled Parallel Execution Conflict

**Found during:** Task 2
**Issue:** The 21-04 parallel plan agent branched from my commit (45a6d60) and squash-merged its PR first. The squash commit included my `page.tsx` changes but capped version at 0.2.4 (21-04's intended version). This left main at v0.2.4 with the full page.tsx but wrong version.
**Fix:** Created a dedicated version-bump branch (`feat/portal-v0-2-5-version-bump`), committed `0.2.4 → 0.2.5`, opened PR #10, squash-merged. Main now at v0.2.5.
**Rule applied:** Rule 1 (Auto-fix) — versioning conflict directly caused by parallel wave execution.

### Pre-existing TypeScript Errors

`src/lib/auth.test.ts` has 3 type errors (`projectKey` vs `project_key` on membership mock objects) from v0.2.0. These are out of scope — not caused by this plan, not blocking build or vitest run.

## Known Stubs

None — all tile data flows from live DB via getProjectPipelineSummaries() + project name lookup. No hardcoded placeholders.

## Self-Check: PASSED

- `portal/src/app/projects/page.tsx` — FOUND
- `portal/package.json` version 0.2.5 — FOUND
- commit 45a6d60 — FOUND (in origin/feat/phase-21-projects-tiles)
- commit 46f6322 — FOUND (squash-merged to main as e374919)
- PORTAL-02 requirement satisfied — page uses getProjectPipelineSummaries() scoped to membership
