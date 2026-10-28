export const SYNC_BRANCH = 'bot/docs-version-sync';
export const LOCK_FILE = 'docs-versions.lock.json';
export const PR_TITLE = 'chore(docs): sync released versions';

type Json = Record<string, unknown>;
interface Pr {
  number: number;
  node_id: string;
}

export interface SyncPrOptions {
  /** owner/name of the central repository */
  repo: string;
  /** App installation token (not GITHUB_TOKEN: its events would not trigger pr.yml) */
  token: string;
  lockContent: string;
  body: string;
  autoMerge: boolean;
  fetch?: typeof fetch;
  log?: (message: string) => void;
}

/**
 * Creates or updates the single sync PR. The branch is reset to the default branch on every
 * run and gets exactly one commit (made through the contents API, so GitHub signs it), which
 * keeps the PR equal to "main + the current lock file".
 */
export async function openSyncPr(
  opts: SyncPrOptions,
): Promise<{ number: number; created: boolean }> {
  const f = opts.fetch ?? fetch;
  const log = opts.log ?? console.log;
  const owner = opts.repo.split('/')[0];

  async function api(method: string, path: string, body?: unknown, allow404 = false) {
    const res = await f(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${opts.token}`,
        'x-github-api-version': '2026-03-10',
        'user-agent': 'rpp-docs-sync',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (allow404 && res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub API ${method} ${path} failed: ${res.status}`);
    return res.status === 204 ? null : ((await res.json()) as Json);
  }

  const repoPath = `/repos/${opts.repo}`;
  const { default_branch: base } = (await api('GET', repoPath)) as { default_branch: string };
  const baseRef = (await api('GET', `${repoPath}/git/ref/heads/${base}`)) as {
    object: { sha: string };
  };
  const baseSha = baseRef.object.sha;

  const branchRef = `${repoPath}/git/refs/heads/${SYNC_BRANCH}`;
  if (await api('GET', `${repoPath}/git/ref/heads/${SYNC_BRANCH}`, undefined, true)) {
    await api('PATCH', branchRef, { sha: baseSha, force: true });
  } else {
    await api('POST', `${repoPath}/git/refs`, { ref: `refs/heads/${SYNC_BRANCH}`, sha: baseSha });
  }

  const current = await api(
    'GET',
    `${repoPath}/contents/${LOCK_FILE}?ref=${base}`,
    undefined,
    true,
  );
  await api('PUT', `${repoPath}/contents/${LOCK_FILE}`, {
    message: PR_TITLE,
    content: Buffer.from(opts.lockContent).toString('base64'),
    branch: SYNC_BRANCH,
    ...(current ? { sha: current.sha } : {}),
  });

  const open = (await api(
    'GET',
    `${repoPath}/pulls?state=open&head=${encodeURIComponent(`${owner}:${SYNC_BRANCH}`)}`,
  )) as unknown as { number: number; node_id: string }[];
  let pr: Pr;
  let created = false;
  if (open.length > 0) {
    pr = (await api('PATCH', `${repoPath}/pulls/${open[0].number}`, {
      title: PR_TITLE,
      body: opts.body,
    })) as unknown as Pr;
    log(`Updated PR #${pr.number}`);
  } else {
    pr = (await api('POST', `${repoPath}/pulls`, {
      title: PR_TITLE,
      head: SYNC_BRANCH,
      base,
      body: opts.body,
    })) as unknown as Pr;
    created = true;
    log(`Opened PR #${pr.number}`);
  }

  if (opts.autoMerge) {
    try {
      const res = await f('https://api.github.com/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          query:
            'mutation($id: ID!) { enablePullRequestAutoMerge(input: {pullRequestId: $id, mergeMethod: SQUASH}) { pullRequest { number } } }',
          variables: { id: pr.node_id },
        }),
      });
      const json = (await res.json()) as { errors?: { message: string }[] };
      if (!res.ok || json.errors?.length) {
        throw new Error(json.errors?.map((e) => e.message).join('; ') ?? `status ${res.status}`);
      }
      log(`Auto-merge enabled for PR #${pr.number}`);
    } catch (err) {
      // the PR is still valid: it just has to be merged by hand
      log(`::warning::could not enable auto-merge: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { number: pr.number, created };
}
