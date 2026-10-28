import { describe, expect, it } from 'vitest';
import { GitHubProvider } from './github';

type Handler = (url: URL, headers: Headers) => Response;

function setup(handler: Handler, extra: ConstructorParameters<typeof GitHubProvider>[0] = {}) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const provider = new GitHubProvider({
    token: 'sekret-token',
    now: () => 1_000_000,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetch: (async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      calls.push(url.pathname + url.search);
      return handler(url, new Headers(init?.headers));
    }) as typeof fetch,
    ...extra,
  });
  return { provider, calls, sleeps };
}

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

describe('GitHubProvider', () => {
  it('follows pagination and drops drafts and prereleases', async () => {
    const { provider, calls } = setup((url) => {
      if (url.searchParams.get('page') === '2') {
        return json([{ tag_name: 'v3', draft: false, prerelease: false, published_at: 'c' }]);
      }
      return json(
        [
          { tag_name: 'v1', draft: false, prerelease: false, published_at: 'a' },
          { tag_name: 'v2-draft', draft: true, prerelease: false, published_at: null },
          { tag_name: 'v2-rc', draft: false, prerelease: true, published_at: 'b' },
        ],
        { link: '<https://api.github.com/repos/o/r/releases?per_page=100&page=2>; rel="next"' },
      );
    });
    const list = await provider.listCandidates('o/r', 'releases');
    expect(list).toEqual([
      { tag: 'v1', publishedAt: 'a' },
      { tag: 'v3', publishedAt: 'c' },
    ]);
    expect(calls).toHaveLength(2);
  });

  it('unwraps annotated tags through the git refs API (never target_commitish)', async () => {
    const { provider, calls } = setup((url) => {
      if (url.pathname.endsWith('/git/ref/tags/v1.0.0')) {
        return json({ object: { type: 'tag', sha: 'tagobj' } });
      }
      if (url.pathname.endsWith('/git/tags/tagobj')) {
        return json({ object: { type: 'commit', sha: 'c0mm17' } });
      }
      return json({}, {}, 404);
    });
    expect(await provider.resolveCommit('o/r', 'v1.0.0')).toBe('c0mm17');
    expect(calls.join()).not.toMatch(/releases/);
  });

  it('uses lightweight tag commits directly', async () => {
    const { provider } = setup(() => json({ object: { type: 'commit', sha: 'abc' } }));
    expect(await provider.resolveCommit('o/r', 'v1')).toBe('abc');
  });

  it('waits for the primary limit reset and retries', async () => {
    let n = 0;
    const { provider, sleeps } = setup(() =>
      n++ === 0
        ? json(
            { message: 'rate limit' },
            { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1010' },
            403,
          )
        : json({ default_branch: 'main' }),
    );
    expect(await provider.getDefaultBranch('o/r')).toBe('main');
    expect(sleeps).toEqual([11_000]); // reset 10s after "now" + 1s margin
  });

  it('honours retry-after on secondary limits', async () => {
    let n = 0;
    const { provider, sleeps } = setup(() =>
      n++ === 0
        ? json({ message: 'secondary rate limit' }, { 'retry-after': '7' }, 429)
        : json({ default_branch: 'dev' }),
    );
    expect(await provider.getDefaultBranch('o/r')).toBe('dev');
    expect(sleeps).toEqual([7000]);
  });

  it('retries 5xx with backoff and gives up after maxRetries', async () => {
    const { provider, sleeps } = setup(() => json({}, {}, 502), { maxRetries: 2 });
    await expect(provider.getDefaultBranch('o/r')).rejects.toThrow(/502/);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('does not retry a plain 403 permission error and never leaks the token', async () => {
    const { provider, sleeps } = setup(() => json({ message: 'Resource not accessible' }, {}, 403));
    const err = await provider.getDefaultBranch('o/r').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('sekret-token');
    expect(sleeps).toEqual([]);
  });

  it('refuses to wait longer than maxWaitMs', async () => {
    const { provider } = setup(
      () => json({}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '999999' }, 403),
      { maxWaitMs: 60_000 },
    );
    await expect(provider.getDefaultBranch('o/r')).rejects.toThrow(/rate limit/);
  });

  it('sends the token only as an Authorization header', async () => {
    let seen: Headers | undefined;
    const { provider, calls } = setup((_u, h) => {
      seen = h;
      return json({ default_branch: 'main' });
    });
    await provider.getDefaultBranch('o/r');
    expect(seen?.get('authorization')).toBe('Bearer sekret-token');
    expect(calls.join()).not.toContain('sekret');
  });
});
