import type { Candidate, Provider } from './types';

const API_VERSION = '2026-03-10';

export interface GitHubProviderOptions {
  token?: string;
  apiUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxRetries?: number;
  /** Longest single wait we accept before giving up (primary limit resets can be ~1h away). */
  maxWaitMs?: number;
}

interface GitRef {
  object: { type: string; sha: string };
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export class GitHubProvider implements Provider {
  private readonly token?: string;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly maxRetries: number;
  private readonly maxWaitMs: number;

  constructor(opts: GitHubProviderOptions = {}) {
    this.token = opts.token;
    this.apiUrl = (opts.apiUrl ?? 'https://api.github.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.maxRetries = opts.maxRetries ?? 5;
    this.maxWaitMs = opts.maxWaitMs ?? 10 * 60_000;
  }

  /** GET with retry on rate limits (primary + secondary) and transient 5xx. */
  private async request(pathOrUrl: string): Promise<Response> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.apiUrl}${pathOrUrl}`;
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': API_VERSION,
      'user-agent': 'rpp-docs-sync',
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, { headers });
      if (res.ok) return res;

      const waitMs = await this.retryDelay(res, attempt);
      if (waitMs === null || attempt >= this.maxRetries) {
        const path = url.replace(this.apiUrl, '');
        const hint = res.status === 404 ? ' (missing repo, or the token cannot see it)' : '';
        throw new Error(`GitHub API ${res.status} for ${path}${hint}`);
      }
      if (waitMs > this.maxWaitMs) {
        throw new Error(`GitHub API rate limit: would have to wait ${Math.round(waitMs / 1000)}s`);
      }
      await this.sleep(waitMs);
    }
  }

  /** ms to wait before retrying, or null when the failure is not retryable. */
  private async retryDelay(res: Response, attempt: number): Promise<number | null> {
    const backoff = 1000 * 2 ** attempt;
    if (res.status >= 500) return backoff;
    if (res.status !== 403 && res.status !== 429) return null;

    const retryAfter = res.headers.get('retry-after');
    if (retryAfter) return Math.max(0, Number(retryAfter)) * 1000;
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      return Math.max(0, reset * 1000 - this.now()) + 1000;
    }
    // 403 without rate-limit headers is usually a permission problem; only 429 or a
    // secondary-limit message is retried (wait >= 1 min, then exponential).
    const body = (await res.text()).toLowerCase();
    if (
      res.status === 429 ||
      body.includes('secondary rate limit') ||
      body.includes('rate limit')
    ) {
      return 60_000 * 2 ** attempt;
    }
    return null;
  }

  private async getJson<T>(path: string): Promise<T> {
    return (await (await this.request(path)).json()) as T;
  }

  private async paginate<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = `${path}${path.includes('?') ? '&' : '?'}per_page=100`;
    while (next) {
      const res = await this.request(next);
      items.push(...((await res.json()) as T[]));
      next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
    }
    return items;
  }

  async getDefaultBranch(repo: string): Promise<string> {
    return (await this.getJson<{ default_branch: string }>(`/repos/${repo}`)).default_branch;
  }

  async listCandidates(repo: string, source: 'releases' | 'tags'): Promise<Candidate[]> {
    if (source === 'tags') {
      const refs = await this.paginate<{ ref: string }>(`/repos/${repo}/git/matching-refs/tags/`);
      return refs.map((r) => ({ tag: r.ref.replace(/^refs\/tags\//, '') }));
    }
    const releases = await this.paginate<{
      tag_name: string;
      draft: boolean;
      prerelease: boolean;
      published_at: string | null;
    }>(`/repos/${repo}/releases`);
    return releases
      .filter((r) => !r.draft && !r.prerelease && r.published_at)
      .map((r) => ({ tag: r.tag_name, publishedAt: r.published_at as string }));
  }

  async resolveCommit(repo: string, tag: string): Promise<string> {
    let { object } = await this.getJson<GitRef>(`/repos/${repo}/git/ref/tags/${encodePath(tag)}`);
    // annotated tags point at tag objects (which may be nested); unwrap to the commit
    for (let depth = 0; object.type === 'tag'; depth++) {
      if (depth >= 5) throw new Error(`tag ${tag} of ${repo} is nested too deeply`);
      ({ object } = await this.getJson<{ object: GitRef['object'] }>(
        `/repos/${repo}/git/tags/${object.sha}`,
      ));
    }
    if (object.type !== 'commit') {
      throw new Error(`tag ${tag} of ${repo} points at a ${object.type}, not a commit`);
    }
    return object.sha;
  }

  async commitDate(repo: string, commit: string): Promise<string> {
    const c = await this.getJson<{ committer: { date: string } }>(
      `/repos/${repo}/git/commits/${commit}`,
    );
    return c.committer.date;
  }

  releaseUrl(repo: string, tag: string): string {
    return `https://github.com/${repo}/releases/tag/${encodePath(tag)}`;
  }
}
