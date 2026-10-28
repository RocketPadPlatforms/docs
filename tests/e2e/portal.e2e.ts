import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addRelease,
  appAFiles,
  appBFiles,
  appCFiles,
  appDFiles,
  appDGoodFiles,
  createRepo,
  moveTag,
} from '../helpers/fixtures';
import { cleanEnv, copySite, REPO, type Run, run, serve } from './helpers';

const ORG = 'RocketPadPlatforms';
const app = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: id.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  description: `${id} description`,
  repo: `${ORG}/${id}`,
  docsPath: 'docs',
  sidebarFile: 'docs/sidebars.json',
  ...extra,
});

let work: string;
let fx: string;

const read = (site: string, rel: string) => readFileSync(join(site, rel), 'utf8');
const readJson = (site: string, rel: string) => JSON.parse(read(site, rel));

async function makeSite(name: string, apps: unknown[]) {
  const site = join(work, name);
  await copySite(site);
  writeFileSync(join(site, 'docs-sources.json'), JSON.stringify({ apps }, null, 2));
  return site;
}

const env = (extra: Record<string, string> = {}) =>
  cleanEnv({ DOCS_GIT_BASE: `file://${fx}`, ...extra });
const step = (site: string, cmd: string, args: string[], extra: Record<string, string> = {}) =>
  run(cmd, args, site, env(extra));

/** sync -> fetch -> prepare, each of which must succeed */
async function prepareSite(site: string) {
  for (const [cmd, args] of [
    ['tsx', ['scripts/sync-versions.ts', '--provider', 'local-git']],
    ['tsx', ['scripts/fetch-docs.ts']],
    ['tsx', ['scripts/prepare-docs.ts']],
  ] as const) {
    const r = await step(site, cmd, [...args]);
    expect(r.code, `${cmd} ${args.join(' ')}\n${r.out}`).toBe(0);
  }
}

const build = (site: string, outDir = 'build', extra: Record<string, string> = {}) =>
  step(site, 'docusaurus', ['build', '--out-dir', outDir], extra);

async function buildOk(site: string, outDir = 'build', extra: Record<string, string> = {}) {
  const r = await build(site, outDir, extra);
  expect(r.code, r.out).toBe(0);
  return r;
}

let siteA: string;
let siteB: string;
let browser: Browser | undefined;
const servers: { close: () => Promise<void> }[] = [];

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'docs-e2e-'));
  fx = join(work, 'fixtures');
  mkdirSync(fx);
  await createRepo(fx, `${ORG}/app-a`, [
    { tag: 'v0.1.0', files: appAFiles('0.1.0') },
    { tag: 'v0.2.0', files: appAFiles('0.2.0'), annotated: true },
  ]);
  await createRepo(fx, `${ORG}/app-b`, [
    { tag: 'v0.1.0', files: appBFiles('0.1.0') },
    { tag: 'v0.2.0', files: appBFiles('0.2.0'), annotated: true },
  ]);
  await createRepo(fx, `${ORG}/app-c`, [
    { tag: 'v0.1.0', files: appCFiles() },
    { tag: 'v0.2.0', files: appCFiles() },
  ]);

  siteA = await makeSite('site-a', [app('app-a'), app('app-b'), app('app-c')]);
  siteB = await makeSite('site-b', [app('app-a', { exclude: ['0.1.0'] }), app('app-b')]);
  await prepareSite(siteA);
  await prepareSite(siteB);
  await buildOk(siteA);
  await buildOk(siteB);

  if (!process.env.E2E_SKIP_BROWSER) {
    browser = await chromium.launch({
      executablePath: process.env.E2E_CHROMIUM || undefined,
      args: ['--no-sandbox'],
    });
  }
});

afterAll(async () => {
  await browser?.close();
  for (const s of servers) await s.close();
  if (!process.env.E2E_KEEP) rmSync(work, { recursive: true, force: true });
});

async function open(site: string, dir = 'build') {
  const s = await serve(join(site, dir));
  servers.push(s);
  return s.url;
}

