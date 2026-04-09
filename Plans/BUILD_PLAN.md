# Triarch Dev — Build Plan

**Status:** ALL PHASES COMPLETE (v0.9.0). Full platform built — 38 routes, 15 DB tables, 11 admin pages.
**Architecture:** Next.js 16 SSR, CockroachDB (triarch_dev), Drizzle ORM, NextAuth v4 Google OAuth
**Source plans:** `triarchsecurity-admin/MEMORY/WORK/20260403-140000_cross-project-modular-platform-plans/`

---

## What's Done (Phase 0 — Foundation)

- [x] Switched from static export to SSR
- [x] CRDB database `triarch_dev` created on triarchdev-24092 cluster
- [x] Drizzle ORM configured with schema + migrations
- [x] 5 tables: menu_sections, menu_pages, menu_subpages, role_permissions, module_settings
- [x] NextAuth v4 Google OAuth (triarch-dev-website GCP project)
- [x] Admin layout at `/admin/*` with auth gating
- [x] DB-driven AdminSidebar component
- [x] Navigation API at `/api/platform/navigation`
- [x] Seeded 4 sections + 6 pages
- [x] Central Management Dashboard at `/admin`
- [x] 6 placeholder admin pages
- [x] Firebase App Hosting config (`apphosting.yaml`)
- [x] Version tracking (`src/lib/version.ts` — v0.2.0)
- [x] Build passes clean

---

## Phase 1B — Navigation Editor + Module Settings (Plan 4 remaining)

**Goal:** Give Mike UI control over the sidebar menu from the admin console.

### Tasks
1. **Navigation Editor page** (`/admin/platform/navigation`)
   - Tree view of sections → pages → subpages for project `triarch-dev`
   - Add/edit/delete sections, pages, subpages
   - Inline editing: label, icon, path, sort order, min_role, active toggle
   - Drag-and-drop reorder (or up/down buttons for simplicity)
   - Role preview: "View as User" / "View as Admin" buttons to filter the tree

2. **Navigation Admin API** — CRUD endpoints
   - `POST /api/platform/navigation/sections` — create section
   - `PUT /api/platform/navigation/sections/:id` — update
   - `DELETE /api/platform/navigation/sections/:id` — delete
   - Same for `/pages` and `/subpages`
   - `PATCH /api/platform/navigation/reorder` — batch update sort orders

3. **Module Settings API** (`/api/platform/settings`)
   - `GET /api/platform/settings?module=X&project=Y` — get effective settings (scope inheritance)
   - `PUT /api/platform/settings` — upsert setting

4. **Settings page** (`/admin/settings`)
   - Module enable/disable toggles
   - Navigation preferences (sidebar collapsed default, compact mode)

**Version bump:** v0.3.0

---

## Phase 2A — Release Audit Logging (Plan 1)

**Goal:** Track every release across all projects with structured changelogs.

### Schema Addition
- `release_logs` table (see Plan 1 §2)

### Tasks
1. **Add `release_logs` table** to Drizzle schema + migrate
2. **Release Logs API**
   - `GET /api/platform/release-logs?project=X&limit=20&offset=0` — list with pagination
   - `GET /api/platform/release-logs/:version` — single version detail
   - `POST /api/platform/release-logs` — create (admin/CI only)
   - `PUT /api/platform/release-logs/:id` — edit entry
3. **Release Log Viewer page** (`/admin/modules/release-logs`)
   - Timeline view, newest first
   - Project filter dropdown (triarch-dev, thisnthat, darksouls, admin, portal — or "All")
   - Release type pills (patch/minor/major)
   - Expandable entries with type icons (feature, bugfix, refactor, etc.)
   - Search across descriptions
   - Manual entry creation form for retroactive logging
4. **Backfill script** — parse git history for existing projects to seed initial release logs
5. **`.changelog/unreleased.json` setup** — in this project + hook into version bump process
6. **Version footer link** — click version in sidebar footer → filtered release log

**Version bump:** v0.4.0

---

## Phase 2B — Access Logging (Plan 2)

**Goal:** Audit trail for admin role assumptions across projects.

### Schema Addition
- `access_audit_logs` table (see Plan 2 §3)

### Tasks
1. **Add `access_audit_logs` table** to Drizzle schema + migrate
2. **Access Audit API**
   - `GET /api/platform/access-logs?project=X` — list with filters
   - `POST /api/platform/access-logs` — log an access event
