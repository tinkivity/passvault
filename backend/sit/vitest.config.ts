import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['sit/scenarios/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    sequence: { sequential: true },
    reporters: ['./sit/lib/progress-reporter.ts'],
  },
});
