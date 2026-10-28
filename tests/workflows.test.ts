import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scripts = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts);
// pnpm subcommands that are not package scripts
const BUILTIN = new Set(['install', 'exec', 'dlx', 'run']);

describe('workflows', () => {
  it.each(readdirSync('.github/workflows'))('%s only runs pnpm scripts that exist', (file) => {
    const text = readFileSync(`.github/workflows/${file}`, 'utf8');
    for (const [, name] of text.matchAll(/\bpnpm (?:run )?([a-z][\w:-]*)/g)) {
      expect(BUILTIN.has(name) || scripts.includes(name), `pnpm ${name} in ${file}`).toBe(true);
    }
  });
});
