export interface Candidate {
  tag: string;
  /** ISO timestamp. Missing for plain tags; then `commitDate` supplies it for new versions. */
  publishedAt?: string;
}

export interface Provider {
  getDefaultBranch(repo: string): Promise<string>;
  /**
   * `releases`: published releases only (no drafts, no prereleases).
   * `tags`: every tag.
   */
  listCandidates(repo: string, source: 'releases' | 'tags'): Promise<Candidate[]>;
  /** Commit SHA the tag points to, annotated tags unwrapped. Never uses `target_commitish`. */
  resolveCommit(repo: string, tag: string): Promise<string>;
  commitDate(repo: string, commit: string): Promise<string>;
  /** Human-facing link for the PR summary. */
  releaseUrl(repo: string, tag: string): string | undefined;
}
