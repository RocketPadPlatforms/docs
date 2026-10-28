import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_PLUGIN_NAME, type DocsVersion, readDocsVersions } from './docs-content';
import { planRedirects } from './plan';
import { redirectHtml } from './redirect-html';
import { startPage } from './start-pages';
import type { AppData } from './types';

const doc = (id: string, permalink: string, slug = `/${id}`) => ({ id, permalink, slug });

const version = (over: Partial<DocsVersion> = {}): DocsVersion => ({
  name: '0.2.0',
  label: '0.2.0',
  path: '/app-a',
  isLast: true,
  docs: [doc('intro', '/app-a/intro/'), doc('guide', '/app-a/guide/')],
  sidebars: { docs: [{ type: 'doc', id: 'intro' }] },
  ...over,
});

describe('startPage', () => {
  it('prefers the doc served at the version root', () => {
    const v = version({
      docs: [doc('index', '/app-a/', '/'), doc('guide', '/app-a/guide/')],
      sidebars: { docs: [{ type: 'doc', id: 'guide' }] },
    });
    expect(startPage(v)).toBe('/app-a/');
  });

  it('matches the version root regardless of trailing slashes (older versions too)', () => {
    const v = version({
      path: '/app-a/0.1.0',
      docs: [doc('index', '/app-a/0.1.0', '/'), doc('guide', '/app-a/0.1.0/guide/')],
    });
    expect(startPage(v)).toBe('/app-a/0.1.0');
  });

  it('falls back to the first doc of sidebar docs', () => {
    expect(startPage(version())).toBe('/app-a/intro/');
  });

  it('walks categories: a doc link, a generated index, or the first nested doc', () => {
    const byDoc = version({
      sidebars: {
        docs: [{ type: 'category', link: { type: 'doc', id: 'guide' }, items: [] }],
      },
    });
    expect(startPage(byDoc)).toBe('/app-a/guide/');
    const byIndex = version({
      sidebars: {
        docs: [
          { type: 'link', href: 'https://example.com' },
          {
            type: 'category',
            link: { type: 'generated-index', permalink: '/app-a/category/x/' },
            items: [],
          },
        ],
      },
    });
    expect(startPage(byIndex)).toBe('/app-a/category/x/');
    const nested = version({
      sidebars: {
        docs: [{ type: 'category', items: [{ type: 'html' }, { type: 'doc', id: 'guide' }] }],
      },
    });
    expect(startPage(nested)).toBe('/app-a/guide/');
  });

  it('is null without root doc and without a usable docs sidebar', () => {
    expect(startPage(version({ sidebars: {} }))).toBeNull();
    expect(startPage(version({ sidebars: { docs: [{ type: 'link', href: 'x' }] } }))).toBeNull();
    expect(
      startPage(version({ sidebars: { docs: [{ type: 'doc', id: 'unlisted-gone' }] } })),
    ).toBeNull();
  });
});

describe('readDocsVersions (shape of Docusaurus 3.10.2 content)', () => {
  const loaded = (v: Record<string, unknown>) => ({
    [DOCS_PLUGIN_NAME]: { 'app-a': { loadedVersions: [v] } },
  });
  const good = {
    versionName: '0.2.0',
    label: '0.2.0',
    path: '/app-a',
    isLast: true,
    docs: [{ id: 'intro', slug: '/', permalink: '/app-a/', extra: 1 }],
    sidebars: { docs: [{ type: 'doc', id: 'intro' }] },
    drafts: [],
  };

  it('reads versions and ignores extra fields', () => {
    const out = readDocsVersions(loaded(good));
    expect(out.get('app-a')?.[0]).toMatchObject({ name: '0.2.0', path: '/app-a', isLast: true });
  });

  it('is empty when no docs plugin instance exists', () => {
    expect(readDocsVersions({}).size).toBe(0);
  });

  it.each([
    ['renamed versionName', { ...good, versionName: undefined, name: '0.2.0' }],
    ['docs without permalink', { ...good, docs: [{ id: 'a', slug: '/a' }] }],
    ['sidebars as array', { ...good, sidebars: [] }],
    ['missing isLast', { ...good, isLast: undefined }],
  ])('fails loudly when the shape changes: %s', (_n, bad) => {
    expect(() => readDocsVersions(loaded(bad))).toThrow(/docs-content\.ts/);
  });
});

describe('planRedirects', () => {
  const app = (startPage: string | null, basePath = '/app-a', name = '0.2.0'): AppData => ({
    id: 'app-a',
    label: 'A',
    description: 'd',
    latest: name,
    retired: [],
    versions: [{ name, label: name, isLast: true, basePath, startPage }],
  });
  const out = mkdtempSync(join(tmpdir(), 'vr-'));
  const plan = (a: AppData, routes: string[]) =>
    planRedirects({
      apps: [a],
      routesPaths: routes,
      outDir: out,
      siteUrl: 'https://docs.example.com/',
    });

  it('writes nothing when the start page is the version root', () => {
    const r = plan(app('/app-a/'), ['/app-a/', '/app-a/guide/']);
    expect(r.problems).toEqual([]);
    expect(r.writes).toEqual([]);
  });

  it('replaces the soft-404 version root with a redirect to the start page', () => {
    const r = plan(app('/app-a/intro/'), ['/app-a/intro/']);
    expect(r.problems).toEqual([]);
    expect(r.writes).toHaveLength(1);
    expect(r.writes[0].file).toBe(join(out, 'app-a/index.html'));
    expect(r.writes[0].html).toContain(
      '<link rel="canonical" href="https://docs.example.com/app-a/intro/">',
    );
    expect(r.writes[0].html).toContain('url=/app-a/intro/');
    expect(r.writes[0].html).toContain('noindex');
  });

  it('fails when the redirect target is not a built route', () => {
    const r = plan(app('/app-a/intro/'), ['/app-a/other/']);
    expect(r.problems.join()).toMatch(/app-a@0\.2\.0.*not a built route/);
  });

  it('fails when a version has no start page at all', () => {
    expect(plan(app(null), []).problems.join()).toMatch(/no start page/);
  });

  it('refuses to write outside the build output', () => {
    const r = plan(app('/x/', '/../../evil'), ['/x/']);
    expect(r.problems.join()).toMatch(/outside the build output/);
  });

  it('refuses two redirects for the same file', () => {
    const a = app('/app-a/intro/');
    a.versions.push({ ...a.versions[0], name: '0.1.0', isLast: false });
    expect(plan(a, ['/app-a/intro/']).problems.join()).toMatch(/two redirects/);
  });

  it('cleans up', () => rmSync(out, { recursive: true, force: true }));
});

describe('redirectHtml', () => {
  it('escapes the target in attributes and in the script', () => {
    const html = redirectHtml('/a"b</script>/', 'https://x.test/a/');
    expect(html).not.toContain('</script>/');
    expect(html).toContain('&quot;');
  });
});
