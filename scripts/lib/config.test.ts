import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseSources } from './config';
import { serializeLock, validateVersionName } from './lock';

const base = {
  id: 'app-a',
  label: 'A',
  description: 'd',
  repo: 'o/app-a',
  docsPath: 'docs',
};

describe('docs-sources.json', () => {
  it('the committed file is valid', () => {
    expect(() => parseSources(JSON.parse(readFileSync('docs-sources.json', 'utf8')))).not.toThrow();
  });

  it('applies defaults', () => {
    const [app] = parseSources({ apps: [base] }).apps;
    expect(app).toMatchObject({ source: 'releases', retention: 'all', exclude: [] });
  });

  it.each([
    ['uppercase id', { ...base, id: 'App' }],
    ['reserved id', { ...base, id: 'assets' }],
    ['path escape', { ...base, docsPath: '../x' }],
    ['absolute path', { ...base, docsPath: '/etc' }],
    ['pattern without group', { ...base, tagPattern: '^v\\d+$' }],
    ['broken pattern', { ...base, tagPattern: '(' }],
    ['unknown key', { ...base, nope: 1 }],
  ])('rejects %s', (_n, app) => {
    expect(() => parseSources({ apps: [app] })).toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() => parseSources({ apps: [base, base] })).toThrow(/unique/);
  });
});

describe('validateVersionName', () => {
  it.each(['0.1.0', '10.20.30', '1.0.0-rc.1'])('accepts %s', (v) => {
    expect(validateVersionName(v)).toBeNull();
  });
  it.each(['v1.0.0', 'a/b', 'a\\b', 'current', '..', '1.0', `1.0.0-${'x'.repeat(40)}`])(
    'rejects %s',
    (v) => {
      expect(validateVersionName(v)).not.toBeNull();
    },
  );
});

describe('serializeLock', () => {
  const sha = 'a'.repeat(40);
  const v = (version: string) => ({ version, tag: `v${version}`, commit: sha, publishedAt: 'x' });

  it('sorts versions semver-descending and ends with a newline', () => {
    const out = serializeLock({
      apps: {
        b: { defaultBranch: 'main', versions: [], retired: [] },
        a: {
          defaultBranch: 'main',
          versions: [v('0.2.0'), v('0.10.0'), v('0.9.0')],
          retired: [],
        },
      },
    });
    expect(out.endsWith('}\n')).toBe(true);
    expect(out.indexOf('"a"')).toBeLessThan(out.indexOf('"b"'));
    expect(out.indexOf('0.10.0')).toBeLessThan(out.indexOf('0.9.0'));
    expect(out.indexOf('0.9.0')).toBeLessThan(out.indexOf('"0.2.0"'));
  });
});
