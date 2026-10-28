import type { Options as DocsOptions } from '@docusaurus/plugin-content-docs';
import type { AppConfig } from '../scripts/lib/config';
import type { DocsIndex } from '../scripts/lib/docs-index';

export const CURRENT = 'current';

export interface OnlyFilter {
  /** the app appears in DOCS_ONLY at all */
  mentions(id: string): boolean;
  allows(id: string, version: string): boolean;
}

/**
 * DOCS_ONLY="app-a@0.2.0,app-b": `app` = everything of that app (released versions and,
 * in local mode, current), `app@v` = that version, `app@current` = only the local working copy.
 */
export function parseOnly(spec: string | undefined): OnlyFilter | null {
  if (!spec?.trim()) return null;
  const rules = new Map<string, { all: boolean; versions: Set<string> }>();
  for (const raw of spec.split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    const [id, version] = entry.split('@');
    const rule = rules.get(id) ?? { all: false, versions: new Set<string>() };
    if (version) rule.versions.add(version);
    else rule.all = true;
    rules.set(id, rule);
  }
  return {
    mentions: (id) => rules.has(id),
    allows: (id, version) => {
      const rule = rules.get(id);
      return !!rule && (rule.all || rule.versions.has(version));
    },
  };
}

/** LOCAL_DOCS="app-a=../app-a/docs,app-b=/abs/path" */
export function parseLocal(spec: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of (spec ?? '').split(',')) {
    const entry = raw.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    if (eq < 1 || eq === entry.length - 1) {
      throw new Error(`LOCAL_DOCS entry "${entry}" must look like <app-id>=<path>`);
    }
    out.set(entry.slice(0, eq), entry.slice(eq + 1));
  }
  return out;
}

export interface Instance {
  id: string;
  label: string;
  /** versions included, newest first, 'current' (local working copy) first of all */
  versions: string[];
  lastVersion: string;
  options: DocsOptions;
}

export interface InstanceInput {
  apps: AppConfig[];
  index: DocsIndex;
  only?: OnlyFilter | null;
  local?: Map<string, string>;
  /** sidebar file prepared for an app's working copy, by app id */
  localSidebars?: Map<string, string>;
}

export function buildInstances(input: InstanceInput): {
  instances: Instance[];
  warnings: string[];
} {
  const { apps, index, only = null, local = new Map(), localSidebars = new Map() } = input;
  const warnings: string[] = [];

  for (const id of local.keys()) {
    if (!apps.some((a) => a.id === id)) throw new Error(`LOCAL_DOCS: unknown app "${id}"`);
  }
  if (only) {
    const hit = new Set<string>();
    for (const app of apps) {
      const released = index.apps.find((a) => a.id === app.id)?.versions ?? [];
      for (const v of [...released, CURRENT]) if (only.allows(app.id, v)) hit.add(app.id);
    }
    for (const app of apps) {
      if (only.mentions(app.id) && !hit.has(app.id)) {
        warnings.push(`DOCS_ONLY names ${app.id} but none of its versions matched`);
      }
    }
  }

  const instances: Instance[] = [];
  for (const app of apps) {
    const entry = index.apps.find((a) => a.id === app.id);
    const localPath = local.get(app.id);
    const released = (entry?.versions ?? []).filter((v) => !only || only.allows(app.id, v));
    const withCurrent = !!localPath && (!only || only.allows(app.id, CURRENT));
    const versions = [...(withCurrent ? [CURRENT] : []), ...released];
    if (versions.length === 0) continue; // nothing to show: omit the instance entirely

    const lastVersion = released[0] ?? CURRENT;
    const className = `docs-app-${app.id}`;
    const versionOptions: NonNullable<DocsOptions['versions']> = {};
    for (const v of released) {
      const isLast = v === lastVersion;
      versionOptions[v] = isLast
        ? { label: v, banner: 'none', noIndex: false, className }
        : { label: v, path: v, banner: 'unmaintained', noIndex: true, className };
    }
    if (withCurrent) {
      versionOptions[CURRENT] = {
        label: 'local (unreleased)',
        ...(lastVersion === CURRENT ? {} : { path: 'local' }),
        banner: 'unreleased',
        noIndex: true,
        className,
      };
    }

    const options: DocsOptions = {
      id: app.id,
      routeBasePath: app.id,
      // not needed for released versions only: Docusaurus never reads the default docs dir then
      ...(localPath ? { path: localPath } : {}),
      includeCurrentVersion: withCurrent,
      lastVersion,
      onlyIncludeVersions: versions,
      versions: versionOptions,
      // Generated files have no git history, so these would always be empty.
      showLastUpdateTime: false,
      showLastUpdateAuthor: false,
      editUrl: ({ version, docPath }) =>
        version === lastVersion && version !== CURRENT && entry
          ? `https://github.com/${entry.repo}/edit/${entry.defaultBranch}/${entry.docsPath}/${docPath}`
          : undefined,
    };
    const sidebar = localSidebars.get(app.id);
    if (withCurrent && sidebar) options.sidebarPath = sidebar;

    instances.push({ id: app.id, label: app.label, versions, lastVersion, options });
  }
  return { instances, warnings };
}

/** Per app: a link to its docs and its version dropdown (shown only on that app's pages by CSS). */
export function navbarItems(instances: Instance[]) {
  return instances.flatMap((i) => [
    {
      type: 'docSidebar' as const,
      sidebarId: 'docs',
      docsPluginId: i.id,
      label: i.label,
      position: 'left' as const,
    },
    {
      type: 'docsVersionDropdown' as const,
      docsPluginId: i.id,
      position: 'left' as const,
      className: `version-dropdown version-dropdown--${i.id}`,
    },
  ]);
}

/**
 * Dropdowns are hidden unless the page's <html> carries docs-app-<id> (set by the
 * docs plugin through the version className).
 */
export function dropdownCss(ids: string[]): string {
  return ids
    .map((id) => {
      const off = `html:not(.docs-app-${id})`;
      // Docusaurus puts the className on the toggle link: hide it and the item around it
      // (desktop: div.navbar__item, mobile menu: li.menu__list-item)
      return `${off} .version-dropdown--${id},${off} :is(div,li):has(>.version-dropdown--${id}){display:none}`;
    })
    .join('');
}
