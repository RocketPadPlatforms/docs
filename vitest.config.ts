import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@site': resolve(__dirname) } },
  test: {
    include: [
      'scripts/**/*.test.ts',
      'plugins/**/*.test.ts',
      'site/**/*.test.ts',
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: ['tests/.tmp/**', 'node_modules/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
