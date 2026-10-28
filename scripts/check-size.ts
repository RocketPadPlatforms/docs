import { parseArgs } from 'node:util';
import { dirSize, evaluateSize } from './lib/check-build';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: 'build' },
    'warn-mb': { type: 'string', default: '700' },
    'fail-mb': { type: 'string', default: '900' },
  },
});

const result = evaluateSize(
  dirSize(values.dir as string),
  Number(values['warn-mb']),
  Number(values['fail-mb']),
);
if (result.level === 'fail') {
  console.error(`::error::${result.message}`);
  process.exit(1);
}
console.log(result.level === 'warn' ? `::warning::${result.message}` : result.message);
