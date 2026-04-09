/**
 * Triarch Dev Ingest Client
 *
 * Drop this file into any triarch.dev project to report release logs
 * and bug reports to the central control plane.
 *
 * Usage:
 *   npx tsx scripts/triarch-ingest.ts flush-changelog
 *   npx tsx scripts/triarch-ingest.ts report-bug --title "..." --description "..."
 *
 * Environment:
 *   TRIARCH_API_KEY — project API key from triarch-dev control plane
 *   TRIARCH_API_URL — defaults to https://www.triarch.dev
 */

const API_URL = process.env.TRIARCH_API_URL ?? 'https://www.triarch.dev';
const API_KEY = process.env.TRIARCH_API_KEY;

if (!API_KEY) {
  console.error('TRIARCH_API_KEY environment variable is required');
  process.exit(1);
}

async function ingest(endpoint: string, data: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/api/platform/ingest/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`Ingest failed (${res.status}):`, err);
    process.exit(1);
  }

  return res.json();
}

async function flushChangelog() {
  const fs = await import('fs');
  const path = await import('path');

  const changelogPath = path.join(process.cwd(), '.changelog', 'unreleased.json');

  if (!fs.existsSync(changelogPath)) {
    console.log('No .changelog/unreleased.json found — nothing to flush.');
    return;
  }

  const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));

  if (!changelog.entries?.length) {
    console.log('No unreleased entries to flush.');
    return;
  }

  // Read version from package.json
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = `v${pkg.version}`;

  // Determine release type from version
  const parts = pkg.version.split('.');
  const releaseType = parts[0] !== '0' ? 'major' : parts[1] !== '0' ? 'minor' : 'patch';

  const result = await ingest('release-logs', {
    version,
    releaseType,
    summary: changelog.summary ?? `Release ${version}`,
    entries: changelog.entries,
    releasedBy: 'ci/cd',
    metadata: {
      sha: process.env.GITHUB_SHA ?? null,
      ci_run: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    },
  });

  console.log(`Release ${version} logged:`, result.id);

  // Clear unreleased entries
  fs.writeFileSync(changelogPath, JSON.stringify({ entries: [] }, null, 2));
  console.log('Cleared .changelog/unreleased.json');
}

async function reportBug() {
  const args = process.argv.slice(3);
  const title = args.find((_, i) => args[i - 1] === '--title') ?? 'Bug report from CLI';
  const description = args.find((_, i) => args[i - 1] === '--description') ?? '';
  const severity = args.find((_, i) => args[i - 1] === '--severity') ?? 'medium';

  const result = await ingest('bug-reports', {
    reportedByUserId: 'cli',
    reportedByName: 'CLI Reporter',
    title,
    description,
    severity,
    priority: 'fix_later',
  });

  console.log(`Bug report created:`, result.id);
}

const command = process.argv[2];

switch (command) {
  case 'flush-changelog':
    flushChangelog();
    break;
  case 'report-bug':
    reportBug();
    break;
  default:
    console.log(`Usage:
  npx tsx scripts/triarch-ingest.ts flush-changelog   — Push unreleased entries to triarch-dev
  npx tsx scripts/triarch-ingest.ts report-bug        — Report a bug
    --title "Bug title"
    --description "What happened"
    --severity critical|high|medium|low`);
}
