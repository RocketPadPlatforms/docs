import { execFile } from 'node:child_process';

export interface GitOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/** Runs git without a shell. Failures never echo the environment (it may carry credentials). */
export function git(args: string[], opts: GitOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd: opts.cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opts.env },
        maxBuffer: 64 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            new Error(`git ${args.slice(0, 2).join(' ')} failed: ${stderr.trim() || err.message}`),
          );
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/**
 * Base for repository URLs. `https://github.com` in production; tests point it at
 * `file:///path/to/fixtures` so that `<owner>/<repo>` resolves to a local repository.
 */
export function gitBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.DOCS_GIT_BASE ?? 'https://github.com').replace(/\/+$/, '');
}

export function repoUrl(repo: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${gitBase(env)}/${repo}${gitBase(env).startsWith('file://') ? '' : '.git'}`;
}
