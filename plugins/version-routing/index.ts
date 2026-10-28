import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LoadContext, Plugin } from '@docusaurus/types';
import semver from 'semver';
import { dropdownCss } from '../../site/instances';
import { readDocsVersions } from './docs-content';
import { planLegacy, planRedirects } from './plan';
import { startPage } from './start-pages';
import {
  type AppData,
  type GlobalData,
  PLUGIN_NAME,
  stripSlash,
  type VersionRoutingOptions,
} from './types';

/** Version roots that get a static redirect; the sitemap must not list them. */
const redirectRoots = new Set<string>();
export const isRedirectRoot = (pathname: string) => redirectRoots.has(stripSlash(pathname));

const byNewest = (a: { name: string }, b: { name: string }) =>
  a.name === 'current'
    ? -1
    : b.name === 'current'
      ? 1
      : semver.valid(a.name) && semver.valid(b.name)
        ? semver.rcompare(a.name, b.name)
        : 0;

export default function versionRouting(_context: LoadContext, rawOptions: unknown): Plugin {
  const options = rawOptions as VersionRoutingOptions;
  let apps: AppData[] = [];

  return {
    name: PLUGIN_NAME,

    // Experimental lifecycle; everything shape-dependent lives in docs-content.ts.
    async allContentLoaded({ allContent, actions }) {
      const loaded = readDocsVersions(allContent);
      redirectRoots.clear();
      apps = options.apps.flatMap((app): AppData[] => {
        const versions = loaded.get(app.id);
        if (!versions?.length) return [];
        const data = versions
          .map((v) => ({
            name: v.name,
            label: v.label,
            isLast: v.isLast,
            basePath: stripSlash(v.path),
            startPage: startPage(v),
          }))
          .sort(byNewest);
        for (const v of data) {
          if (v.startPage && stripSlash(v.startPage) !== v.basePath) redirectRoots.add(v.basePath);
        }
        const latest = data.find((v) => v.isLast) ?? data[0];
        return [{ ...app, latest: latest.name, versions: data }];
      });
      const globalData: GlobalData = { apps };
      actions.setGlobalData(globalData);
    },

    async postBuild({ outDir, routesPaths, siteConfig, baseUrl }) {
      const siteUrl = new URL(baseUrl, siteConfig.url).href;
      const versionPlan = planRedirects({ apps, routesPaths, outDir, siteUrl });
      const legacyPlan = planLegacy({
        legacy: options.legacy,
        routesPaths,
        outDir,
        siteUrl,
        exists: existsSync,
      });
      const problems = [...versionPlan.problems, ...legacyPlan.problems];
      if (problems.length) {
        throw new Error(
          `version-routing: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`,
        );
      }
      if (legacyPlan.open.length) {
        console.warn(
          `[WARNING] ${legacyPlan.open.length} legacy URL(s) have no redirect decision yet (legacy-redirects.json)`,
        );
      }
      for (const w of [...versionPlan.writes, ...legacyPlan.writes]) {
        mkdirSync(dirname(w.file), { recursive: true });
        writeFileSync(w.file, w.html);
      }
    },

    injectHtmlTags() {
      return {
        headTags: [{ tagName: 'style', innerHTML: dropdownCss(options.apps.map((a) => a.id)) }],
      };
    },
  };
}
