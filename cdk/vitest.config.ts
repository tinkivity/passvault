import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@passvault/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    globalSetup: './src/test/globalSetup.ts',
  },
});
