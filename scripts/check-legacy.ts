import { openLegacy, readLegacy } from './lib/legacy';

// Deploy gate: every old URL needs a decision before the domain moves to this site.
const open = openLegacy(readLegacy());
if (open.length > 0) {
  console.error(
    `legacy-redirects.json: ${open.length} URL(s) have no decision yet (null):\n${open.map((p) => `- ${p}`).join('\n')}\n` +
      'Set each to its new path, or to false if the page is dropped.',
  );
  process.exit(1);
}
console.log('legacy-redirects.json: every old URL has a decision');
