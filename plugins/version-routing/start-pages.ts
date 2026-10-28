import type { DocsVersion } from './docs-content';
import { stripSlash } from './types';

interface SidebarItemLike {
  type?: string;
  id?: string;
  items?: unknown[];
  link?: { type?: string; id?: string; permalink?: string };
}

/**
 * First navigable page of a sidebar, mirroring Docusaurus: a doc, a category that links to a
 * doc or generated index, else the first such page among its children. External links,
 * html and refs are skipped.
 */
function firstLink(items: unknown[], version: DocsVersion): string | null {
  const permalinkOf = (id?: string) => version.docs.find((d) => d.id === id)?.permalink ?? null;
  for (const raw of items) {
    const item = raw as SidebarItemLike;
    if (item.type === 'doc') {
      const p = permalinkOf(item.id);
      if (p) return p;
    } else if (item.type === 'category') {
      if (item.link?.type === 'doc') {
        const p = permalinkOf(item.link.id);
        if (p) return p;
      } else if (item.link?.type === 'generated-index' && item.link.permalink) {
        return item.link.permalink;
      }
      const nested = firstLink(item.items ?? [], version);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Where a visitor lands for this version: the doc served at the version root (slug "/") if
 * there is one, otherwise the first doc of sidebar `docs`. Null when neither exists.
 */
export function startPage(version: DocsVersion): string | null {
  const root = stripSlash(version.path);
  const rootDoc = version.docs.find((d) => stripSlash(d.permalink) === root);
  if (rootDoc) return rootDoc.permalink;
  return firstLink(version.sidebars.docs ?? [], version);
}
