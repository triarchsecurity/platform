import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL!;

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  const existing = await db.select().from(schema.reportSectionTypes).limit(1);
  if (existing.length > 0) {
    console.log('Section types already exist, skipping.');
    await pool.end();
    return;
  }

  console.log('Seeding report section types...');

  await db.insert(schema.reportSectionTypes).values([
    // Standard
    { key: 'executive_summary', name: 'Executive Summary', category: 'standard', icon: 'file-text', sortOrder: 0,
      dataSchema: { type: 'object', properties: { summary_text: { type: 'string' }, highlights: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } } } } },
    { key: 'action_items', name: 'Action Items', category: 'standard', icon: 'file-text', sortOrder: 1,
      dataSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' }, status: { type: 'string' } } } } } } },
    { key: 'risk_matrix', name: 'Risk Matrix', category: 'standard', icon: 'shield', sortOrder: 2,
      dataSchema: { type: 'object', properties: { risks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, likelihood: { type: 'string' }, impact: { type: 'string' }, mitigation: { type: 'string' }, status: { type: 'string' } } } } } } },
    { key: 'metrics_dashboard', name: 'Key Metrics', category: 'standard', icon: 'activity', sortOrder: 3,
      dataSchema: { type: 'object', properties: { metrics: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, trend: { type: 'string' }, target: { type: 'string' } } } } } } },
    { key: 'timeline', name: 'Timeline / Milestones', category: 'standard', icon: 'activity', sortOrder: 4,
      dataSchema: { type: 'object', properties: { milestones: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, date: { type: 'string' }, status: { type: 'string' }, notes: { type: 'string' } } } } } } },
    { key: 'rich_text', name: 'Custom Content', category: 'standard', icon: 'file-text', sortOrder: 5,
      dataSchema: { type: 'object', properties: { html_content: { type: 'string' } } } },
    { key: 'table', name: 'Data Table', category: 'standard', icon: 'file-text', sortOrder: 6,
      dataSchema: { type: 'object', properties: { columns: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } } },
    { key: 'attachments', name: 'Attachments', category: 'standard', icon: 'file-text', sortOrder: 7,
      dataSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' }, type: { type: 'string' }, description: { type: 'string' } } } } } } },
    // CAB
    { key: 'cab_agenda', name: 'CAB Agenda', category: 'cab', icon: 'file-text', sortOrder: 10,
      dataSchema: { type: 'object', properties: { topics: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, duration_min: { type: 'number' }, presenter: { type: 'string' }, notes: { type: 'string' } } } } } } },
    { key: 'cab_attendees', name: 'Attendees', category: 'cab', icon: 'file-text', sortOrder: 11,
      dataSchema: { type: 'object', properties: { attendees: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, company: { type: 'string' }, present: { type: 'boolean' } } } } } } },
    { key: 'cab_decisions', name: 'Decisions Made', category: 'cab', icon: 'file-text', sortOrder: 12,
      dataSchema: { type: 'object', properties: { decisions: { type: 'array', items: { type: 'object', properties: { topic: { type: 'string' }, decision: { type: 'string' }, owner: { type: 'string' }, deadline: { type: 'string' } } } } } } },
    { key: 'cab_service_status', name: 'Service Status', category: 'cab', icon: 'shield', sortOrder: 13, requiresServiceOffering: true,
      dataSchema: { type: 'object', properties: { offering_id: { type: 'string' }, status: { type: 'string' }, metrics: { type: 'object' } } } },
    { key: 'cab_budget_review', name: 'Budget Review', category: 'cab', icon: 'activity', sortOrder: 14,
      dataSchema: { type: 'object', properties: { budget_data: { type: 'object' } } } },
    { key: 'cab_next_steps', name: 'Next Steps', category: 'cab', icon: 'file-text', sortOrder: 15,
      dataSchema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, owner: { type: 'string' }, timeline: { type: 'string' } } } } } } },
    // SAB
    { key: 'sab_strategic_overview', name: 'Strategic Overview', category: 'sab', icon: 'shield', sortOrder: 20,
      dataSchema: { type: 'object', properties: { overview_text: { type: 'string' }, strategic_goals: { type: 'array', items: { type: 'string' } } } } },
    { key: 'sab_threat_landscape', name: 'Threat Landscape', category: 'sab', icon: 'shield', sortOrder: 21,
      dataSchema: { type: 'object', properties: { threats: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, severity: { type: 'string' }, relevance: { type: 'string' }, recommendation: { type: 'string' } } } } } } },
  ]);

  console.log('16 section types seeded!');
  await pool.end();
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
