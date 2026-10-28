import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { LOCK_FILE, openSyncPr } from './lib/sync-pr';

// Env: GITHUB_TOKEN (App installation token), GITHUB_REPOSITORY, DOCS_SYNC_AUTO_MERGE
const { values } = parseArgs({
  options: { summary: { type: 'string', default: '.cache/sync-summary.md' } },
});
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');

openSyncPr({
  repo,
  token,
  lockContent: readFileSync(LOCK_FILE, 'utf8'),
  body: readFileSync(values.summary as string, 'utf8'),
  autoMerge: process.env.DOCS_SYNC_AUTO_MERGE === 'true',
}).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
