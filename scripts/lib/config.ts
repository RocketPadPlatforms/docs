import { readFileSync } from 'node:fs';
import * as z from 'zod';

// Route segments that would collide with files Docusaurus or the site itself emits.
const RESERVED_IDS = new Set(['assets', 'img', 'fonts', '404', 'search', 'markdown-page']);

const relativePath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith('/') && !p.includes('\0') && !p.split(/[\\/]/).includes('..'),
    'must be a relative path inside the repository',
  );

const tagPattern = z.string().refine((p) => {
  try {
    // appending "|" makes the regex match "" so exec() reveals the group count
    return (new RegExp(`${p}|`).exec('')?.length ?? 0) > 1;
  } catch {
    return false;
  }
}, 'must be a valid regular expression with a capture group (the version name)');

export const appSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and "-" only')
      .refine((id) => !RESERVED_IDS.has(id), 'reserved route name'),
    label: z.string().min(1),
    description: z.string().min(1),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected "<owner>/<repo>"'),
    docsPath: relativePath,
    sidebarFile: relativePath.optional(),
    source: z.enum(['releases', 'tags']).default('releases'),
    tagPattern: tagPattern.default('^v?(\\d+\\.\\d+\\.\\d+)$'),
    minVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
    exclude: z.array(z.string()).default([]),
    retention: z.enum(['all', 'latest-patch-per-minor']).default('all'),
  })
  .strict();

export const sourcesSchema = z
  .object({ apps: z.array(appSchema) })
  .strict()
  .refine((c) => new Set(c.apps.map((a) => a.id)).size === c.apps.length, 'app ids must be unique');

export type AppConfig = z.infer<typeof appSchema>;
export type SourcesConfig = z.infer<typeof sourcesSchema>;

export function parseSources(raw: unknown): SourcesConfig {
  const parsed = sourcesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid docs-sources.json:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadSources(path = 'docs-sources.json'): SourcesConfig {
  return parseSources(JSON.parse(readFileSync(path, 'utf8')));
}
