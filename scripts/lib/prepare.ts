import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AppConfig, loadSources } from './config';
import { buildIndex, type DocsIndex, INDEX_PATH } from './docs-index';
import { cacheDir, SOURCES_DIR } from './fetch';
import { assertNoSymlinks } from './fs';
import { readLock } from './lock';
import { loadSidebars } from './sidebars';

const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

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
