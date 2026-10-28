import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MB = 1024 * 1024;

export function dirSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
  }
  return total;
}

/** GitHub Pages publishes at most 1 GB; warn early, fail before the deploy would. */
export function evaluateSize(
  bytes: number,
  warnMb = 700,
  failMb = 900,
): { level: 'ok' | 'warn' | 'fail'; message: string } {
  const mb = bytes / MB;
  const text = `build output is ${mb.toFixed(1)} MB (GitHub Pages limit: 1024 MB)`;
  if (mb > failMb) return { level: 'fail', message: `${text}, above the ${failMb} MB limit` };
  if (mb > warnMb)
    return { level: 'warn', message: `${text}, above the ${warnMb} MB warning level` };
  return { level: 'ok', message: text };
}

const attr = (html: string, re: RegExp) => re.exec(html)?.[1]?.trim();

export interface BuildCheck {
  errors: string[];
  warnings: string[];
  pages: number;
}

/**
 * Everything in the sitemap must be a real, indexable page with a title, description and a
 * canonical that points at itself. Redirect stubs and noindex pages must not be listed.
 */
export function checkBuild(buildDir: string, siteUrl: string): BuildCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sitemapFile = join(buildDir, 'sitemap.xml');
  if (!existsSync(sitemapFile)) return { errors: ['sitemap.xml is missing'], warnings, pages: 0 };

  const urls = [...readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1],
  );
  const titles = new Map<string, string[]>();

  for (const url of urls) {
    const path = new URL(url).pathname;
    const file = join(buildDir, path, 'index.html');
    if (!existsSync(file)) {
      errors.push(`${url}: in the sitemap but ${file} does not exist`);
      continue;
    }
    const html = readFileSync(file, 'utf8');
    if (/<meta[^>]*name=["']?robots["']?[^>]*noindex/i.test(html)) {
      errors.push(`${url}: noindex page listed in the sitemap`);
    }
    if (/http-equiv=["']?refresh/i.test(html)) errors.push(`${url}: redirect stub in the sitemap`);

    const title = attr(html, /<title[^>]*>([^<]+)<\/title>/i);
    if (!title) errors.push(`${url}: missing <title>`);
    else titles.set(title, [...(titles.get(title) ?? []), url]);
    if (!attr(html, /<meta[^>]*name=["']?description["']?[^>]*content=["']?([^"'>]+)/i)) {
      errors.push(`${url}: missing meta description`);
    }
    const canonical = attr(html, /<link[^>]*rel=["']?canonical["']?[^>]*href=["']?([^"'\s>]+)/i);
    if (!canonical) errors.push(`${url}: missing canonical link`);
    else if (new URL(canonical, siteUrl).href !== new URL(url).href) {
      errors.push(`${url}: canonical is ${canonical}`);
    }
  }
  for (const [title, where] of titles) {
    if (where.length > 1) {
      warnings.push(`duplicate title "${title}": ${where.join(', ')}. Use unique titles per page.`);
    }
  }
  return { errors, warnings, pages: urls.length };
}
