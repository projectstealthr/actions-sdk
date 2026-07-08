#!/usr/bin/env node
/**
 * Live-smoke monitor — the maintenance early-warning system for the owned action
 * library ([[actions-sdk-maintenance-strategy]]). It discovers every ACTIVE
 * Composio connection, then runs the READ-ONLY live spec for each app that has
 * one, in a single jest pass. If an upstream API deprecates or changes shape, the
 * smoke goes red HERE — on a schedule — before a customer ever hits it.
 *
 * Read-only by design: it never sets `*_LIVE_WRITE`, so scheduled runs never
 * mutate the sandboxes. Self-skipping specs (no connection, or a missing
 * instance var like ZENDESK_SUBDOMAIN) are benign — only a real failure fails
 * the build.
 *
 * Usage: COMPOSIO_API_KEY=... node scripts/live-smoke-monitor.mjs
 * Exit 0 = all green (or skipped); 1 = at least one live spec failed; 2 = setup error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY = process.env.COMPOSIO_API_KEY;
if (!KEY) {
  console.error('✗ COMPOSIO_API_KEY is required (set it as a repo secret / env var).');
  process.exit(2);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Composio toolkit slug → actions-sdk app dir (only the Google suite + a couple differ).
const TOOLKIT_TO_APP = {
  googlesheets: 'sheets',
  googledocs: 'docs',
  googledrive: 'drive',
  googleslides: 'slides',
  googlecalendar: 'calendar',
};
// app dir → the env var its live spec reads for the connection id (default: <APP>_CONNECTED_ACCOUNT_ID).
const ACCOUNT_ENV = { calendar: 'GOOGLECALENDAR_CONNECTED_ACCOUNT_ID' };

async function activeConnections() {
  const res = await fetch(
    'https://backend.composio.dev/api/v3/connected_accounts?statuses=ACTIVE&limit=100',
    { headers: { 'x-api-key': KEY } },
  );
  if (!res.ok) throw new Error(`Composio connected_accounts → HTTP ${res.status}`);
  const body = await res.json();
  const items = body.items ?? body.data ?? [];
  const byApp = new Map(); // app dir → first connection id
  for (const it of items) {
    const slug = it.toolkit?.slug;
    if (!slug) continue;
    const app = TOOLKIT_TO_APP[slug] ?? slug;
    if (!byApp.has(app)) byApp.set(app, it.id);
  }
  return byApp;
}

const connected = await activeConnections();

// Build one env carrying every connected app's account id, then run all their
// live specs in a single jest pass (unset specs self-skip via liveComposioDescribe).
const env = { ...process.env, ORCHESTR_LIVE: '1' };
const covered = [];
for (const [app, ca] of connected) {
  if (!existsSync(join(repoRoot, `src/actions/${app}/${app}.live.spec.ts`))) continue;
  env[ACCOUNT_ENV[app] ?? `${app.toUpperCase()}_CONNECTED_ACCOUNT_ID`] = ca;
  covered.push(app);
}

if (covered.length === 0) {
  console.log('No connected apps have a live spec — nothing to smoke.');
  process.exit(0);
}
covered.sort();
console.log(`Live-smoke monitor — ${covered.length} connected app(s): ${covered.join(', ')}\n`);

try {
  execFileSync('npx', ['jest', '--testPathPattern', 'live\\.spec\\.ts$', '--passWithNoTests', '--ci'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  console.log('\n✓ live-smoke monitor: all connected apps green.');
  process.exit(0);
} catch {
  console.error('\n✗ live-smoke monitor: at least one app failed — an upstream API likely changed.');
  process.exit(1);
}
