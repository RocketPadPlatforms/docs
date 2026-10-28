import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type AppConfig, loadSources } from './lib/config';
import { assertNoSymlinks } from './lib/fs';
import { git, gitBase, repoUrl } from './lib/git';
import { readLock } from './lib/lock';
import { mapLimit } from './lib/util';

export const SOURCES_DIR = '.cache/sources';

/**
 * Passes the token to git through the environment (GIT_CONFIG_*), scoped to the
 * base URL. It never appears in argv, a remote URL, or a printed command line.
 */
export function authEnv(
  token: string | undefined,
  base = gitBase(),
  existing: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!token || !base.startsWith('https://')) return {};
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  const n = Number(existing.GIT_CONFIG_COUNT ?? 0) || 0;
  return {
    GIT_CONFIG_COUNT: String(n + 1),
    [`GIT_CONFIG_KEY_${n}`]: `http.${base}/.extraheader`,
    [`GIT_CONFIG_VALUE_${n}`]: `AUTHORIZATION: basic ${basic}`,
  };
}

export function redact(text: string, token: string | undefined): string {
  if (!token) return text;
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return text.split(token).join('***').split(basic).join('***');
}

/** gitignore-style escape for sparse-checkout patterns. */
const escapePattern = (p: string) => p.replace(/[\\*?[\]!#]/g, '\\$&');

export interface FetchTarget {
  app: AppConfig;
  version: string;
  commit: string;
}

export const cacheDir = (appId: string, commit: string, root = SOURCES_DIR) =>
  join(root, appId, commit);

/** Shallow, blob-filtered, sparse checkout of docsPath + sidebarFile at an exact commit. */
export async function fetchVersion(
  { app, commit }: FetchTarget,
  opts: { root?: string; token?: string } = {},
): Promise<'cached' | 'fetched'> {
  const root = opts.root ?? SOURCES_DIR;
  const dest = cacheDir(app.id, commit, root);
  if (existsSync(dest)) return 'cached'; // commits are immutable

  const tmp = join(root, app.id, `.tmp-${commit}-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const env = authEnv(opts.token);
  const run = (args: string[]) => git(args, { cwd: tmp, env });

  try {
    const docs = app.docsPath.replace(/^\.\//, '').replace(/\/+$/, '');
    const patterns = [docs && docs !== '.' ? `/${escapePattern(docs)}/` : '/*'];
    if (app.sidebarFile) patterns.push(`/${escapePattern(app.sidebarFile.replace(/^\.\//, ''))}`);

    await run(['init', '-q']);
    // belt and braces: fetched repos are untrusted, run no hooks
    await run(['config', 'core.hooksPath', '/dev/null']);
    await run(['remote', 'add', 'origin', repoUrl(app.repo)]);
    await run(['sparse-checkout', 'set', '--no-cone', ...patterns]);
    await run(['fetch', '-q', '--depth=1', '--filter=blob:none', 'origin', commit]);
    await run(['checkout', '-q', '--detach', 'FETCH_HEAD']);

    rmSync(join(tmp, '.git'), { recursive: true, force: true });
    const docsDir = join(tmp, docs || '.');
    if (!existsSync(docsDir)) {
      throw new Error(
        `docsPath "${app.docsPath}" does not exist in ${app.repo}@${commit.slice(0, 12)}`,
      );
    }
    assertNoSymlinks(docsDir, `${app.id}@${commit.slice(0, 12)}`);
    renameSync(tmp, dest);
    return 'fetched';
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(redact(err instanceof Error ? err.message : String(err), opts.token));
  }
}

export function lockedTargets(only: string[] = []): FetchTarget[] {
  const config = loadSources();
  const lock = readLock();
  const targets: FetchTarget[] = [];
  for (const app of config.apps) {
    for (const v of lock.apps[app.id]?.versions ?? []) {
      targets.push({ app, version: v.version, commit: v.commit });
    }
  }
  if (only.length === 0) return targets;

  const wanted = only.map((spec) => {
    const [id, version] = spec.split('@');
    if (!config.apps.some((a) => a.id === id))
      throw new Error(`--only ${spec}: unknown app "${id}"`);
    return { id, version };
  });
  const filtered = targets.filter((t) =>
    wanted.some((w) => w.id === t.app.id && (!w.version || w.version === t.version)),
  );
  for (const w of wanted) {
    if (!filtered.some((t) => t.app.id === w.id && (!w.version || t.version === w.version))) {
      throw new Error(`--only ${w.id}${w.version ? `@${w.version}` : ''}: nothing locked for that`);
    }
  }
  return filtered;
}

/** Drops cached commits that are no longer locked, so the CI cache cannot grow forever. */
function pruneCache(targets: FetchTarget[], root = SOURCES_DIR) {
  if (!existsSync(root)) return;
  const keep = new Set(targets.map((t) => `${t.app.id}/${t.commit}`));
  for (const appDir of readdirSync(root)) {
    for (const entry of readdirSync(join(root, appDir))) {
      if (!keep.has(`${appDir}/${entry}`)) {
        rmSync(join(root, appDir, entry), { recursive: true, force: true });
      }
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      only: { type: 'string', multiple: true },
      concurrency: { type: 'string', default: '4' },
    },
  });
  const token = process.env.DOCS_SOURCES_TOKEN;
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new Error('--concurrency must be >= 1');

  const targets = lockedTargets(values.only);
  console.log(`Fetching ${targets.length} locked version(s) (concurrency ${concurrency})`);
  const failures: string[] = [];
  await mapLimit(targets, concurrency, async (t) => {
    const label = `${t.app.id}@${t.version} (${t.commit.slice(0, 12)})`;
    try {
      console.log(`  ${await fetchVersion(t, { token })}: ${label}`);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : err}`);
    }
  });
  if (!values.only?.length) pruneCache(targets);
  if (failures.length) {
    console.error(
      `\n${failures.length} fetch(es) failed:\n${failures.map((f) => `- ${f}`).join('\n')}`,
    );
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) await main();
