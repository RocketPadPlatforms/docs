import { resolve } from 'node:path';
import { createStandardFixtures } from './fixtures';

// usage: tsx tests/helpers/make-fixtures.ts <dir>   (then DOCS_GIT_BASE=file://<dir>)
const dir = resolve(process.argv[2] ?? 'tests/.tmp/fixtures');
createStandardFixtures(dir).then(() => {
  console.log(`fixture repos in ${dir}\nDOCS_GIT_BASE=file://${dir}`);
});
