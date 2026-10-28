import { existsSync } from 'node:fs';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';
import constants from './constants';
import versionRouting, { isRedirectRoot } from './plugins/version-routing';
import { loadSources } from './scripts/lib/config';
import { readIndex } from './scripts/lib/docs-index';
import { makeBrokenHook, parseSeverity } from './site/broken-links';
import { buildInstances, navbarItems, parseLocal, parseOnly } from './site/instances';

const SITE_URL = 'https://docs.rpp.gmbh';
const SITE_NAME = constants.companyNameShort;
const DESCRIPTION = `Documentation for ${SITE_NAME} products: guides, architecture and reference for every supported version.`;

const only = parseOnly(process.env.DOCS_ONLY);
const local = parseLocal(process.env.LOCAL_DOCS);

// A deploy build must contain exactly the locked releases of every app.
if (process.env.DOCS_DEPLOY === 'true' && (local.size > 0 || only)) {
  throw new Error('LOCAL_DOCS and DOCS_ONLY must not be set for a deploy build (DOCS_DEPLOY=true)');
}

const sources = loadSources();
const index = readIndex(undefined, { optional: local.size > 0 });
const localSidebars = new Map(
  [...local.keys()]
    .map((id) => [id, `generated/local-sidebars/${id}.json`] as const)
    .filter(([, file]) => existsSync(file)),
);

const { instances, warnings } = buildInstances({
  apps: sources.apps,
  index,
  only,
  local,
  localSidebars,
});
for (const w of warnings) console.warn(`[WARNING] ${w}`);

const brokenOverride = parseSeverity(process.env.DOCS_ON_BROKEN_LINKS);
const latestByApp = new Map(index.apps.map((a) => [a.id, a.latest]));

const config: Config = {
  title: SITE_NAME,
  tagline: `Documentation for ${SITE_NAME} products`,
  favicon: 'img/favicon.ico',
  url: SITE_URL,
  baseUrl: '/',
  // GitHub Pages serves <dir>/index.html and 301-redirects /dir to /dir/. Emitting slash URLs
  // (and canonicals, sitemap entries and links) means crawlers and users never hit that hop.
  trailingSlash: true,

  onBrokenLinks: brokenOverride ?? 'throw',
  onDuplicateRoutes: 'throw',

  future: {
    faster: true,
    // required by faster.ssgWorkerThreads; only changes the postBuild plugin API, not content
    v4: { removeLegacyPostBuildHeadAttribute: true },
  },

  markdown: {
    format: 'mdx',
    mermaid: true,
    // Old tags are immutable and must keep compiling, so MDX 1 compatibility stays on.
    mdx1Compat: { comments: true, admonitions: true, headingIds: true },
    hooks: {
      onBrokenMarkdownLinks: makeBrokenHook('link', latestByApp, brokenOverride),
      onBrokenMarkdownImages: makeBrokenHook('image', latestByApp, brokenOverride),
    },
  },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: false,
        blog: false,
        theme: {
          customCss: [
            './src/css/fonts.css',
            './src/css/tokens.css',
            './src/css/base.css',
            './src/css/components.css',
            './src/css/portal.css',
          ],
        },
        sitemap: {
          lastmod: null,
          changefreq: null,
          priority: null,
          ignorePatterns: ['/tags/**'],
          createSitemapItems: async (params) => {
            const { defaultCreateSitemapItems, ...rest } = params;
            const items = await defaultCreateSitemapItems(rest);
            // static redirect stubs are written after rendering; keep them out of the sitemap
            return items.filter((item) => !isRedirectRoot(new URL(item.url).pathname));
          },
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    ...instances.map((i) => ['@docusaurus/plugin-content-docs', i.options] as [string, object]),
    [
      versionRouting,
      {
        apps: instances.map((i) => ({
          id: i.id,
          label: i.label,
          description: sources.apps.find((a) => a.id === i.id)?.description ?? '',
          retired: index.apps.find((a) => a.id === i.id)?.retired ?? [],
        })),
      },
    ],
  ],

  headTags: [
    ...['josefin-sans-latin', 'open-sans-latin'].map((font) => ({
      tagName: 'link',
      attributes: {
        rel: 'preload',
        href: `/fonts/${font}.woff2`,
        as: 'font',
        type: 'font/woff2',
        crossorigin: 'anonymous',
      },
    })),
    { tagName: 'meta', attributes: { name: 'theme-color', content: '#030712' } },
    {
      tagName: 'link',
      attributes: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/img/favicon-32.png' },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '192x192',
        href: '/img/favicon-192.png',
      },
    },
    {
      tagName: 'link',
      attributes: { rel: 'apple-touch-icon', href: '/img/apple-touch-icon.png' },
    },
    {
      tagName: 'script',
      attributes: { type: 'application/ld+json' },
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: `${SITE_NAME} Docs`,
        description: DESCRIPTION,
        inLanguage: 'en',
        publisher: { '@id': `${constants.companyWebsite}/#organization` },
      }),
    },
  ],

  themeConfig: {
    image: 'img/og-default.png',
    metadata: [
      { name: 'description', content: DESCRIPTION },
      { name: 'keywords', content: constants.keywords.join(', ') },
      { property: 'og:site_name', content: SITE_NAME },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    // Dark by default like rpp.gmbh. respectPrefersColorScheme is off on purpose: otherwise a
    // light-OS visitor coming from the dark marketing site would land on a white page.
    colorMode: { defaultMode: 'dark', disableSwitch: false, respectPrefersColorScheme: false },
    navbar: {
      title: 'Docs',
      logo: { alt: `${SITE_NAME} logo`, src: 'img/logo.svg' },
      items: [
        ...navbarItems(instances),
        { href: constants.companyWebsite, label: 'Website', position: 'right' },
        {
          href: constants.gitBaseURL,
          label: 'GitHub',
          position: 'right',
          className: 'navbar-cta header-github-link',
          'aria-label': 'GitHub organization',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Docs', items: [{ label: 'All products', to: '/' }] },
        {
          title: 'Company',
          items: [
            { label: 'Website', href: constants.companyWebsite },
            { label: 'FAQ', href: `${constants.companyWebsite}/en/faq` },
            { label: 'Legal Notice', href: `${constants.companyWebsite}/en/legal-notice` },
            { label: 'Privacy', href: `${constants.companyWebsite}/en/privacy` },
          ],
        },
        {
          title: 'Connect',
          items: [
            { label: 'GitHub', href: constants.gitBaseURL },
            { label: 'Discord', href: constants.discordLink },
            { label: 'LinkedIn', href: constants.linkedinLink },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} ${constants.companyName} · Made in Germany`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'hcl'],
    },
    // Colors per mode are applied by src/theme/Mermaid (see mermaid-theme.ts).
    mermaid: { theme: { light: 'base', dark: 'base' } },
  } satisfies Preset.ThemeConfig,
};

export default config;
