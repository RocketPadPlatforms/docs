import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadSources } from './lib/config';
import { gitBase } from './lib/git';
import { readLock, serializeLock } from './lib/lock';
import { GitHubProvider } from './lib/providers/github';
import { LocalGitProvider } from './lib/providers/local-git';
import type { Provider } from './lib/providers/types';
import { runSync } from './lib/sync';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    only: { type: 'string' },
    provider: { type: 'string', default: process.env.DOCS_PROVIDER ?? 'github' },
    config: { type: 'string', default: 'docs-sources.json' },
    lock: { type: 'string', default: 'docs-versions.lock.json' },
    summary: { type: 'string', default: '.cache/sync-summary.md' },
  },
});

function makeProvider(): Provider {
  if (values.provider === 'local-git') return new LocalGitProvider(gitBase());
  if (values.provider === 'github') return new GitHubProvider({ token: process.env.GITHUB_TOKEN });
  throw new Error(`unknown --provider "${values.provider}" (github | local-git)`);
}

const config = loadSources(values.config);
const lockPath = values.lock as string;
const before = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : '';

const { lock, summary, warnings } = await runSync({
  config,
  lock: readLock(lockPath),
  provider: makeProvider(),
  only: values.only,
});

const after = serializeLock(lock);
const changed = after !== before;

for (const w of warnings) console.warn(`warning: ${w}`);
console.log(changed ? summary : `${summary}\n(lock file unchanged)`);

if (values['dry-run']) {
  console.log(`\n--dry-run: ${changed ? 'would update' : 'would not touch'} ${lockPath}`);
} else {
  const summaryPath = values.summary as string;
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, `${summary}\n`);
  if (changed) writeFileSync(lockPath, after);
}
