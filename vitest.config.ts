// The tests run in plain Node, the tools' against throwaway folders and git repositories in the system's
// temporary folder; none reaches the network or needs a secret.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