describe('1. sync -> fetch -> prepare -> build from a clean copy', () => {
  it('locks two versions per app, newest first, without a v prefix', () => {
    const lock = readJson(siteA, 'docs-versions.lock.json');
    expect(lock.apps['app-a'].versions.map((v: { version: string }) => v.version)).toEqual([
      '0.2.0',
      '0.1.0',
    ]);
    expect(lock.apps['app-a'].versions[0].tag).toBe('v0.2.0');
  });

  it('generated the Docusaurus versioned layout', () => {
    expect(readJson(siteA, 'app-a_versions.json')).toEqual(['0.2.0', '0.1.0']);
    expect(existsSync(join(siteA, 'app-a_versioned_sidebars/version-0.1.0-sidebars.json'))).toBe(
      true,
    );
  });
});

describe('2. URL layout and redirects', () => {
  it('every version has real pages; the latest is unversioned and no path has a v prefix', () => {
    for (const p of [
      'index.html',
      'app-a/index.html',
      'app-a/guide/index.html',
      'app-a/new-feature/index.html',
      'app-a/0.1.0/index.html',
      'app-a/0.1.0/guide/index.html',
      'app-a/0.1.0/only-in-old/index.html',
      'app-b/index.html',
      'app-b/usage/index.html',
      'app-b/0.1.0/usage/index.html',
    ]) {
      expect(existsSync(join(siteA, 'build', p)), p).toBe(true);
    }
    expect(existsSync(join(siteA, 'build/app-a/v0.1.0'))).toBe(false);
    expect(existsSync(join(siteA, 'build/app-a/0.2.0'))).toBe(false);
  });

  it('a version without a root doc gets a static redirect to its first sidebar doc', () => {
    for (const root of ['app-c/index.html', 'app-c/0.1.0/index.html']) {
      const html = read(siteA, `build/${root}`);
      expect(html).toContain('http-equiv="refresh"');
      expect(html).toContain('noindex');
      expect(html).toMatch(
        /rel="canonical" href="https:\/\/docs\.rpp\.gmbh\/app-c\/(0\.1\.0\/)?guide\/"/,
      );
    }
    expect(existsSync(join(siteA, 'build/app-c/guide/index.html'))).toBe(true);
  });

  it('the build fails for a version without any start page', async () => {
    const fail = await makeSite('site-d', [app('app-d')]);
    await createRepo(fx, `${ORG}/app-d`, [
      { tag: 'v0.1.0', files: appDFiles() },
      { tag: 'v0.2.0', files: appDGoodFiles() },
    ]);
    await prepareSite(fail);
    const r: Run = await build(fail);
    expect(r.code).not.toBe(0);
    // our own guard names the version; Docusaurus' docSidebar check can fire first
    expect(r.out).toMatch(/app-d@0\.1\.0: no start page|doesn't have anything to be linked to/);
  });

  it('post-build checks pass (sitemap, metadata, size)', async () => {
    for (const script of ['scripts/check-build.ts', 'scripts/check-size.ts']) {
      const r = await step(siteA, 'tsx', [script]);
      expect(r.code, r.out).toBe(0);
    }
    const sitemap = read(siteA, 'build/sitemap.xml');
    expect(sitemap).toContain('https://docs.rpp.gmbh/app-a/guide/');
    expect(sitemap).not.toContain('/0.1.0/');
    expect(sitemap).not.toContain('https://docs.rpp.gmbh/app-c/</loc>'); // the redirect root is not listed
  });
});

describe('5. banners and noindex', () => {
  it('older versions carry the unmaintained banner and noindex, the latest neither', () => {
    const old = read(siteA, 'build/app-a/0.1.0/guide/index.html');
    const latest = read(siteA, 'build/app-a/guide/index.html');
    expect(old).toContain('theme-doc-version-banner');
    expect(old).toMatch(/name="?robots"? content="noindex, nofollow"/);
    expect(latest).not.toContain('theme-doc-version-banner');
    expect(latest).not.toContain('noindex');
  });
});

describe('9. the build needs no secrets', () => {
  it('the pipeline ran with a scrubbed environment and fetch logs never show the token', async () => {
    const names = Object.keys(cleanEnv());
    expect(names.filter((n) => /TOKEN|SECRET|KEY|PASSWORD/i.test(n))).toEqual([]);
    const token = 'ghs_e2e_sentinel_token';
    const r = await step(siteA, 'tsx', ['scripts/fetch-docs.ts'], { DOCS_SOURCES_TOKEN: token });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain(token);
  });
});

describe('10. DOCS_ONLY', () => {
  it('a single version of one app', async () => {
    await buildOk(siteA, 'build-one', { DOCS_ONLY: 'app-a@0.2.0' });
    expect(existsSync(join(siteA, 'build-one/app-a/index.html'))).toBe(true);
    expect(existsSync(join(siteA, 'build-one/app-a/0.1.0'))).toBe(false);
    expect(existsSync(join(siteA, 'build-one/app-b'))).toBe(false);
  });

  it('omits an app that is not listed', async () => {
    await buildOk(siteA, 'build-b', { DOCS_ONLY: 'app-b' });
    expect(existsSync(join(siteA, 'build-b/app-b/index.html'))).toBe(true);
    expect(existsSync(join(siteA, 'build-b/app-a'))).toBe(false);
  });
});

describe.skipIf(!!process.env.E2E_SKIP_BROWSER)('3/4/8. browser behaviour', () => {
  const hydrated = (page: import('playwright-core').Page) =>
    page.waitForFunction(() => document.documentElement.dataset.hasHydrated === 'true');
  const visible = (page: import('playwright-core').Page, id: string) =>
    page.locator(`.version-dropdown--${id}`).first().isVisible();

  it('3. dropdowns show only on their own app pages (desktop)', async () => {
    const base = await open(siteA);
    const page = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
    const expectOnly = async (path: string, shown: string | null) => {
      await page.goto(base + path);
      await page.waitForSelector('nav.navbar');
      await hydrated(page);
      for (const id of ['app-a', 'app-b', 'app-c']) {
        expect(await visible(page, id), `${path}: dropdown ${id}`).toBe(id === shown);
      }
    };
    await expectOnly('/', null);
    await expectOnly('/app-a/guide/', 'app-a');
    await expectOnly('/app-a/0.1.0/guide/', 'app-a');
    await expectOnly('/app-b/usage/', 'app-b');
    await page.close();
  });

  it('3. ... and in the mobile menu', async () => {
    const base = await open(siteA);
    const page = await (browser as Browser).newPage({ viewport: { width: 390, height: 844 } });
    const expectOnly = async (path: string, shown: string | null) => {
      await page.goto(base + path);
      await page.waitForSelector('.navbar__toggle');
      await hydrated(page);
      await page.click('.navbar__toggle');
      await page.waitForSelector('.navbar-sidebar--show');
      // on doc pages the menu opens on the doc sidebar; the navbar items are one tap back
      if ((await page.locator('.navbar-sidebar__items--show-secondary').count()) > 0) {
        await page.click('.navbar-sidebar__back');
      }
      for (const id of ['app-a', 'app-b', 'app-c']) {
        const el = page.locator(`.navbar-sidebar .version-dropdown--${id}`).first();
        expect(await el.isVisible(), `${path}: mobile dropdown ${id}`).toBe(id === shown);
      }
    };
    await expectOnly('/', null);
    await expectOnly('/app-a/guide/', 'app-a');
    await expectOnly('/app-b/usage/', 'app-b');
    await page.close();
  });

  it('4. switching versions keeps the doc when it exists there, else lands on the start page', async () => {
    const base = await open(siteA);
    const page = await (browser as Browser).newPage({ viewport: { width: 1280, height: 800 } });
    const target = async (from: string, version: string) => {
      await page.goto(base + from);
      const link = page
        .locator('.navbar__item:has(> .version-dropdown--app-a) .dropdown__menu a', {
          hasText: new RegExp(`^${version}$`),
        })
        .first();
      return link.getAttribute('href');
    };
    expect(await target('/app-a/guide/', '0.1.0')).toBe('/app-a/0.1.0/guide/');
    expect(await target('/app-a/new-feature/', '0.1.0')).toBe('/app-a/0.1.0/');
    expect(await target('/app-a/0.1.0/guide/', '0.2.0')).toBe('/app-a/guide/');
    expect(await target('/app-a/0.1.0/only-in-old/', '0.2.0')).toBe('/app-a/');

    // and a real click
    await page.goto(`${base}/app-a/guide/`);
    await hydrated(page);
    await page.locator('a.version-dropdown--app-a').first().hover();
    await page
      .locator('.navbar__item:has(> .version-dropdown--app-a) .dropdown__menu a', {
        hasText: /^0\.1\.0$/,
      })
      .click();
    await page.waitForURL('**/app-a/0.1.0/guide/');
    await page.close();
  });

  it('8. a retired version redirects to the successor: same sub-path or its start page', async () => {
    const base = await open(siteB);
    const page = await (browser as Browser).newPage();
    await page.goto(`${base}/app-a/0.1.0/guide/`);
    await page.waitForURL('**/app-a/guide/?redirected=1');
    expect(await page.locator('h1').first().textContent()).toContain('Guide');

    await page.goto(`${base}/app-a/0.1.0/only-in-old/`);
    await page.waitForURL('**/app-a/?redirected=1');

    // loop guard: a flagged URL is left alone
    await page.goto(`${base}/app-a/0.1.0/guide/?redirected=1`);
    await page.waitForSelector('text=Page Not Found');
    expect(page.url()).toContain('/app-a/0.1.0/guide/');
    await page.close();
  });
});

describe('7. a moved tag keeps the locked commit, a new tag only adds (6)', () => {
  it('builds the locked content and re-syncs without further changes', async () => {
    const lockBefore = readJson(siteA, 'docs-versions.lock.json');
    await moveTag(fx, `${ORG}/app-a`, 'v0.1.0', {
      'docs/guide.md': '---\nid: guide\n---\n\n# REWRITTEN\n',
    });
    await addRelease(fx, `${ORG}/app-a`, { tag: 'v0.3.0', files: appAFiles('0.2.0') });

    const sync = await step(siteA, 'tsx', ['scripts/sync-versions.ts', '--provider', 'local-git']);
    expect(sync.code, sync.out).toBe(0);
    expect(sync.out).toMatch(/warning: app-a: 0\.1\.0: tag `v0\.1\.0` now points to/);

    const lockAfter = readJson(siteA, 'docs-versions.lock.json');
    const before = lockBefore.apps['app-a'].versions;
    const after = lockAfter.apps['app-a'].versions;
    expect(after.slice(1)).toEqual(before); // only the addition, the moved tag is untouched
    expect(after[0].version).toBe('0.3.0');
    expect(lockAfter.apps['app-b']).toEqual(lockBefore.apps['app-b']);

    const again = await step(siteA, 'tsx', ['scripts/sync-versions.ts', '--provider', 'local-git']);
    expect(again.out).toContain('0.1.0'); // the warning repeats until someone looks at it
    expect(readJson(siteA, 'docs-versions.lock.json')).toEqual(lockAfter);

    for (const [cmd, args] of [
      ['tsx', ['scripts/fetch-docs.ts']],
      ['tsx', ['scripts/prepare-docs.ts']],
    ] as const) {
      const r = await step(siteA, cmd, [...args]);
      expect(r.code, r.out).toBe(0);
    }
    await buildOk(siteA, 'build-moved');
    expect(read(siteA, 'build-moved/app-a/0.1.0/guide/index.html')).not.toContain('REWRITTEN');
    expect(existsSync(join(siteA, 'build-moved/app-a/0.1.0/guide/index.html'))).toBe(true);
    expect(existsSync(join(siteA, 'build-moved/app-a/index.html'))).toBe(true);
    expect(read(siteA, 'build-moved/app-a/index.html')).toContain('Start page of 0.2.0');
  });
});

it('repo root is what the copy was made from', () => {
  expect(existsSync(join(REPO, 'docusaurus.config.ts'))).toBe(true);
});
