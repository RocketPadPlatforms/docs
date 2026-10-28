import { useAllDocsData } from '@docusaurus/plugin-content-docs/client';
import { useHistory, useLocation } from '@docusaurus/router';
import { usePluginData } from '@docusaurus/useGlobalData';
import { type GlobalData, PLUGIN_NAME, stripSlash } from '@site/plugins/version-routing/types';
import { REDIRECT_FLAG, resolveRedirect } from '@site/src/lib/retired-redirect';
import NotFound from '@theme-original/NotFound';
import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';

/**
 * Retired versions no longer exist as pages. A visitor (or a search result) arriving on one
 * is sent once to the successor version: same sub-path if it exists there, else its start page.
 * NotFound is "Safe" to wrap (NotFound/Content is not), see README.
 */
export default function NotFoundWrapper(): ReactNode {
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

  return target ? null : <NotFound />;
}
