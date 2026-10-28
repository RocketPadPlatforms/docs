import { fileURLToPath } from 'node:url';
import { git, gitBase } from '../git';
import type { Candidate, Provider } from './types';

/**
 * `file://` repositories for tests and fixtures. Plain git has no "releases", so
 * `releases` and `tags` both list every tag (creator date stands in for the publish date).
 */
export class LocalGitProvider implements Provider {
  constructor(private readonly base: string = gitBase()) {
    if (!base.startsWith('file://')) {
      throw new Error(`local-git provider needs a file:// base (DOCS_GIT_BASE), got "${base}"`);
    }
  }

  private dir(repo: string): string {
    return fileURLToPath(`${this.base}/${repo}`);
  }

  async getDefaultBranch(repo: string): Promise<string> {
    return (await git(['symbolic-ref', '--short', 'HEAD'], { cwd: this.dir(repo) })).trim();
  }

  async listCandidates(repo: string): Promise<Candidate[]> {
    const out = await git(
      ['for-each-ref', '--format=%(refname:strip=2)%09%(creatordate:iso-strict)', 'refs/tags'],
      { cwd: this.dir(repo) },
    );
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [tag, publishedAt] = line.split('\t');
        return { tag, publishedAt };
      });
  }

  async resolveCommit(repo: string, tag: string): Promise<string> {
    // ^{commit} peels annotated tags
    const out = await git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], {
      cwd: this.dir(repo),
    });
    return out.trim();
  }

  async commitDate(repo: string, commit: string): Promise<string> {
    return (await git(['log', '-1', '--format=%cI', commit], { cwd: this.dir(repo) })).trim();
  }

  releaseUrl(): undefined {
    return undefined;
  }
}