3. **Access Audit Viewer page** (`/admin/modules/access-audit`)
   - Timeline of all access events across projects
   - Project + actor filters
   - Session details: start/end time, reason, actions taken
   - Active sessions view (if any)
   - Stats: impersonation frequency, avg session duration
4. **Note:** Portal-side impersonation UI and middleware are built in the respective portal projects, not here. triarch-dev only provides the central admin view + API.

**Version bump:** v0.5.0

---

## Phase 3A — Bug & Feature Portal (Plan 3)

**Goal:** Centralized bug triage and feature request management.

### Schema Addition
- `bug_reports` table (see Plan 3 §2)
- `feature_requests` table
- `workflow_transitions` table

### Tasks
1. **Add 3 tables** to Drizzle schema + migrate
2. **Bug Reports API**
   - `GET /api/platform/bug-reports?project=X&status=Y` — list with filters
   - `POST /api/platform/bug-reports` — submit (from any project's portal)
   - `PATCH /api/platform/bug-reports/:id` — update status, priority, notes
   - `POST /api/platform/bug-reports/:id/approve` — approve fix (triggers workflow)
3. **Feature Requests API**
   - `GET /api/platform/feature-requests?project=X` — list
   - `POST /api/platform/feature-requests` — submit
   - `PATCH /api/platform/feature-requests/:id` — update, approve, decline
4. **Bug Reports page** (`/admin/modules/bug-reports`)
   - Triage dashboard: all bugs from all projects
   - Severity + priority + project filters
   - Status workflow visualization
   - Inline priority toggle (fix now ↔ fix later)
   - Internal notes field
   - Assign to version
5. **Feature Requests page** (new nav item, or tab on bug reports)
   - All feature requests across projects
   - Auto-generated build plan viewer (read-only display of JSONB plan)
   - Approve/Decline/Defer actions
   - Upvote counts
6. **Build Queue page** (new nav item under Modules)
   - Grouped by target version
   - Pending fixes + pending features
   - In progress + recently completed

**Version bump:** v0.6.0

---

## Phase 3B — Slack Integration (Plan 3 continued)

**Goal:** Slack-based approval workflow for bugs and features.

### Tasks
1. **Slack App setup** — create app, configure webhooks + interactive components
2. **Slack notification on bug submit** — formatted message to #triarch-bugs
3. **Slack notification on feature submit** — formatted message to #triarch-features
4. **Interactive buttons** — Approve Fix / Defer / Decline with webhook handlers
5. **Webhook endpoints**
   - `POST /api/platform/slack/bug-action`
   - `POST /api/platform/slack/feature-action`
6. **Status change notifications** — notify Slack when status transitions happen

**Version bump:** v0.7.0

---

## Phase 4A — Service Offering Builder (Plan 6)

**Goal:** Manage service offerings, milestones, and invoices.

### Schema Addition
- `service_offerings` table
- `offering_components` table
- `offering_milestones` table
- `offering_invoices` table

### Tasks
1. Add 4 tables + migrate
2. Service Offerings API (CRUD)
3. Service Offering Builder page (`/admin/modules/service-offerings`)
4. Website display API (for triarch.dev/triarchsecurity.com service pages)
5. Seed CAB and SAB as initial offerings

**Version bump:** v0.8.0

---

## Phase 4B — Report Generator (Plan 5)

**Goal:** Status meeting report builder with modular sections.

### Schema Addition
- `report_section_types` table
- `report_sections` table
- `reports` table

### Tasks
1. Add tables + migrate
2. Report section type definitions (16 types from Plan 5)
3. Report builder UI with section picker
4. CAB HTML report migration to DB-driven sections
5. Report preview + export (PDF/HTML)

**Version bump:** v0.9.0

---

## Future — Projects Page + Cross-Project Management

- `/admin/platform/projects` — manage registered projects (name, domain, DB connection, enabled modules)
- Per-project module configuration
- Cross-project dashboard widgets (live stats from each project's API)

---

## Deployment Checklist (First Deploy)

1. Create Firebase App Hosting backend: `firebase apphosting:backends:create`
2. Set secrets:
   ```
   firebase apphosting:secrets:set DATABASE_URL
   firebase apphosting:secrets:set NEXTAUTH_SECRET
   firebase apphosting:secrets:set GOOGLE_CLIENT_ID
   firebase apphosting:secrets:set GOOGLE_CLIENT_SECRET
   ```
3. Connect GitHub repo for auto-deploy on push
4. Verify NEXTAUTH_URL in apphosting.yaml matches actual domain
5. Test Google OAuth redirect URI works on production domain
