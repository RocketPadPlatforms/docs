import type { AppData } from '@site/plugins/version-routing/types';
import { describe, expect, it } from 'vitest';
import { resolveRedirect } from './retired-redirect';

const app: AppData = {
  id: 'app-a',
  label: 'A',
  description: 'd',
  latest: '0.2.0',
  retired: [
    { version: '0.1.0', successor: '0.1.1' },
    { version: '0.0.9', successor: '0.2.0' },
  ],
  versions: [
    { name: '0.2.0', label: '0.2.0', isLast: true, basePath: '/app-a', startPage: '/app-a/' },
    {
      name: '0.1.1',
      label: '0.1.1',
      isLast: false,
      basePath: '/app-a/0.1.1',
      startPage: '/app-a/0.1.1/intro/',
    },
  ],
};
const existing = new Set(['/app-a/0.1.1/guide', '/app-a/guide']);
const docExists = (p: string) => existing.has(p);

describe('resolveRedirect', () => {
  it('keeps the sub-path when the doc exists in the successor', () => {
    expect(resolveRedirect('/app-a/0.1.0/guide/', [app], docExists)).toBe('/app-a/0.1.1/guide/');
  });

  it('falls back to the successor start page when the sub-path is gone', () => {
    expect(resolveRedirect('/app-a/0.1.0/only-in-old/', [app], docExists)).toBe(
      '/app-a/0.1.1/intro/',
    );
  });

  it('sends the retired version root to the successor start page', () => {
    expect(resolveRedirect('/app-a/0.1.0/', [app], docExists)).toBe('/app-a/0.1.1/intro/');
    expect(resolveRedirect('/app-a/0.1.0', [app], docExists)).toBe('/app-a/0.1.1/intro/');
  });

  it('targets the unversioned latest when it is the successor', () => {
    expect(resolveRedirect('/app-a/0.0.9/guide/', [app], docExists)).toBe('/app-a/guide/');
    expect(resolveRedirect('/app-a/0.0.9/nope/', [app], docExists)).toBe('/app-a/');
  });

  it('redirects a version root that has no doc of its own', () => {
    expect(resolveRedirect('/app-a/0.1.1/', [app], docExists)).toBe('/app-a/0.1.1/intro/');
    // the latest root is its own start page: nothing to do
    expect(resolveRedirect('/app-a/', [app], docExists)).toBeNull();
  });

  it('does not match prefixes of other versions or apps, and ignores unknown paths', () => {
    expect(resolveRedirect('/app-a/0.1.00/guide/', [app], docExists)).toBeNull();
    expect(resolveRedirect('/other/0.1.0/guide/', [app], docExists)).toBeNull();
    expect(resolveRedirect('/nope/', [app], docExists)).toBeNull();
  });

  it('ignores retired entries whose successor is not part of the build', () => {
    const only = { ...app, versions: [app.versions[0]] };
    expect(resolveRedirect('/app-a/0.1.0/guide/', [only], docExists)).toBeNull();
  });
});
