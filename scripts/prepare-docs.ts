import { prepare } from './lib/prepare';

prepare()
  .then((index) => {
    console.log(
      index.apps.length
        ? index.apps.map((a) => `${a.id}: ${a.versions.join(', ')} (latest ${a.latest})`).join('\n')
        : 'No locked versions yet; the site will only contain the landing page.',
    );
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
