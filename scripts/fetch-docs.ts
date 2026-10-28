import { parseArgs } from 'node:util';
import { fetchVersion, lockedTargets, pruneCache } from './lib/fetch';
import { mapLimit } from './lib/util';

async function main() {
  const { values } = parseArgs({
    options: {
      only: { type: 'string', multiple: true },
      concurrency: { type: 'string', default: '4' },
    },
  });
  const token = process.env.DOCS_SOURCES_TOKEN;
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('--concurrency must be >= 1');
  }

  const targets = lockedTargets(values.only);
  console.log(`Fetching ${targets.length} locked version(s) (concurrency ${concurrency})`);
  const failures: string[] = [];
  await mapLimit(targets, concurrency, async (t) => {
    const label = `${t.app.id}@${t.version} (${t.commit.slice(0, 12)})`;
    try {
      console.log(`  ${await fetchVersion(t, { token })}: ${label}`);
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : err}`);
    }
  });
  if (!values.only?.length) pruneCache(targets);
  if (failures.length) {
    console.error(
      `\n${failures.length} fetch(es) failed:\n${failures.map((x) => `- ${x}`).join('\n')}`,
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
