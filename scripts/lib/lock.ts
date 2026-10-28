import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import semver from 'semver';
import { z } from 'zod';

const versionName = z.string().refine((v) => validateVersionName(v) === null, 'invalid version');

const lockVersionSchema = z
  .object({
    version: versionName,
    tag: z.string().min(1),
    commit: z.string().regex(/^[0-9a-f]{40,64}$/, 'expected a full commit SHA'),
    publishedAt: z.string().min(1),
  })
  .strict();

const lockRetiredSchema = z.object({ version: versionName, successor: versionName }).strict();

const lockAppSchema = z
  .object({
    defaultBranch: z.string().min(1),
    versions: z.array(lockVersionSchema),
    retired: z.array(lockRetiredSchema),
  })
  .strict();

const lockSchema = z.object({ apps: z.record(z.string(), lockAppSchema) }).strict();

export type LockVersion = z.infer<typeof lockVersionSchema>;
export type LockRetired = z.infer<typeof lockRetiredSchema>;
export type LockApp = z.infer<typeof lockAppSchema>;
export type Lock = z.infer<typeof lockSchema>;

/** Returns an error message, or null when the name is safe to use as a version. */
export function validateVersionName(name: string): string | null {
  if (name.includes('/') || name.includes('\\')) return 'contains a path separator';
  if (name.length > 32) return 'longer than 32 characters';
  if (name === 'current') return 'reserved name "current"';
  // semver.valid() also rejects a "v" prefix and anything not strictly x.y.z[-pre]
  if (semver.valid(name) !== name) return 'not a plain semver version (no "v" prefix)';
  return null;
}

export function emptyLock(): Lock {
  return { apps: {} };
}

export function readLock(path = 'docs-versions.lock.json'): Lock {
  if (!existsSync(path)) return emptyLock();
  const parsed = lockSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Invalid ${path}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Stable key order, semver-descending lists, trailing newline: unchanged state = identical bytes. */
export function serializeLock(lock: Lock): string {
  const apps: Lock['apps'] = {};
  for (const id of Object.keys(lock.apps).sort()) {
    const app = lock.apps[id];
    apps[id] = {
      defaultBranch: app.defaultBranch,
      versions: [...app.versions]
        .sort((a, b) => semver.rcompare(a.version, b.version))
        .map((v) => ({
          version: v.version,
          tag: v.tag,
          commit: v.commit,
          publishedAt: v.publishedAt,
        })),
      retired: [...app.retired]
        .sort((a, b) => semver.rcompare(a.version, b.version))
        .map((r) => ({ version: r.version, successor: r.successor })),
    };
  }
  return `${JSON.stringify({ apps }, null, 2)}\n`;
}

export function writeLock(lock: Lock, path = 'docs-versions.lock.json'): void {
  writeFileSync(path, serializeLock(lock));
}
