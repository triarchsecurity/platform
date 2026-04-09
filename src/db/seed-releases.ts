import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL!;

async function seedReleases() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Check if any releases exist
  const existing = await db.select().from(schema.releaseLogs).limit(1);
  if (existing.length > 0) {
    console.log('Release logs already exist, skipping seed.');
    await pool.end();
    return;
  }

  console.log('Seeding release logs...');

  // Seed historical releases for triarch-dev
  await db.insert(schema.releaseLogs).values([
    {
      project: 'triarch-dev',
      version: 'v0.1.0',
      releaseType: 'minor',
      summary: 'Initial project setup — Next.js 16 marketing website',
      releasedBy: 'claude-code',
      releasedAt: new Date('2026-04-03T18:00:00Z'),
      entries: [
        { type: 'feature', description: 'Create Next.js 16 project with Tailwind CSS' },
        { type: 'feature', description: 'Marketing website with Header, Hero, About, Services, Process, Contact, Footer' },
        { type: 'feature', description: 'Firebase Hosting static deploy config' },
      ],
    },
    {
      project: 'triarch-dev',
      version: 'v0.2.0',
      releaseType: 'minor',
      summary: 'Admin console foundation — DB, auth, sidebar, dashboard',
      releasedBy: 'claude-code',
      releasedAt: new Date('2026-04-08T20:00:00Z'),
      entries: [
        { type: 'feature', description: 'Switch from static export to SSR for admin capabilities' },
        { type: 'feature', description: 'CockroachDB connection with Drizzle ORM (triarch_dev database)' },
        { type: 'feature', description: 'NextAuth v4 Google OAuth authentication' },
        { type: 'feature', description: 'DB-driven navigation — menu_sections, menu_pages, menu_subpages tables' },
        { type: 'feature', description: 'AdminSidebar component with collapsible sections and mobile overlay' },
        { type: 'feature', description: 'Central Management Dashboard at /admin' },
        { type: 'feature', description: 'Navigation API at /api/platform/navigation' },
        { type: 'feature', description: 'Firebase App Hosting config (apphosting.yaml)' },
      ],
    },
    {
      project: 'triarch-dev',
      version: 'v0.3.0',
      releaseType: 'minor',
      summary: 'Navigation Editor + Module Settings + Release Audit Logging',
      releasedBy: 'claude-code',
      releasedAt: new Date('2026-04-09T12:00:00Z'),
      entries: [
        { type: 'feature', description: 'Navigation Editor page — tree view with inline editing, reorder, role preview' },
        { type: 'feature', description: 'Navigation CRUD API — sections, pages, subpages with create/update/delete/reorder' },
        { type: 'feature', description: 'Module Settings API with scope inheritance (global > company > user)' },
        { type: 'feature', description: 'Settings page with module enable/disable toggles and nav preferences' },
        { type: 'feature', description: 'Release Logs table, API, and timeline viewer' },
        { type: 'feature', description: 'Release log manual entry form with changelog entries' },
        { type: 'feature', description: '.changelog/unreleased.json for in-flight tracking' },
      ],
    },
  ]);

  console.log('Release logs seeded!');
  await pool.end();
}

seedReleases().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
