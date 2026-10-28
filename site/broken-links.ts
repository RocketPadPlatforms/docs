export type Severity = 'ignore' | 'log' | 'warn' | 'throw';

const SEVERITIES: Severity[] = ['ignore', 'log', 'warn', 'throw'];

export function parseSeverity(value: string | undefined): Severity | undefined {
  if (!value) return undefined;
  if (!SEVERITIES.includes(value as Severity)) {
    throw new Error(`DOCS_ON_BROKEN_LINKS must be one of ${SEVERITIES.join(', ')}, got "${value}"`);
  }
  return value as Severity;
}

/**
 * Released versions are immutable tags: a broken link in an old one can only be fixed by a new
 * release, so it must not block the portal. The latest version and a local working copy can be
 * fixed right away, so they fail the build. The version comes from the source path
 * (`<id>_versioned_docs/version-<v>/...`); any other path is a local working copy.
 */
export function brokenLinkSeverity(
  sourceFilePath: string,
  latestByApp: ReadonlyMap<string, string>,
  override?: Severity,
): Severity {
  if (override) return override;
  const m = /(?:^|[\\/])([a-z0-9-]+)_versioned_docs[\\/]version-([^\\/]+)[\\/]/.exec(
    sourceFilePath,
  );
  if (!m) return 'throw';
  return latestByApp.get(m[1]) === m[2] ? 'throw' : 'warn';
}

export function makeBrokenHook(
  kind: 'link' | 'image',
  latestByApp: ReadonlyMap<string, string>,
  override?: Severity,
) {
  return ({ sourceFilePath, url }: { sourceFilePath: string; url: string }): void => {
    const severity = brokenLinkSeverity(sourceFilePath, latestByApp, override);
    const msg = `Broken Markdown ${kind} "${url}" in ${sourceFilePath}`;
    if (severity === 'throw') throw new Error(msg);
    if (severity === 'warn') console.warn(`[WARNING] ${msg}`);
    if (severity === 'log') console.log(msg);
  };
}
