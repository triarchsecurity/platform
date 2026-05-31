---
phase: quick-260531-l3s
plan: 01
subsystem: agent-api
tags: [proxy, tmi, writing-style, agent-auth, env-wiring]
dependency_graph:
  requires: [src/lib/agent-auth.ts, src/app/api/agents/projects/_lookup.ts, src/db/schema.ts]
  provides: [GET /api/agents/projects/[idOrKey]/style]
  affects: [apphosting.yaml, apphosting.dev.yaml]
tech_stack:
  added: []
  patterns: [withAgent server-to-server proxy, env-at-call-time pattern, tmi-gate 404, 502 envelope without secret leakage]
key_files:
  created:
    - src/app/api/agents/projects/[idOrKey]/style/route.ts
  modified:
    - apphosting.yaml
    - apphosting.dev.yaml
    - package.json
    - package-lock.json
    - src/lib/version.ts
decisions:
  - "read:projects scope reused (not a new read:tmi-style scope) — no schema edit or agent re-seeding required; matches all three sibling routes"
  - "TMI_JOB_SECRET explicitly re-bound in apphosting.dev.yaml per Phase 22-03 grep-match convention"
  - "env read at call time (not module load) — mirrors PORTAL_BASE_URL pattern; allows runtime overlay"
metrics:
  duration: ~8 min
  completed: 2026-05-31
  tasks_completed: 2
  files_created: 1
  files_modified: 5
---

# Phase quick-260531-l3s Plan 01: Add GET /api/agents/projects/[idOrKey]/style Summary

**One-liner:** Server-to-server TMI writing-style proxy guarded by withAgent + read:projects scope, with env-isolated TMI_BASE_URL/TMI_JOB_SECRET bindings in both apphosting files and version bump to 2.23.0.

## Objective

Add `GET /api/agents/projects/[idOrKey]/style` to the admin (platform) repo as a stable, MCP-callable endpoint that reads TMI's writing style without the MCP holding TMI's job secret directly.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create style proxy route | 2797484 | src/app/api/agents/projects/[idOrKey]/style/route.ts |
| 2 | Wire env + version bump + build | 51890a7 | apphosting.yaml, apphosting.dev.yaml, package.json, package-lock.json, src/lib/version.ts |

## Decisions Made

1. **read:projects scope reused** — AGENT_SCOPES only defines READ_PROJECTS + WRITE_AUDIT. Adding read:tmi-style would require schema edit + agent re-seed across all agent rows — neither trivial nor consistent with the three sibling routes (health, bugs, features). read:projects is correct.

2. **TMI_JOB_SECRET re-bound in dev** — Follows the Phase 22-03 explicit-rebind convention: dev file re-binds secrets that prod binds so `grep TMI_JOB_SECRET apphosting.dev.yaml` returns a match (operational grep-discoverability).

3. **Env read at call time** — Matches house pattern (PORTAL_BASE_URL, CL6_ENFORCEMENT_MODE). Allows per-request env override in tests and FAH runtime overlay wins cleanly.

## Deviations from Plan

None — plan executed exactly as written.

## Build Result

PASS — `npx next build` compiled successfully. Route confirmed in output table:
```
ƒ /api/agents/projects/[idOrKey]/style
```
`npx tsc --noEmit` reported no type errors in the new route file.

## Verification

```
grep -n TMI_BASE_URL apphosting.yaml apphosting.dev.yaml
apphosting.yaml:120:  - variable: TMI_BASE_URL   value: https://tmiengine.com
apphosting.dev.yaml:44:  - variable: TMI_BASE_URL   value: https://tmi-dev--triarch-dev-tmi.us-central1.hosted.app

grep -rn "2.23.0" package.json src/lib/version.ts
package.json:3:  "version": "2.23.0"
src/lib/version.ts:1: ... 'v2.23.0'

grep '"version"' package-lock.json | head -2  → both entries: 2.23.0
```

## Manual Step for Mike

The route returns 502 at runtime until the secret VALUE exists in Secret Manager. Run:

```bash
firebase apphosting:secrets:set TMI_JOB_SECRET --project triarch-dev-website
```

Paste TMI's JOB_SECRET value when prompted. Both the `admin-prod` and `admin-dev` FAH backends inherit this secret binding from their respective apphosting yaml files.

## Known Stubs

None — no hardcoded empty values or placeholders. The 502 on missing env is intentional fail-safe behavior (not a stub).

## Self-Check: PASSED

- [x] src/app/api/agents/projects/[idOrKey]/style/route.ts exists
- [x] Commit 2797484 exists (Task 1)
- [x] Commit 51890a7 exists (Task 2)
- [x] apphosting.yaml contains TMI_BASE_URL (tmiengine.com) and TMI_JOB_SECRET secret binding
- [x] apphosting.dev.yaml contains TMI_BASE_URL (tmi-dev hosted.app) and TMI_JOB_SECRET secret binding
- [x] package.json, package-lock.json, src/lib/version.ts all read 2.23.0
- [x] npx next build passes
