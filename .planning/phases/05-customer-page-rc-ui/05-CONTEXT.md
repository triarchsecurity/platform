# Phase 5: Customer Page RC UI - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Modify the existing customer-facing `/projects/{slug}/releases` page (server component + `ReleasesClient.tsx`) to:

1. Group releases into collapsible accordion sections by `release_logs.branch` — one section per branch, with `main` always present (RC-01).
2. Render each RC's Firebase App Hosting preview URL as an inline external-link icon on the collapsed row (RC-02).
3. Give every RC its own admin-only "Approve for Production" button — multiple RCs across branches can be in `dev → approved` state at the same time, with no cross-branch interference (RC-03).
4. Surface a `Conflict — needs manual rebase` status badge for branches whose latest `promote_attempts` row is `result='conflict'`, hide that branch's approve button, and keep the rest of the page fully functional (RC-07).

**Out of scope (handled elsewhere):**

- Wiring approve to dispatch `promote-branch.yml` — that is **RC-04 / Phase 6** (`promoteAndAudit` rewrite).
- Slack conflict reply (`:warning:` thread post) — RC-06 / Phase 6.
- Branch lifecycle / preview rollout (handled by shared-workflows v2 from Phase 2).
- Schema changes — `release_logs.branch`, `metadata.previewUrl`, `promote_attempts` are all already in place.

</domain>

<decisions>
## Implementation Decisions

### Branch grouping & section UX

