import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['sit/**', 'pentest/**', 'perf/**', 'node_modules/**'],
  },
});
