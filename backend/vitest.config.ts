import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['sit/scenarios/**', 'pentest/**', 'perf/**', 'node_modules/**'],
  },
});
