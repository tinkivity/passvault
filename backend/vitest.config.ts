import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['sit/**', 'node_modules/**'],
  },
});
