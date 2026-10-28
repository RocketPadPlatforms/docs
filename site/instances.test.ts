import { describe, expect, it } from 'vitest';
import { parseSources } from '../scripts/lib/config';
import type { DocsIndex } from '../scripts/lib/docs-index';
import { buildInstances, dropdownCss, navbarItems, parseLocal, parseOnly } from './instances';

const apps = parseSources({
  apps: ['app-a', 'app-b'].map((id) => ({
    id,
    label: id.toUpperCase(),
    description: 'd',
    repo: `o/${id}`,
    docsPath: 'docs',
  })),
}).apps;

const entry = (id: string, versions: string[]) => ({
  id,
  label: id,
  description: 'd',
  repo: `o/${id}`,
  docsPath: 'docs',
  defaultBranch: 'main',
  latest: versions[0],
  versions,
  retired: [],
});
const index: DocsIndex = { apps: [entry('app-a', ['0.2.0', '0.1.0']), entry('app-b', ['0.1.0'])] };

describe('buildInstances', () => {
  it('makes one instance per app with the latest unversioned and older versions pathed', () => {
    const { instances } = buildInstances({ apps, index });
    const a = instances[0].options;
    expect(instances.map((i) => i.id)).toEqual(['app-a', 'app-b']);
    expect(a).toMatchObject({
      id: 'app-a',
      routeBasePath: 'app-a',
      includeCurrentVersion: false,
      lastVersion: '0.2.0',
      onlyIncludeVersions: ['0.2.0', '0.1.0'],
      showLastUpdateTime: false,
      showLastUpdateAuthor: false,
    });
    expect(a.versions?.['0.2.0']).toEqual({
      label: '0.2.0',
      banner: 'none',
      noIndex: false,
      className: 'docs-app-app-a',
    });
    expect(a.versions?.['0.1.0']).toEqual({
      label: '0.1.0',
      path: '0.1.0',
      banner: 'unmaintained',
      noIndex: true,
      className: 'docs-app-app-a',
    });
  });

  it('only the latest version gets an edit link', () => {
    const edit = buildInstances({ apps, index }).instances[0].options.editUrl as (p: {
      version: string;
      docPath: string;
    }) => string | undefined;
    expect(edit({ version: '0.2.0', docPath: 'guide.md' })).toBe(
      'https://github.com/o/app-a/edit/main/docs/guide.md',
    );
    expect(edit({ version: '0.1.0', docPath: 'guide.md' })).toBeUndefined();
  });

  it('DOCS_ONLY: single version recomputes lastVersion', () => {
    const { instances } = buildInstances({ apps, index, only: parseOnly('app-a@0.1.0') });
    expect(instances.map((i) => i.id)).toEqual(['app-a']);
    expect(instances[0].lastVersion).toBe('0.1.0');
    expect(instances[0].options.onlyIncludeVersions).toEqual(['0.1.0']);
    // the only version is the latest now: unversioned, no banner, indexable
    expect(instances[0].options.versions?.['0.1.0']).toMatchObject({
      banner: 'none',
      noIndex: false,
    });
    expect(instances[0].options.versions?.['0.1.0']).not.toHaveProperty('path');
  });

  it('DOCS_ONLY: omits apps that are not listed, and warns about misses', () => {
    const one = buildInstances({ apps, index, only: parseOnly('app-b') });
    expect(one.instances.map((i) => i.id)).toEqual(['app-b']);
    const miss = buildInstances({ apps, index, only: parseOnly('app-a@9.9.9,app-b') });
    expect(miss.instances.map((i) => i.id)).toEqual(['app-b']);
    expect(miss.warnings.join()).toMatch(/app-a/);
  });

  it('omits apps without releases', () => {
    const { instances } = buildInstances({ apps, index: { apps: [entry('app-b', ['1.0.0'])] } });
    expect(instances.map((i) => i.id)).toEqual(['app-b']);
  });

  it('local mode adds current next to released versions', () => {
    const { instances } = buildInstances({
      apps,
      index,
      local: parseLocal('app-a=../app-a/docs'),
      localSidebars: new Map([['app-a', 'generated/local-sidebars/app-a.json']]),
    });
    const o = instances[0].options;
    expect(o).toMatchObject({
      path: '../app-a/docs',
      includeCurrentVersion: true,
      lastVersion: '0.2.0',
      sidebarPath: 'generated/local-sidebars/app-a.json',
    });
    expect(o.versions?.current).toEqual({
      label: 'local (unreleased)',
      path: 'local',
      banner: 'unreleased',
      noIndex: true,
      className: 'docs-app-app-a',
    });
    expect(instances[0].versions).toEqual(['current', '0.2.0', '0.1.0']);
  });

  it('app@current builds only the working copy and serves it at the app root', () => {
    const { instances } = buildInstances({
      apps,
      index: { apps: [] },
      only: parseOnly('app-a@current'),
      local: parseLocal('app-a=../x'),
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].lastVersion).toBe('current');
    expect(instances[0].options.onlyIncludeVersions).toEqual(['current']);
    expect(instances[0].options.versions?.current).not.toHaveProperty('path');
  });

  it('rejects a LOCAL_DOCS entry for an unknown app', () => {
    expect(() => buildInstances({ apps, index, local: parseLocal('nope=../x') })).toThrow(
      /unknown app/,
    );
  });
});

describe('parsers', () => {
  it('parseOnly handles empty input and several versions per app', () => {
    expect(parseOnly('')).toBeNull();
    expect(parseOnly(undefined)).toBeNull();
    const f = parseOnly('a@1.0.0, a@2.0.0 ,b');
    expect(f?.allows('a', '2.0.0')).toBe(true);
    expect(f?.allows('a', '3.0.0')).toBe(false);
    expect(f?.allows('b', 'anything')).toBe(true);
    expect(f?.mentions('c')).toBe(false);
  });
  it('parseLocal validates entries', () => {
    expect(parseLocal('a=../a/docs').get('a')).toBe('../a/docs');
    expect(() => parseLocal('a')).toThrow(/<app-id>=<path>/);
    expect(() => parseLocal('a=')).toThrow();
  });
});

describe('navbar + css', () => {
  it('emits a sidebar link and a scoped dropdown per instance', () => {
    const items = navbarItems(buildInstances({ apps, index }).instances);
    expect(items).toHaveLength(4);
    expect(items[1]).toMatchObject({
      type: 'docsVersionDropdown',
      docsPluginId: 'app-a',
      className: 'version-dropdown version-dropdown--app-a',
    });
  });
  it('hides every dropdown unless its app class is on <html>', () => {
    const css = dropdownCss(['app-a']);
    expect(css).toContain('html:not(.docs-app-app-a) .version-dropdown--app-a');
    expect(css).toContain(':is(div,li):has(>.version-dropdown--app-a)');
  });
});
