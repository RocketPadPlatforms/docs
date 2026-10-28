import * as z from 'zod';

/**
 * THE ONLY MODULE THAT TOUCHES DOCUSAURUS CONTENT INTERNALS.
 *
 * `allContentLoaded` is an experimental plugin lifecycle, and the shape of what the docs
 * plugin loads (`loadedVersions`, `docs`, processed `sidebars`) is not a public contract.
 * Everything we rely on is validated here, so an upgrade that changes it fails the build
 * with a pointer to this file instead of producing wrong redirects. Versions are pinned
 * exactly; docs-content.test.ts holds fixtures in the shape of 3.10.2.
 */
export const DOCS_PLUGIN_NAME = 'docusaurus-plugin-content-docs';

export interface DocsDoc {
  id: string;
  slug: string;
  permalink: string;
}

export interface DocsVersion {
  name: string;
  label: string;
  /** version root permalink, e.g. /app-a (latest) or /app-a/0.1.0 */
  path: string;
  isLast: boolean;
  docs: DocsDoc[];
  /** processed sidebars: id -> items (type doc | category | link | html | ref) */
  sidebars: Record<string, unknown[]>;
}

const docSchema = z.object({ id: z.string(), slug: z.string(), permalink: z.string() }).loose();

const versionSchema = z
  .object({
    versionName: z.string(),
    label: z.string(),
    path: z.string(),
    isLast: z.boolean(),
    docs: z.array(docSchema),
    sidebars: z.record(z.string(), z.array(z.unknown())),
  })
  .loose();

const contentSchema = z.object({ loadedVersions: z.array(versionSchema) }).loose();

/** `allContent` -> versions per docs plugin instance id. Throws with guidance on any mismatch. */
export function readDocsVersions(allContent: unknown): Map<string, DocsVersion[]> {
  const out = new Map<string, DocsVersion[]>();
  const perPlugin = (allContent as Record<string, unknown> | null)?.[DOCS_PLUGIN_NAME];
  if (perPlugin === undefined) return out; // no docs instances at all (empty portal)
  if (typeof perPlugin !== 'object' || perPlugin === null) {
    throw new Error(
      `allContent["${DOCS_PLUGIN_NAME}"] has an unexpected shape; see docs-content.ts`,
    );
  }
  for (const [id, content] of Object.entries(perPlugin)) {
    const parsed = contentSchema.safeParse(content);
    if (!parsed.success) {
      throw new Error(
        `Docs plugin content for "${id}" no longer has the expected shape. ` +
          `Docusaurus was probably upgraded: update plugins/version-routing/docs-content.ts.\n${z.prettifyError(parsed.error)}`,
      );
    }
    out.set(
      id,
      parsed.data.loadedVersions.map((v) => ({
        name: v.versionName,
        label: v.label,
        path: v.path,
        isLast: v.isLast,
        docs: v.docs.map((d) => ({ id: d.id, slug: d.slug, permalink: d.permalink })),
        sidebars: v.sidebars,
      })),
    );
  }
  return out;
}
