import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fetched app sources are untrusted. A symlink could point MDX imports or asset
 * references at files outside the docs folder, so any symlink is an error.
 */
export function assertNoSymlinks(dir: string, label: string): void {
  if (lstatSync(dir).isSymbolicLink()) {
    throw new Error(`${label}: "${dir}" is a symlink; symlinks are not allowed in app docs`);
  }
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `${label}: symlink "${join(entry.parentPath, entry.name)}" found; symlinks are not allowed in app docs`,
      );
    }
  }
}