- **D-01:** Layout is **collapsible accordion sections** — one stacked section per branch, with an expand/collapse chevron in the section header. Reuse the existing `ChevronDown` / `ChevronRight` lucide pattern already used for row expansion.
- **D-02:** Default expansion: **`main` plus active feature branches expanded; stale branches collapsed**.
  - "Active" for default-expansion purposes (Claude's discretion to refine in planning) = the latest release for that branch is within 30 days OR has status in `{dev, pending_approval, approved}` (i.e. not terminal-and-old).
- **D-03:** Section ordering: **`main` pinned first, feature branches sorted by `max(deployed_at)` desc** so the freshest RC appears immediately below `main`.
- **D-04:** Which branches appear: **every distinct value of `release_logs.branch` for this project** gets a section. No date filter, no allowlist. Stale branches are pushed down by sort order; user can collapse them.

### Preview URL placement

- **D-05:** **Inline external-link icon next to the version cell** on the collapsed row. Adds a small `ExternalLink` lucide button after the version badge. Click opens preview in new tab (`target="_blank" rel="noopener noreferrer"`).
- **D-06:** **Main-branch rows show a prod URL when `env='prod'` or `status='promoted'`** — pulled from `projects.appUrl` (or fall back to `metadata.previewUrl` if set on the row). Dev rows on `main` continue to show whatever `metadata.previewUrl` they carry. Feature-branch rows render `metadata.previewUrl` from the row.
- **D-07:** **When `metadata.previewUrl` is missing**, render a **disabled / grayed-out icon with tooltip "No preview deployed"** instead of hiding it. Explicit affordance for legacy rows pre-Phase-2 and any row that didn't ingest a preview URL.
- **D-08:** Icon presents as **icon-only button** — no inline URL text. Tooltip and `aria-label` carry the full URL ("Open preview — `https://feat-font--triarch-dev.us-central1.hosted.app`") for sighted hover and screen-reader users.

### Per-RC approve UX

- **D-09:** **Reuse the existing two-step approve UX verbatim** — `idle → confirm` step with a 5-second countdown, scoped per `release.id`. The current `approveStep[releaseId]` / `countdownState[releaseId]` keying in `ReleasesClient.tsx` already supports concurrent confirm states; no state-shape change required.
- **D-10:** **Confirm button label includes branch + version**: `Click to confirm — promote feat/change-font v0.15.0-rc.1 (5s)`. Wrapped in `aria-live="polite"` so the countdown is announced. Eliminates any chance of approving the wrong RC when two are in confirm state simultaneously.
- **D-11:** **Section header surfaces aggregate per-branch state** via a small badge cluster (e.g. `feat/change-font · [1 pending] [1 promoted]`). Customers can see attention-needing branches without expanding. Badges count rows by status within the branch group.
- **D-12:** **Concurrent confirm states never interfere across branches.** Two RCs on different branches can both sit in confirm state independently; clicking Confirm on either fires its own POST to `/api/projects/{slug}/releases/{releaseId}/approve`. Required by RC-03 and consistent with RC-08 (which Phase 6 finalizes server-side).

### Conflict status badge

- **D-13:** **Badge appears in BOTH the section header AND on every RC row** for a branch with an unresolved conflict. Header badge = at-a-glance visibility without expanding; per-row badge = unambiguous lock indicator when expanded.
- **D-14:** Badge content:
  - Header label: `Conflict — N file(s)` (red/amber palette consistent with existing `rejected` status).
  - Click → inline expansion shows the **conflictFiles list** (from `promote_attempts.conflict_files` JSONB) and a short instructional line: `Rebase manually on main, push as a new RC to retry.`
  - `rebaseError` text (from `promote_attempts.rebase_error`) shown collapsed-by-default ("Show error details" toggle).
- **D-15:** **Conflict source query**: latest `promote_attempts` row for `(project, branch)` ordered by `created_at desc`, where `result='conflict'`. The branch is in conflict state when that latest-conflict row's `created_at` is **newer than the latest `release_logs.deployed_at`** for the same `(project, branch)`.
- **D-16:** **Auto-clear**: the badge disappears as soon as a newer `release_logs` row exists for the branch where `deployed_at > latest_conflict.created_at`. Matches RC-07 ("releases stay queryable but cannot be re-approved until a new RC deploy lands"). No manual "Dismiss" affordance.
- **D-17:** **Approve button is HIDDEN ENTIRELY for branches in conflict state**, replaced by helper text: `Resolve conflict to enable approval` (alongside the conflict file list). Strongest form of "disabled" per RC-07; consistent with how the action area is empty for non-`dev` statuses today.

### Claude's Discretion

- Exact threshold for "active branch" in the default-expansion heuristic (D-02). Recommend 30-day window OR non-terminal status, whichever applies.
- Exact section-header badge color tokens — match existing palette (`STATUS_BADGE_COLORS` + `ENV_BADGE_COLORS` in `ReleasesClient.tsx`).
- Whether to fetch `promote_attempts` aggregates server-side in `page.tsx` (recommend yes — single Drizzle query joining `release_logs` latest per branch with `promote_attempts` latest per branch) or via a new client API.
- Whether to lift the table to a per-section table or render one big table with branch-group rows. Recommend per-section table so each section can have its own column widths and header badges.
- Mobile breakpoint behavior — minimal changes; sections still stack, badges wrap.
- Whether to also surface `result='ci_failed'` as a separate badge or coalesce with conflict (recommend separate yellow `CI failed` badge, but Phase 5's success criteria only specify conflict).
- Whether to query `projects.appUrl` for the prod URL on `main` rows (D-06) or store it in `metadata.previewUrl` on prod-deploy callbacks. Either is fine; planner picks based on current ingest payload.

### Folded Todos

None — `gsd-tools todo match-phase` returned 0 matches relevant to RC UI scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §"Phase 5: Customer Page RC UI" — four success criteria
- `.planning/REQUIREMENTS.md` — RC-01 (branch sections), RC-02 (preview URL), RC-03 (per-RC approve), RC-07 (conflict badge). Note: RC-04 / RC-05 / RC-06 / RC-08 belong to Phase 6, NOT this phase

### Prior-phase context that constrains Phase 5
- `.planning/phases/02-shared-workflows-hardening/02-CONTEXT.md` §"Schema interaction" D-13 — `previewUrl` is stored in `release_logs.metadata` JSONB (no dedicated column). Phase 5 reads `release.metadata.previewUrl`
- `.planning/phases/03-schema-github-app-permissions/03-CONTEXT.md` — `release_logs.branch` is nullable, defaults to `'main'`, backfilled. Phase 5 must tolerate null branches (treat as `'main'`)
- `.planning/phases/04-promote-branch-workflow/04-CONTEXT.md` — `promote_attempts` schema (D-13), result enum `merged | conflict | ci_failed`, `conflict_files` JSONB, `rebase_error` text. Phase 5 queries this table for the conflict badge. **Note:** Phase 4 D-17 says Phase 5 wires Slack approval dispatch — REQUIREMENTS supersedes this; RC-04 is mapped to Phase 6, not Phase 5
- `.planning/phases/04-promote-branch-workflow/04-RESEARCH.md` (when read by planner) — promote_attempts indexing details

### Existing customer page (the modification target)
- `src/app/projects/[slug]/releases/page.tsx` — server component; current Drizzle relational query for releases. Phase 5 extends this query (or adds a parallel one) to fetch `promote_attempts` latest-per-branch
- `src/app/projects/[slug]/releases/ReleasesClient.tsx` — client component with collapsed-row table, expand/collapse, 2-step approve, reject form, feedback. The branch-grouping wrapper goes here
- `src/app/projects/[slug]/releases/types.ts` — `ReleaseRow`, `FeedbackItem`, `ApprovalItem`. Add: section grouping types, conflict state, `previewUrl` field surfacing
- `src/app/projects/[slug]/releases/Timeline.tsx` — release lifecycle timeline (deployed-dev / feedback / approved / rejected / promoted / deployed-prod). Probably no changes; verify branch context displays cleanly
- `src/app/projects/[slug]/releases/format.ts` — formatters (`formatDeployedAt`, `formatRelativeTime`)

### Backing API & schema
- `src/app/api/projects/[slug]/releases/route.ts` — paginated load-more endpoint. May need to accept a `branch` filter in Phase 5 if pagination per-section is needed; otherwise initial single fetch covers all branches
- `src/app/api/projects/[slug]/releases/[releaseId]/approve/route.ts` — existing approve endpoint. **No changes in Phase 5** — Phase 6 swaps the dispatched workflow
- `src/app/api/projects/[slug]/releases/[releaseId]/reject/route.ts` — existing reject endpoint. No changes
- `src/db/schema.ts` — `releaseLogs` (with `branch`, `metadata`), `promoteAttempts` (with `result`, `conflictFiles`, `rebaseError`), `releaseApprovals`, `releaseFeedback`. Reference only; no schema changes

### Auth & membership
- `src/lib/auth-context.ts` — `getCurrentUserContext` resolves staff + memberships; existing `isMember` / `userRole='admin'|'viewer'` logic in `page.tsx` covers the per-RC approve permission gate

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`ReleasesClient.tsx` per-row ephemeral state** keyed by `release.id` (`approveStep`, `countdownState`, `showRejectForm`, `rejectReasons`, `rejecting`, `feedbackDrafts`, `submittingFeedback`). Already supports parallel state across rows — branch grouping doesn't change the keying.
- **`STATUS_BADGE_COLORS` + `ENV_BADGE_COLORS`** maps in `ReleasesClient.tsx` lines 24–35 — palette tokens to extend for the new `Conflict` badge (red-amber) and section-header aggregate badges.
- **`ChevronDown` / `ChevronRight` row expansion** pattern (lines 456–460) — reuse for section-header expand/collapse.
- **`Timeline.tsx`** lifecycle visualization — probably already correct under branch grouping (per-release, not per-branch); verify only.
- **`projects.appUrl`** column already populated for live projects — source of prod URL for `main` rows on D-06.
- **`@triarch/shared-ui` / `@myalterlego/shared-ui`** — existing dark-theme component library; if a Section / Accordion primitive exists there, prefer it over rolling local.

### Established Patterns

- **Drizzle relational query** in `page.tsx` with `db.query.releaseLogs.findMany({ with: { feedback, approvals } })` — extend with a parallel query for `promote_attempts` (cannot relate it via `with:` because there's no FK; use a separate `db.select().from(promoteAttempts)` and join in TS).
- **Server-side hydration of `ReleaseRow[]`** — keep this pattern; group by branch in the server component, pass a `BranchSection[]` shape (or a flat `releases` list with a `branch` field plus precomputed grouping metadata) to the client.
- **`formatDeployedAt` / `formatRelativeTime`** — reuse for timestamps in section headers ("Last deployed 2h ago").
- **Toast feedback** for action results — keep verbatim.
- **2-step approve countdown** with `useEffect` interval cleanup — keep verbatim.

### Integration Points

- **`page.tsx`** is the single server-side fetch entrypoint for the page. Phase 5 work: add `promote_attempts` query and a branch-grouping pre-pass before passing to `ReleasesClient`.
- **`ReleasesClient.tsx`** — restructure render: outer `branchSections.map(section => <SectionHeader /> + <RCTable />)`. Inner per-row UI mostly unchanged; add the inline preview-URL icon, branch+version confirm label, conflict-aware action area.
- **`types.ts`** — add `branch: string` to `ReleaseRow` (currently absent), add a `BranchSection` type holding `{ branch, releases, conflict?: { files: string[]; rebaseError: string | null; createdAt: string } | null, aggregateStatus: { pending: number; promoted: number; rejected: number; conflict: boolean } }`, surface `previewUrl: string | null` on `ReleaseRow`.
- **No changes to API routes** in this phase. The existing `/api/projects/{slug}/releases/[releaseId]/approve` endpoint is fine for Phase 5; Phase 6 modifies its dispatch behavior.
- **No DB schema changes**. All required columns / tables already exist.

</code_context>

<specifics>
## Specific Ideas

- **Section-header badge palette**: pending → amber (matches `pending_approval` color); promoted → amber-300 (matches `promoted`); conflict → red (matches `rejected`); ci_failed → yellow if surfaced.
- **Conflict file list rendering**: when expanded, render `<ul>` of monospace file paths capped at 50 (truncate with `+ N more` link). The promote_attempts.conflictFiles JSONB is bounded in practice, but defensive cap prevents an enormous DOM if a future bug fills it.
- **Preview URL icon component** is small enough to inline in `ReleasesClient.tsx`, but a separate `<PreviewLink url={...} fallback="No preview deployed" />` component reads better and lets us unit-test the disabled-state rendering.
- **Server query for conflict state** — single statement:
  ```sql
  SELECT branch, MAX(created_at) FROM promote_attempts
   WHERE project = ? AND result = 'conflict'
   GROUP BY branch;
  ```
  Then compare each branch's max-conflict timestamp against the same branch's `MAX(release_logs.deployed_at)`.
- **Stable section keys** for React: `section.branch` (the string itself) — branch names are unique per project.
- **Mobile**: section headers stack; the badge cluster wraps below the branch name on narrow screens. Test at 375px.
- **Accessibility**: section header is a `<button>` with `aria-expanded`, `aria-controls={panelId}`. Conflict badge is `role="status"` so screen readers announce when it appears.

</specifics>

<deferred>
## Deferred Ideas

- **Wiring approve to dispatch `promote-branch.yml`** — RC-04, Phase 6. Phase 5's approve button still hits the existing v1.14 approve endpoint; Phase 6 changes server-side dispatch.
- **Slack conflict reply** — RC-06, Phase 6 (admin posts threaded `:warning:` to Slack when the callback receives a conflict result).
- **Branch name in OttoBot Slack message** — RC-05, Phase 6.
- **Concurrent RC server-side safety** — RC-08, Phase 6.
- **AI-mediated conflict resolution / customer-page conflict resolver UI** — v3 (CONFLICT-V3-01, CONFLICT-V3-02).
- **CI-failed badge variant** — Phase 5 success criteria only call out `conflict`; surfacing `result='ci_failed'` is Claude's discretion. If user-visible, comes with the same expand/collapse pattern.
- **Bulk-approve UX** ("approve all pending RCs at once") — out of scope; if requested later it's a v3 candidate.
- **Manual "Dismiss" on conflict badge** — rejected; auto-clear on new RC deploy is the source of truth.
- **Per-section pagination** — punted; one initial fetch covers all branches with the existing PAGE_SIZE+1 guard. If a project ever has hundreds of branches, revisit.

</deferred>

---

*Phase: 05-customer-page-rc-ui*
*Context gathered: 2026-05-05*
