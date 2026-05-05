# Phase 5: Customer Page RC UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 05-customer-page-rc-ui
**Areas discussed:** Branch grouping & section UX, Preview URL placement, Per-RC approve UX, Conflict status badge

---

## Branch grouping & section UX

### Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible sections | Stacked accordion: one section per branch with an expand/collapse chevron. Reuses the existing ChevronDown/ChevronRight pattern. Single page, all info visible by scrolling. | ✓ |
| Tab strip | Horizontal tabs across the top, one per branch. One section visible at a time. Cleaner for many branches but hides cross-branch state. | |
| Filter dropdown | Single flat list with a 'Branch:' filter dropdown. Loses visual grouping; really just filtering the v1.14 layout. | |
| Sidebar + content | Left rail lists branches with badges, right pane shows the selected branch's releases. Most flexible for many branches but heavyweight for 1–3 branch projects. | |

**User's choice:** Collapsible sections (Recommended)
**Notes:** Reuses existing chevron/expand pattern, scales well to a small/medium number of branches without forcing a click to see other branches.

### Default open

| Option | Description | Selected |
|--------|-------------|----------|
| main + active feature branches expanded | Most useful default — sees prod history (main) and any pending RC at once. Stale branches collapsed. | ✓ |
| Only main expanded | Quietest default; user must click into feature branches. Hides RCs needing approval until clicked. | |
| All sections expanded | Full visibility. Risk: visual noise as count of branches grows. | |
| All sections collapsed | User opens whatever they want. Most minimal but hides the call-to-action for pending approvals. | |

**User's choice:** main + active feature branches expanded (Recommended)
**Notes:** "Active" left to Claude's discretion in CONTEXT — recommend 30-day window OR non-terminal status.

### Sort order

| Option | Description | Selected |
|--------|-------------|----------|
| main pinned first, feature branches by latest activity desc | main is the prod history anchor and stays top. Feature branches sorted by max(deployedAt). | ✓ |
| All branches by latest activity desc (no main pin) | Pure freshness-based. main may sink below an active feature branch. | |
| main first, feature branches alphabetical | Stable order regardless of activity. Predictable but buries fresh RCs. | |
| Pending-action branches first, then main, then quiet | State-driven priority. Most assertive but more logic. | |

**User's choice:** main pinned first, feature branches by latest activity desc (Recommended)

### Active branch

| Option | Description | Selected |
|--------|-------------|----------|
| Any distinct value of release_logs.branch | Simple SQL: SELECT DISTINCT branch FROM release_logs. Every branch that ever deployed gets a section. | ✓ |
| Branches with a release in the last 30 days | Auto-hides ancient branches. Hides history that may matter for audit. | |
| Branches whose latest release is not yet promoted/rejected | Only 'live' RCs surface. Hides main entirely most of the time. | |
| Manual: only branches matching a project allowlist | Customer admin curates. Heavyweight; deferred to v3. | |

**User's choice:** Any distinct value of release_logs.branch (Recommended)
**Notes:** Stale branches get pushed down by sort order; user can collapse them. No hidden state.

---

## Preview URL placement

### URL spot

| Option | Description | Selected |
|--------|-------------|----------|
| Inline external-link icon next to version | Adds a small ExternalLink lucide icon button right after the version badge on the collapsed row. One click from collapsed state. | ✓ |
| Dedicated 'Preview' column | New column between Commit and Deployed. Adds horizontal width pressure on the table. | |
| Button inside the expanded panel | User must click row to expand, then click 'Open preview'. Hides the most-clicked action behind a step. | |
| Both inline icon and panel button | Inline for quick access, panel button with full URL text for clarity. Some duplication. | |

**User's choice:** Inline external-link icon next to version (Recommended)

### Main URL

