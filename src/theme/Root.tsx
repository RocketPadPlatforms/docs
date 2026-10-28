import Sky from '@site/src/components/Sky';
import type { ReactNode } from 'react';

/**
 * Theme Root — rendered once, above the router outlet.
 *
 * This is the only mount point in Docusaurus that is both present in the
 * prerendered HTML and never unmounted. Mounting the ambient sky in `Layout`
 * instead would remount it on every client-side navigation, restarting the
 * 90–240s drift keyframes from 0% and re-painting three large composited
 * layers on each page click; a `clientModules` entry would render browser-only
 * and flash a flat background on every first paint.
 *
 * There is no @theme-original/Root worth wrapping — the theme fallback is
 * ({children}) => children — so this file simply replaces it.
 */
export default function Root({ children }: { children: ReactNode }): ReactNode {
  return (
    <>
      <Sky />
      {children}
    </>
  );
}
