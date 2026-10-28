import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkBuild, dirSize, evaluateSize } from './check-build';

describe('size check', () => {
  const MB = 1024 * 1024;
  it('warns above 700 MB and fails above 900 MB', () => {
    expect(evaluateSize(100 * MB).level).toBe('ok');
    expect(evaluateSize(701 * MB).level).toBe('warn');
    expect(evaluateSize(901 * MB).level).toBe('fail');
  });
  it('sums file sizes recursively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'size-'));
    mkdirSync(join(dir, 'a/b'), { recursive: true });
    writeFileSync(join(dir, 'x'), '12345');
    writeFileSync(join(dir, 'a/b/y'), '123');
    expect(dirSize(dir)).toBe(8);
    rmSync(dir, { recursive: true });
  });
});

describe('checkBuild', () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const site = 'https://docs.example.com';
  const page = (path: string, head: string) => {
    const file = join(dir, path, 'index.html');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `<html><head>${head}</head></html>`);
  };
  const ok = (path: string, title = 'T') =>
    `<title>${title}</title><meta name=description content="d"><link rel=canonical href=${site}${path}>`;
  const sitemap = (...paths: string[]) =>
    writeFileSync(
      join(dir, 'sitemap.xml'),
      `<urlset>${paths.map((p) => `<url><loc>${site}${p}</loc></url>`).join('')}</urlset>`,
    );

  it('passes for healthy pages', () => {
    page('/a/', ok('/a/', 'A'));
    sitemap('/a/');
    expect(checkBuild(dir, site)).toEqual({ errors: [], warnings: [], pages: 1 });
  });

  it('flags missing files, noindex, redirect stubs and missing metadata', () => {
    page('/n/', `${ok('/n/')}<meta name=robots content="noindex, nofollow">`);
    page('/r/', `${ok('/r/')}<meta http-equiv=refresh content="0; url=/a/">`);
    page('/m/', '<title>x</title>');
    page('/c/', ok('/other/'));
    sitemap('/gone/', '/n/', '/r/', '/m/', '/c/');
    const { errors } = checkBuild(dir, site);
    const all = errors.join('\n');
    expect(all).toMatch(/\/gone\/.*does not exist/);
    expect(all).toMatch(/\/n\/.*noindex/);
    expect(all).toMatch(/\/r\/.*redirect stub/);
    expect(all).toMatch(/\/m\/.*missing meta description/);
    expect(all).toMatch(/\/m\/.*missing canonical/);
    expect(all).toMatch(/\/c\/.*canonical is/);
  });

  it('warns about duplicate titles', () => {
    page('/a/', ok('/a/', 'Same'));
    page('/b/', ok('/b/', 'Same'));
    sitemap('/a/', '/b/');
    expect(checkBuild(dir, site).warnings.join()).toMatch(/duplicate title "Same"/);
  });

  it('fails without a sitemap', () => {
    rmSync(join(dir, 'sitemap.xml'));
    expect(checkBuild(dir, site).errors).toEqual(['sitemap.xml is missing']);
  });
});
