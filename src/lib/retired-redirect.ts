import { type AppData, stripSlash, withSlash } from '@site/plugins/version-routing/types';

/** Query flag that marks a page we already redirected to, so a miss can never loop. */
export const REDIRECT_FLAG = 'redirected=1';

/**
 * Where a not-found path should go, or null.
 * 1. a version root without a doc of its own -> that version's start page (dev only; builds
 *    get a static redirect from the version-routing plugin);
 * 2. a retired version -> the same sub-path in the successor if that doc exists there,
 *    else the successor's start page.
 */
export function resolveRedirect(
  pathname: string,
  apps: AppData[],
  docExists: (path: string) => boolean,
): string | null {
  const path = stripSlash(pathname);
  for (const app of apps) {
    for (const v of app.versions) {
      if (path === v.basePath && v.startPage && stripSlash(v.startPage) !== path) {
        return withSlash(v.startPage);
      }
    }
    for (const retired of app.retired) {
      const prefix = `/${app.id}/${retired.version}`;
      if (path !== prefix && !path.startsWith(`${prefix}/`)) continue;
      const successor = app.versions.find((v) => v.name === retired.successor);
      if (!successor) continue; // not part of this build (DOCS_ONLY)
      const rest = path.slice(prefix.length);
      if (rest) {
        const candidate = stripSlash(successor.basePath) + rest;
        if (docExists(candidate)) return withSlash(candidate);
      }
      return successor.startPage ? withSlash(successor.startPage) : null;
    }
  }
  return null;
}
