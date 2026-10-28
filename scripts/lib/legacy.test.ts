import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openLegacy } from './legacy';

describe('legacy-redirects.json', () => {
  const raw = JSON.parse(readFileSync('legacy-redirects.json', 'utf8')) as Record<string, unknown>;

  it('lists every old URL as an absolute path', () => {
    expect(Object.keys(raw).length).toBeGreaterThan(0);
    for (const key of Object.keys(raw)) expect(key).toMatch(/^\/docs(\/|$)/);
  });

  it('openLegacy returns only undecided entries', () => {
    expect(openLegacy({ '/a': null, '/b': false, '/c': '/x/' })).toEqual(['/a']);
  });
});