| Option | Description | Selected |
|--------|-------------|----------|
| Show prod URL for main rows that are env=prod or status=promoted | Reads projects.appUrl (or metadata.previewUrl when set). Customer can jump from a promoted release straight to prod. | ✓ |
| Show only feature-branch preview URLs; main rows have no URL icon | Strictly RC-02 'preview' semantics. Cleaner intent but loses a useful affordance. | |
| Always show whatever metadata.previewUrl contains, regardless of branch | Single rule: render icon if previewUrl is present, hide otherwise. Simplest implementation. | |

**User's choice:** Show prod URL for main rows that are env=prod or status=promoted (Recommended)

### Missing URL

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the icon silently | No previewUrl → no icon. Customers see icons only on rows with somewhere to go. | |
| Show a disabled/grayed icon with tooltip 'No preview deployed' | Explicit affordance that something would have been there. | ✓ |
| Construct a deterministic URL from project + branch | Synthesize URL using projects.firebaseProject. Risk: leads to a 404 if the rollout never ran. | |

**User's choice:** Show a disabled/grayed icon with tooltip 'No preview deployed' (NOT the recommended option)
**Notes:** User explicitly preferred the explicit affordance over silent hiding. Worth noting that on legacy rows pre-Phase-2, every row will display the disabled icon — visual cost accepted.

### URL UX

| Option | Description | Selected |
|--------|-------------|----------|
| Icon-only button, tooltip shows full URL | Tight visual footprint. Hover/focus reveals 'Open preview — <URL>'. aria-label includes full URL for screen readers. | ✓ |
| Icon + truncated URL text | Renders e.g. feat-font--triarch-dev.…hosted.app next to the icon. More information but eats horizontal space. | |
| Icon labeled 'Preview' | Icon plus the word 'Preview'. Clearer intent but adds another textual element. | |

**User's choice:** Icon-only button, tooltip shows full URL (Recommended)

---

## Per-RC approve UX

### Confirm UX

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing 2-step + 5s countdown verbatim, scoped per-row | Same UX customers know from v1.14. Per-release ephemeral state already keys by id. | ✓ |
| Replace inline 2-step with a modal dialog | Modal pops with branch + version + 5s countdown + Confirm/Cancel. Heavier visual but unambiguous. | |
| Single-click approve, no confirmation | Faster, but the 2-step exists specifically to prevent accidental prod promotions. | |

**User's choice:** Reuse existing 2-step + 5s countdown verbatim, scoped per-row (Recommended)

### Confirm text

| Option | Description | Selected |
|--------|-------------|----------|
| 'Click to confirm — promote feat/change-font v0.15.0-rc.1 (5s)' | Branch + version inline so customer can never confuse which RC they're approving. | ✓ |
| 'Click to confirm (5s left)' — keep current label | Same as v1.14. Branch visible elsewhere on the row. Simpler but less assertive. | |
| Branch as a separate inline pill above the button, label unchanged | Visually distinct branch chip; button text stays compact. Decent middle ground. | |

**User's choice:** 'Click to confirm — promote feat/change-font v0.15.0-rc.1 (5s)' (Recommended)

### Section state

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — small badge cluster in section header | E.g. feat/change-font · [1 pending] [1 promoted]. Draws customer's eye to attention-needing branches. | ✓ |
| Only show 'X pending approval' when count > 0 | Single attention-grabbing badge; nothing on quiet branches. Less noise but loses status for promoted releases. | |
| No header badges — rely on row-level status badges only | Section header is just the branch name + chevron. Cleanest but worst for scanning. | |

**User's choice:** Yes — small badge cluster in section header (Recommended)

### Approve scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both stay in confirm state independently — no cross-branch interference | Required by RC-03 and RC-08. Keys per release.id, no shared confirm latch. | ✓ |
| Reset the other RC's confirm and surface a toast 'Only one approval at a time' | Forces serialized approval. Easier to reason about but contradicts multi-branch parallelism. | |
| Show a confirmation modal listing all currently-pending RCs | Bulk-approve UX. Heavier; out of scope for Phase 5. | |

