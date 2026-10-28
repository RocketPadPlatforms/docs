import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import { HtmlClassNameProvider } from '@docusaurus/theme-common';
import { usePluginData } from '@docusaurus/useGlobalData';
import constants from '@site/constants';
import { type AppData, type GlobalData, PLUGIN_NAME } from '@site/plugins/version-routing/types';
import { ArrowRightIcon } from '@site/src/components/Icons';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import type { ReactNode } from 'react';

import styles from './index.module.css';

const TITLE = 'Documentation';
const DESCRIPTION = `Documentation for ${constants.companyNameShort} products: guides, architecture and reference for every supported version.`;

function AppCard({ app }: { app: AppData }): ReactNode {
  const latest = app.versions.find((v) => v.isLast) ?? app.versions[0];
  return (
    <article className={styles.card}>
      <h2 className={styles.cardTitle}>{app.label}</h2>
      <span className={styles.badge}>latest {latest.label}</span>
      <p className={styles.cardText}>{app.description}</p>
      <p className={styles.versionsLabel} id={`versions-${app.id}`}>
        All versions
      </p>
      <ul className={styles.versions} aria-labelledby={`versions-${app.id}`}>
        {app.versions.map((v) => (
          <li key={v.name}>
            {v.startPage ? <Link to={v.startPage}>{v.label}</Link> : <span>{v.label}</span>}
          </li>
        ))}
      </ul>
      {latest.startPage && (
        <div className={styles.cardActions}>
          <Link className={clsx(styles.btn, styles.btnSolid)} to={latest.startPage}>
            Read the docs
            <ArrowRightIcon className={styles.btnIcon} />
          </Link>
        </div>
      )}
    </article>
  );
}

export default function Home(): ReactNode {
  const apps = (usePluginData(PLUGIN_NAME) as GlobalData | undefined)?.apps ?? [];
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${TITLE} | ${constants.companyNameShort}`,
    description: DESCRIPTION,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: apps.map((app, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: app.label,
        url: `https://docs.rpp.gmbh${app.versions.find((v) => v.isLast)?.startPage ?? '/'}`,
      })),
    },
  };

  return (
    <HtmlClassNameProvider className="rpp-page-landing">
      <Layout title={TITLE} description={DESCRIPTION}>
        <Head>
          <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        </Head>
        <main className={styles.main}>
          <header className={styles.hero}>
            <div className={styles.heroInner}>
              <p className={styles.eyebrow}>{constants.companyNameShort} · Documentation</p>
              <h1 className={styles.title}>
                Everything you need,
                <br />
                <span className={styles.glow}>for every version.</span>
              </h1>
              <p className={styles.lead}>
                Guides, architecture and reference for our products. Pick a product, then switch
                versions from the menu at the top.
              </p>
            </div>
          </header>
          <section className={styles.products} aria-label="Products">
            {apps.length > 0 ? (
              <div className={styles.grid}>
                {apps.map((app) => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>No documentation has been published yet.</p>
            )}
          </section>
        </main>
      </Layout>
    </HtmlClassNameProvider>
  );
}
