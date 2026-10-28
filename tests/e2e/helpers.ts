import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';

export const REPO = resolve(__dirname, '../..');

export interface Run {
  code: number;
  out: string;
}

/** Runs a command and never throws; the caller asserts on code and output. */
export function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<Run> {
  return new Promise((done) => {
    execFile(cmd, args, { cwd, env, maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? ((err as { code?: number }).code ?? 1) : 0;
      done({ code: typeof code === 'number' ? code : 1, out: `${stdout}${stderr}` });
    });
  });
}

/**
 * Copies the working tree (tracked and untracked, minus ignored files) and links node_modules,
 * so the pipeline runs on exactly what is checked out, from scratch.
 */
export async function copySite(dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true });
  const { out } = await run('git', ['ls-files', '-co', '--exclude-standard'], REPO, process.env);
  for (const file of out.split('\n').filter(Boolean)) {
    const from = join(REPO, file);
    if (!existsSync(from)) continue; // deleted but not yet committed
    mkdirSync(dirname(join(dest, file)), { recursive: true });
    cpSync(from, join(dest, file));
  }
  symlinkSync(join(REPO, 'node_modules'), join(dest, 'node_modules'));
}

/**
 * Environment for pipeline steps: no tokens, nothing the build job would not have either.
 * Mirrors the secret-free build job.
 */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PATH: `${join(REPO, 'node_modules/.bin')}:${process.env.PATH}`,
    HOME: process.env.HOME,
    LANG: 'C.UTF-8',
    CI: 'true',
    ...extra,
  };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

/** Serves a build like GitHub Pages: dir/index.html, 301 to the slash form, 404.html on a miss. */
export function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = resolve(dir);
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = resolve(join(root, decodeURIComponent(url.pathname)));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let target: string | null = null;
    if (isFile(file)) target = file;
    else if (isDir(file)) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { location: `${url.pathname}/${url.search}` }).end();
        return;
      }
      if (isFile(join(file, 'index.html'))) target = join(file, 'index.html');
    } else if (isFile(`${file}.html`)) target = `${file}.html`;

    if (target) {
      res.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
      res.end(readFileSync(target));
    } else {
      res.writeHead(404, { 'content-type': MIME['.html'] });
      res.end(isFile(join(root, '404.html')) ? readFileSync(join(root, '404.html')) : 'Not found');
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolveServer({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
