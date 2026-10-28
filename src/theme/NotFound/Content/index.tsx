import { useAllDocsData } from '@docusaurus/plugin-content-docs/client';
import { useHistory, useLocation } from '@docusaurus/router';
import { usePluginData } from '@docusaurus/useGlobalData';
import { type GlobalData, PLUGIN_NAME, stripSlash } from '@site/plugins/version-routing/types';
import { REDIRECT_FLAG, resolveRedirect } from '@site/src/lib/retired-redirect';
import type { Props } from '@theme/NotFound/Content';
import NotFoundContent from '@theme-original/NotFound/Content';
import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';

/**
 * Retired versions no longer exist as pages. A visitor (or a search result) arriving on one
 * is sent once to the successor version: same sub-path if it exists there, else its start page.
 *
 * This wraps NotFound/Content, which Docusaurus marks "unsafe" to swizzle, on purpose: the
 * latest version is served at /<app>, so /<app>/<retired>/... is captured by that version's
 * DocRoot, which renders NotFound/Content itself (the NotFound page is never involved).
 * Docusaurus is pinned exactly and the e2e suite covers this redirect, so an upgrade that
 * breaks the wrapper fails loudly.
 */
export default function NotFoundContentWrapper(props: Props): ReactNode {
  const { pathname, search } = useLocation();
  const history = useHistory();
  const apps = (usePluginData(PLUGIN_NAME) as GlobalData | undefined)?.apps ?? [];
  const docs = useAllDocsData();

  const target = useMemo(() => {
    if (search.includes(REDIRECT_FLAG)) return null; // already redirected once: never loop
    const known = new Set(
      Object.values(docs).flatMap((d) =>
        d.versions.flatMap((v) => v.docs.map((doc) => stripSlash(doc.path))),
      ),
    );
    return resolveRedirect(pathname, apps, (p) => known.has(p));
  }, [pathname, search, apps, docs]);

  useEffect(() => {
    if (target) history.replace(`${target}?${REDIRECT_FLAG}`);
  }, [target, history]);

  return target ? null : <NotFoundContent {...props} />;
}
