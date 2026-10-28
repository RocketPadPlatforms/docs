import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'plugins/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/.tmp/**', 'node_modules/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
