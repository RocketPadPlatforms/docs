import { describe, expect, it, vi } from 'vitest';
import { brokenLinkSeverity, makeBrokenHook, parseSeverity } from './broken-links';

const latest = new Map([['app-a', '0.2.0']]);

describe('brokenLinkSeverity', () => {
  it('throws for the latest version, warns for older ones', () => {
    expect(brokenLinkSeverity('app-a_versioned_docs/version-0.2.0/guide.md', latest)).toBe('throw');
    expect(brokenLinkSeverity('app-a_versioned_docs/version-0.1.0/guide.md', latest)).toBe('warn');
  });
  it('treats anything else as a local working copy and throws', () => {
    expect(brokenLinkSeverity('../app-a/docs/guide.md', latest)).toBe('throw');
  });
  it('honours the override', () => {
    expect(brokenLinkSeverity('app-a_versioned_docs/version-0.2.0/x.md', latest, 'warn')).toBe(
      'warn',
    );
  });
});

describe('makeBrokenHook', () => {
  it('throws or warns without altering the link', () => {
    const hook = makeBrokenHook('link', latest);
    expect(() =>
      hook({ sourceFilePath: 'app-a_versioned_docs/version-0.2.0/a.md', url: './x.md' }),
    ).toThrow(/Broken Markdown link "\.\/x\.md"/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      hook({ sourceFilePath: 'app-a_versioned_docs/version-0.1.0/a.md', url: './x.md' }),
    ).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('parseSeverity', () => {
  it('validates the env value', () => {
    expect(parseSeverity(undefined)).toBeUndefined();
    expect(parseSeverity('warn')).toBe('warn');
    expect(() => parseSeverity('nope')).toThrow(/DOCS_ON_BROKEN_LINKS/);
  });
});
