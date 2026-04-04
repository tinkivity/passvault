import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const sitDir = resolve(__dirname);

export default defineConfig({
  test: {
    include: [resolve(sitDir, 'scenarios/**/*.test.ts')],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: { sequential: true },
  },
});
