import { join, resolve, sep } from 'node:path';
import { redirectHtml } from './redirect-html';
import { type AppData, stripSlash, withSlash } from './types';

export interface RedirectWrite {
  file: string;
  html: string;
}

/**
 * For every version: its start page must be a built route (else the build fails). When the
 * start page is not the version root itself, the version root has no doc and Docusaurus
 * rendered a soft 404 there; that index.html is replaced by a static redirect.
 */
export function planRedirects(opts: {
  apps: AppData[];
  routesPaths: string[];
  outDir: string;
  siteUrl: string;
}): { writes: RedirectWrite[]; problems: string[] } {
  const routes = new Set(opts.routesPaths.map(stripSlash));
  const out = resolve(opts.outDir);
  const writes = new Map<string, RedirectWrite>();
  const problems: string[] = [];

  for (const app of opts.apps) {
    for (const v of app.versions) {
      const where = `${app.id}@${v.name}`;
      if (!v.startPage) {
        problems.push(
          `${where}: no start page. Add a root doc (slug: /) or put a doc into sidebar "docs".`,
        );
        continue;
      }
      if (!routes.has(stripSlash(v.startPage))) {
        problems.push(`${where}: redirect target ${v.startPage} is not a built route`);
        continue;
      }
      if (stripSlash(v.startPage) === v.basePath) continue;

      const file = resolve(join(out, v.basePath, 'index.html'));
      if (!file.startsWith(out + sep)) {
        problems.push(`${where}: redirect file ${file} would be written outside the build output`);
      } else if (writes.has(file)) {
        problems.push(`${where}: two redirects want to write ${file}`);
      } else {
        const canonical = new URL(withSlash(v.startPage), opts.siteUrl).href;
        writes.set(file, { file, html: redirectHtml(withSlash(v.startPage), canonical) });
      }
    }
  }
  return { writes: [...writes.values()], problems };
}

/**
 * Old URLs -> new pages. Unlike version roots, these may never replace an existing file.
 */
export function planLegacy(opts: {
  legacy: Record<string, string | false | null>;
  routesPaths: string[];
  outDir: string;
  siteUrl: string;
  exists: (file: string) => boolean;
}): { writes: RedirectWrite[]; problems: string[]; open: string[] } {
  const routes = new Set(opts.routesPaths.map(stripSlash));
  const out = resolve(opts.outDir);
  const writes: RedirectWrite[] = [];
  const problems: string[] = [];
  const open: string[] = [];
  const seen = new Set<string>();

  for (const [source, target] of Object.entries(opts.legacy)) {
    if (target === null) {
      open.push(source);
      continue;
    }
    if (target === false) continue;
    const file = resolve(join(out, source, 'index.html'));
    if (!file.startsWith(out + sep)) {
      problems.push(`legacy ${source}: would be written outside the build output`);
    } else if (!routes.has(stripSlash(target))) {
      problems.push(`legacy ${source}: redirect target ${target} is not a built route`);
    } else if (opts.exists(file) || seen.has(file)) {
      problems.push(`legacy ${source}: would overwrite an existing file (${file})`);
    } else {
      seen.add(file);
      const canonical = new URL(withSlash(target), opts.siteUrl).href;
      writes.push({ file, html: redirectHtml(withSlash(target), canonical) });
    }
  }
  return { writes, problems, open };
}
