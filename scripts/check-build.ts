import { checkBuild } from './lib/check-build';

const result = checkBuild('build', 'https://docs.rpp.gmbh');
for (const w of result.warnings) console.log(`::warning::${w}`);
for (const e of result.errors) console.error(`::error::${e}`);
console.log(`Checked ${result.pages} sitemap page(s): ${result.errors.length} error(s)`);
if (result.errors.length) process.exit(1);
