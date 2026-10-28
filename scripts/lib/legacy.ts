import { existsSync, readFileSync } from 'node:fs';
import * as z from 'zod';

/**
 * Old docs.rpp.gmbh URLs -> new location. Filled in by hand while the old platform-docs
 * content is split into app repos.
 *   "/<app>/<page>/"  redirect there (the target must exist in the build)
 *   false             page intentionally dropped, stays a 404
 *   null              not decided yet; blocks a deploy (see check-legacy.ts)
 */
const legacySchema = z.record(
  z.string().regex(/^\/[A-Za-z0-9._\-/]*$/, 'source must be an absolute path like /docs/overview'),
  z.union([z.string().regex(/^\//, 'target must be an absolute path'), z.literal(false), z.null()]),
);

export type LegacyMap = z.infer<typeof legacySchema>;

export function readLegacy(path = 'legacy-redirects.json'): LegacyMap {
  if (!existsSync(path)) return {};
  const parsed = legacySchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`Invalid ${path}:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const openLegacy = (map: LegacyMap): string[] =>
  Object.entries(map)
    .filter(([, target]) => target === null)
    .map(([source]) => source);
