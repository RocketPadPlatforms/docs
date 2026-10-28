import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import semver from 'semver';
import { cacheDir, SOURCES_DIR } from './fetch-docs';
import { type AppConfig, loadSources } from './lib/config';
import { assertNoSymlinks } from './lib/fs';
import { type Lock, readLock } from './lib/lock';
import { loadSidebars } from './lib/sidebars';

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

const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

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

export async function prepare(opts: { cwd?: string; sources?: string } = {}): Promise<DocsIndex> {
  const cwd = opts.cwd ?? process.cwd();
  const sources = opts.sources ?? join(cwd, SOURCES_DIR);
  const config = loadSources(join(cwd, 'docs-sources.json'));
  const lock = readLock(join(cwd, 'docs-versions.lock.json'));
  const index = buildIndex(config.apps, lock);

  for (const app of config.apps) {
    rmSync(join(cwd, `${app.id}_versions.json`), { force: true });
    rmSync(join(cwd, `${app.id}_versioned_docs`), { recursive: true, force: true });
    rmSync(join(cwd, `${app.id}_versioned_sidebars`), { recursive: true, force: true });
  }

  for (const entry of index.apps) {
    const app = config.apps.find((a) => a.id === entry.id) as AppConfig;
    const docsOut = join(cwd, `${app.id}_versioned_docs`);
    const sidebarsOut = join(cwd, `${app.id}_versioned_sidebars`);
    mkdirSync(sidebarsOut, { recursive: true });

    for (const v of lock.apps[app.id].versions) {
      const where = `${app.id}@${v.version}`;
      const src = cacheDir(app.id, v.commit, sources);
      const docsSrc = join(src, app.docsPath);
      if (!existsSync(docsSrc)) {
        throw new Error(`${where}: sources missing at ${src}; run "pnpm fetch:docs" first`);
      }
      assertNoSymlinks(docsSrc, where);
      cpSync(docsSrc, join(docsOut, `version-${v.version}`), { recursive: true });
      writeJson(
        join(sidebarsOut, `version-${v.version}-sidebars.json`),
        await loadSidebars(src, app.sidebarFile, where),
      );
    }
    writeJson(join(cwd, `${app.id}_versions.json`), entry.versions);
  }

  mkdirSync(join(cwd, 'generated'), { recursive: true });
  writeJson(join(cwd, INDEX_PATH), index);
  return index;
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) {
  const index = await prepare();
  console.log(
    index.apps.length
      ? index.apps.map((a) => `${a.id}: ${a.versions.join(', ')} (latest ${a.latest})`).join('\n')
      : 'No locked versions yet; the site will only contain the landing page.',
  );
}
