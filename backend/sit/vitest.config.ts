import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: [resolve(__dirname, 'scenarios/sit.test.ts')],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    sequence: { sequential: true },
  },
});