**User's choice:** Both stay in confirm state independently — no cross-branch interference (Recommended)

---

## Conflict status badge

### Badge spot

| Option | Description | Selected |
|--------|-------------|----------|
| Section header AND every RC row in that branch | Header for at-a-glance visibility, per-row plus disabled approve reinforces the lock. | ✓ |
| Section header only | Single badge per branch. Per-row state unclear when expanded. | |
| Per-row only | Customer must expand to discover conflict. Worst for scanning. | |

**User's choice:** Section header AND every RC row in that branch (Recommended)

### Badge data

| Option | Description | Selected |
|--------|-------------|----------|
| Badge label + expandable file list with rebase hint | Header label `Conflict — N file(s)`. Click → inline expansion showing conflictFiles + rebase instruction. rebaseError collapsed. | ✓ |
| Just a label — 'Conflict — needs manual rebase' | Minimal. Customers must check Slack thread or ask staff for file list. | |
| Label + file list always visible (no expansion) | All conflict files printed under the header. Risk: 50-file conflict creates an enormous header. | |

**User's choice:** Badge label + expandable file list with rebase hint (Recommended)

### Clear logic

| Option | Description | Selected |
|--------|-------------|----------|
| When a newer release_logs row exists for the branch with deployedAt > latest_conflict.created_at | Customer rebases manually → pushes → new release_logs row → badge disappears. Matches RC-07. | ✓ |
| When a newer promote_attempts row with result='merged' exists | Stricter: only clears once a successful promotion is recorded. Chicken-and-egg lock. | |
| Manual clear via a 'Dismiss' button in the badge | Customer-driven. Risk: dismiss without rebasing. | |
| Time-based: clear after 24 hours | Auto-stale. Misses the point — underlying conflict doesn't go away with time. | |

**User's choice:** When a newer release_logs row exists for the branch with deployedAt > latest_conflict.created_at (Recommended)

### Lock approve

| Option | Description | Selected |
|--------|-------------|----------|
| Hide approve button entirely; show 'Resolve conflict to enable approval' helper text | RC-07 says 'approve button is disabled' — hiding is the strongest form. Helper text replaces the button. | ✓ |
| Render the button but with disabled={true} attribute and grey styling | Button visible but unclickable. aria-disabled='true'; tooltip explains why. Less assertive but spatial layout stays stable. | |
| Render disabled button + show conflict file count next to it | Combines disabled state with at-a-glance conflict info. Visual weight on a dead button. | |

**User's choice:** Hide approve button entirely; show 'Resolve conflict to enable approval' helper text (Recommended)

---

## Claude's Discretion

- Exact threshold for "active branch" in the default-expansion heuristic (recommend 30-day window OR non-terminal status).
- Section-header badge color tokens (match existing palette).
- Whether to fetch promote_attempts aggregates server-side in page.tsx or via a new client API (recommend server-side single Drizzle query).
- Whether to lift the table to per-section tables or one big table with branch-group rows (recommend per-section).
- Mobile breakpoint behavior — minimal changes; sections still stack.
- Whether to surface `result='ci_failed'` as a separate badge (recommend yes, but not required by Phase 5 success criteria).
- Whether prod URL on main rows comes from `projects.appUrl` or `metadata.previewUrl`.

## Deferred Ideas

- Wiring approve to dispatch promote-branch.yml — RC-04, Phase 6.
- Slack conflict reply — RC-06, Phase 6.
- Branch name in OttoBot Slack message — RC-05, Phase 6.
- Concurrent RC server-side safety — RC-08, Phase 6.
- AI-mediated conflict resolution / customer-page conflict resolver UI — v3 (CONFLICT-V3-01, CONFLICT-V3-02).
- CI-failed badge variant — Phase 5 success criteria only call out conflict.
- Bulk-approve UX — out of scope.
- Manual "Dismiss" on conflict badge — rejected.
- Per-section pagination — punted.
