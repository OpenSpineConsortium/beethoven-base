// The tools' tests run in plain Node against throwaway git repositories in the system's temporary
// folder; test/node18/ is node:test's, run by `npm run test:node18` (and on Node 18 in CI).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
