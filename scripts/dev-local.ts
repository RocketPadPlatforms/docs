import { spawn } from 'node:child_process';
import { loadSources } from './lib/config';
import { parseLocalArgs, prepareLocalSidebars } from './lib/local';

// pnpm dev:local -- app-a=../app-a/docs [app-b=...] [--build] [-- <docusaurus flags>]
//   default  docusaurus start with hot reload on the working copy
//   --build  production build of only the working copies (used by validate-app-docs)
async function main() {
  const argv = process.argv.slice(2);
  const build = argv.includes('--build');
  const dash = argv.indexOf('--');
  const passthrough = dash >= 0 ? argv.slice(dash + 1) : [];
  const entryArgs = (dash >= 0 ? argv.slice(0, dash) : argv).filter((a) => a !== '--build');

  const config = loadSources();
  const entries = parseLocalArgs(entryArgs, config);
  await prepareLocalSidebars(entries, config);

  const env = {
    ...process.env,
    LOCAL_DOCS: entries.map(([id, path]) => `${id}=${path}`).join(','),
    // validating a working copy must not depend on (or build) any released version
    ...(build ? { DOCS_ONLY: entries.map(([id]) => `${id}@current`).join(',') } : {}),
  };
  const child = spawn('docusaurus', [build ? 'build' : 'start', ...passthrough], {
    stdio: 'inherit',
    env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
