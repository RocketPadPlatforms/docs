import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { SourcesConfig } from './config';
import { loadSidebars } from './sidebars';

export const LOCAL_SIDEBARS_DIR = 'generated/local-sidebars';

/** `app-a=../app-a/docs` -> [id, absolute path]; both the app and the folder must exist. */
export function parseLocalArgs(args: string[], config: SourcesConfig, cwd = process.cwd()) {
  if (args.length === 0) throw new Error('usage: pnpm dev:local -- <app-id>=<path-to-docs> ...');
  return args.map((arg) => {
    const eq = arg.indexOf('=');
    const id = arg.slice(0, eq);
    if (eq < 1 || eq === arg.length - 1) throw new Error(`"${arg}" must look like <app-id>=<path>`);
    if (!config.apps.some((a) => a.id === id)) {
      throw new Error(`${id}: not in docs-sources.json (add the app first)`);
    }
    const path = resolve(cwd, arg.slice(eq + 1));
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new Error(`${id}: ${path} is not a directory`);
    }
    return [id, path] as const;
  });
}

/**
 * Docusaurus reads the working copy's sidebar for the current version. Normalize it like a
 * released one (sidebar id `docs`) and hand Docusaurus the result. Not live-reloaded:
 * restart after changing the sidebar file.
 */
export async function prepareLocalSidebars(
  entries: (readonly [string, string])[],
  config: SourcesConfig,
  cwd = process.cwd(),
) {
  const out = join(cwd, LOCAL_SIDEBARS_DIR);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [id, docsDir] of entries) {
    const app = config.apps.find((a) => a.id === id);
    const sidebars = await loadSidebars(
      docsDir,
      basename(app?.sidebarFile ?? 'sidebars.json'),
      `${id} (local)`,
    );
    writeFileSync(join(out, `${id}.json`), `${JSON.stringify(sidebars, null, 2)}\n`);
  }
}
