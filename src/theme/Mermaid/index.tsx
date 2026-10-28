import ErrorBoundary from '@docusaurus/ErrorBoundary';
import { ErrorBoundaryErrorMessageFallback, useColorMode } from '@docusaurus/theme-common';
import {
  MermaidContainerClassName,
  useMermaidConfig,
  useMermaidRenderResult,
} from '@docusaurus/theme-mermaid/client';
import { mermaidDark, mermaidLight } from '@site/mermaid-theme';
import type { RenderResult } from 'mermaid';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import styles from './styles.module.css';

/**
 * Ejected from @docusaurus/theme-mermaid 3.10.2.
 *
 * The only local change is picking `themeVariables` by color mode. Upstream
 * reads `themeConfig.mermaid.options` once, and that single object is applied
 * to both modes — which left diagrams drawn with navy edges on the near-black
 * dark ground. `useMermaidRenderResult` accepts a config override, and
 * `@docusaurus/theme-mermaid/client` is a public package export, so this is a
 * supported extension point rather than a reach into internals.
 *
 * When bumping Docusaurus, re-diff against
 * node_modules/@docusaurus/theme-mermaid/lib/theme/Mermaid/index.js.
 */

function MermaidRenderResult({ renderResult }: { renderResult: RenderResult }): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const div = ref.current;
    if (div) {
      renderResult.bindFunctions?.(div);
    }
  }, [renderResult]);
  return (
    <div
      ref={ref}
      className={`${MermaidContainerClassName} ${styles.container}`}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: renderResult.svg }}
    />
  );
}

function MermaidRenderer({ value }: { value: string }): ReactNode {
  const { colorMode } = useColorMode();
  const baseConfig = useMermaidConfig();

  const config = useMemo(
    () => ({
      ...baseConfig,
      themeVariables: {
        ...baseConfig.themeVariables,
        ...(colorMode === 'dark' ? mermaidDark : mermaidLight),
      },
    }),
    [baseConfig, colorMode],
  );

  const renderResult = useMermaidRenderResult({ text: value, config });

  if (renderResult === null) {
    return null;
  }
  return <MermaidRenderResult renderResult={renderResult} />;
}

export default function Mermaid(props: { value: string }): ReactNode {
  return (
    <ErrorBoundary fallback={(params) => <ErrorBoundaryErrorMessageFallback {...params} />}>
      <MermaidRenderer {...props} />
    </ErrorBoundary>
  );
}
