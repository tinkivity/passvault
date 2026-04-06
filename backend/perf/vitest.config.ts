import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [resolve(__dirname, 'scenarios/perf.test.ts')],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    sequence: { sequential: true },
  },
});
