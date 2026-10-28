import { existsSync, readFileSync } from 'node:fs';
import semver from 'semver';
import type { AppConfig } from './config';
import type { Lock } from './lock';

export interface DocsIndexApp {
  id: string;
  label: string;
  description: string;
  repo: string;
  docsPath: string;
  defaultBranch: string;
  latest: string;
  /** newest first */
  versions: string[];
  retired: { version: string; successor: string }[];
}

export interface DocsIndex {
  apps: DocsIndexApp[];
}

export const INDEX_PATH = 'generated/docs-index.json';

/** Pure: apps with at least one locked version, in docs-sources.json order. */
export function buildIndex(apps: AppConfig[], lock: Lock): DocsIndex {
  const out: DocsIndexApp[] = [];
  for (const app of apps) {
    const locked = lock.apps[app.id];
    if (!locked || locked.versions.length === 0) continue;
    const versions = locked.versions.map((v) => v.version).sort(semver.rcompare);
    out.push({
      id: app.id,
      label: app.label,
      description: app.description,
      repo: app.repo,
      docsPath: app.docsPath,
      defaultBranch: locked.defaultBranch,
      latest: versions[0],
      versions,
      retired: locked.retired,
    });
  }
  return { apps: out };
}

/**
 * Reads the index written by prepare-docs. Local mode may run without one
 * (a single app validated against its working copy), anything else must prepare first.
 */
export function readIndex(path = INDEX_PATH, { optional = false } = {}): DocsIndex {
  if (!existsSync(path)) {
    if (optional) return { apps: [] };
    throw new Error(`${path} not found. Run "pnpm fetch:docs && pnpm prepare:docs" first.`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as DocsIndex;
}
