import { describe, expect, it } from 'vitest';
import { parseSources } from './config';
import type { Lock } from './lock';
import { repoNames } from './repos';

const app = (id: string, repo: string) => ({
  id,
  label: id,
  description: 'd',
  repo,
  docsPath: 'docs',
});
const config = parseSources({ apps: [app('app-a', 'Org/app-a'), app('app-b', 'Org/app-b')] });
const sha = 'a'.repeat(40);
const lock: Lock = {
  apps: {
    'app-a': {
      defaultBranch: 'main',
      versions: [{ version: '0.1.0', tag: 'v0.1.0', commit: sha, publishedAt: 'x' }],
      retired: [],
    },
  },
};

describe('repoNames', () => {
  it('names only locked apps for fetching, all apps for syncing', () => {
    expect(repoNames(config, lock, 'locked', 'org')).toEqual(['app-a']);
    expect(repoNames(config, lock, 'all', 'Org')).toEqual(['app-a', 'app-b']);
    expect(repoNames(config, { apps: {} }, 'locked', 'Org')).toEqual([]);
  });

  it('rejects apps outside the installation owner', () => {
    expect(() => repoNames(config, lock, 'all', 'Other')).toThrow(/same organization/);
  });
});
