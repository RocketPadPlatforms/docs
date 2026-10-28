import type { SourcesConfig } from './config';
import type { Lock } from './lock';

/**
 * Repository names (no owner) an installation token must cover. Tokens are always scoped to
 * an explicit list, so only apps that are actually needed are named: the ones with locked
 * versions to fetch, or all configured ones when syncing.
 */
export function repoNames(
  config: SourcesConfig,
  lock: Lock,
  mode: 'locked' | 'all',
  owner: string,
): string[] {
  const names = new Set<string>();
  for (const app of config.apps) {
    if (mode === 'locked' && !lock.apps[app.id]?.versions.length) continue;
    const [appOwner, name] = app.repo.split('/');
    if (appOwner.toLowerCase() !== owner.toLowerCase()) {
      throw new Error(
        `${app.id}: ${app.repo} is not in "${owner}". One App installation covers one owner; ` +
          'keep all app repositories in the same organization.',
      );
    }
    names.add(name);
  }
  return [...names];
}
