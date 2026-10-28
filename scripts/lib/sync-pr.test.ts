import { describe, expect, it } from 'vitest';
import { openSyncPr, SYNC_BRANCH } from './sync-pr';

type Call = { method: string; path: string; body?: Record<string, unknown> };

function fakeGitHub(opts: { branchExists: boolean; openPr: boolean; fileExists?: boolean }) {
  const calls: Call[] = [];
  const impl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const path = url.pathname + url.search;
    const method = init.method ?? 'GET';
    calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.pathname === '/graphql') return json({ data: {} });
    if (method === 'GET' && path === '/repos/o/docs') return json({ default_branch: 'main' });
    if (path === '/repos/o/docs/git/ref/heads/main') return json({ object: { sha: 'base' } });
    if (path === `/repos/o/docs/git/ref/heads/${SYNC_BRANCH}`) {
      return opts.branchExists ? json({ object: { sha: 'old' } }) : json({}, 404);
    }
    if (path.startsWith('/repos/o/docs/contents/') && method === 'GET') {
      return opts.fileExists === false ? json({}, 404) : json({ sha: 'blob1' });
    }
    if (method === 'GET' && url.pathname === '/repos/o/docs/pulls') {
      return json(opts.openPr ? [{ number: 7, node_id: 'N7' }] : []);
    }
    if (method === 'POST' && url.pathname === '/repos/o/docs/pulls')
      return json({ number: 9, node_id: 'N9' });
    if (method === 'PATCH' && url.pathname === '/repos/o/docs/pulls/7')
      return json({ number: 7, node_id: 'N7' });
    return json({});
  }) as typeof fetch;
  return { calls, impl };
}

const base = {
  repo: 'o/docs',
  token: 'secret-token',
  lockContent: '{"apps":{}}\n',
  body: 'summary',
};

describe('openSyncPr', () => {
  it('creates the branch and the PR when none exist', async () => {
    const gh = fakeGitHub({ branchExists: false, openPr: false });
    const res = await openSyncPr({ ...base, autoMerge: false, fetch: gh.impl, log: () => {} });
    expect(res).toEqual({ number: 9, created: true });
    const seq = gh.calls.map((c) => `${c.method} ${c.path.split('?')[0]}`);
    expect(seq).toContain('POST /repos/o/docs/git/refs');
    expect(seq).not.toContain(`PATCH /repos/o/docs/git/refs/heads/${SYNC_BRANCH}`);
    const put = gh.calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({ branch: SYNC_BRANCH, sha: 'blob1' });
    expect(Buffer.from(String(put?.body?.content), 'base64').toString()).toBe(base.lockContent);
    expect(gh.calls.some((c) => c.path === '/graphql')).toBe(false);
  });

  it('resets the branch and updates the existing PR instead of opening another', async () => {
    const gh = fakeGitHub({ branchExists: true, openPr: true });
    const res = await openSyncPr({ ...base, autoMerge: false, fetch: gh.impl, log: () => {} });
    expect(res).toEqual({ number: 7, created: false });
    const patch = gh.calls.find((c) => c.method === 'PATCH' && c.path.includes('/git/refs/'));
    expect(patch?.body).toEqual({ sha: 'base', force: true });
    expect(gh.calls.some((c) => c.method === 'POST' && c.path.includes('/pulls'))).toBe(false);
  });

  it('enables auto-merge on the PR when asked, and survives a refusal', async () => {
    const gh = fakeGitHub({ branchExists: true, openPr: true });
    const logs: string[] = [];
    await openSyncPr({ ...base, autoMerge: true, fetch: gh.impl, log: (m) => logs.push(m) });
    const gql = gh.calls.find((c) => c.path === '/graphql');
    expect(gql?.body?.variables).toEqual({ id: 'N7' });
    expect(logs.join()).toContain('Auto-merge enabled');

    const refusing = (async (input: string, init?: RequestInit) =>
      new URL(input).pathname === '/graphql'
        ? new Response(JSON.stringify({ errors: [{ message: 'Auto merge is not allowed' }] }))
        : gh.impl(input, init)) as typeof fetch;
    const out: string[] = [];
    await openSyncPr({ ...base, autoMerge: true, fetch: refusing, log: (m) => out.push(m) });
    expect(out.join()).toContain(
      '::warning::could not enable auto-merge: Auto merge is not allowed',
    );
  });

  it('works when the lock file does not exist on the default branch yet', async () => {
    const gh = fakeGitHub({ branchExists: false, openPr: false, fileExists: false });
    await openSyncPr({ ...base, autoMerge: false, fetch: gh.impl, log: () => {} });
    expect(gh.calls.find((c) => c.method === 'PUT')?.body).not.toHaveProperty('sha');
  });

  it('never puts the token in a URL or body', async () => {
    const gh = fakeGitHub({ branchExists: false, openPr: false });
    await openSyncPr({ ...base, autoMerge: true, fetch: gh.impl, log: () => {} });
    expect(JSON.stringify(gh.calls)).not.toContain('secret-token');
  });
});
