import { parseArgs } from 'node:util';
import { loadSources } from './lib/config';
import { readLock } from './lib/lock';
import { repoNames } from './lib/repos';

// Prints "repos=a,b" for $GITHUB_OUTPUT. --all: every configured app (sync); default: locked ones (fetch).
const { values } = parseArgs({ options: { all: { type: 'boolean', default: false } } });
const owner = process.env.GITHUB_REPOSITORY_OWNER;
if (!owner) throw new Error('GITHUB_REPOSITORY_OWNER is not set');
console.log(
  `repos=${repoNames(loadSources(), readLock(), values.all ? 'all' : 'locked', owner).join(',')}`,
);
