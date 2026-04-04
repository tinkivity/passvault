import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { BaseSequencer } from 'vitest/node';

const sitDir = resolve(__dirname);

// Ensure scenario files run in alphabetical order (01 → 02 → 03 → ...)
class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer['sort']>[0]) {
    return [...files].sort((a, b) => {
      const nameA = typeof a === 'string' ? a : a[1];
      const nameB = typeof b === 'string' ? b : b[1];
      return nameA.localeCompare(nameB);
    });
  }
}

export default defineConfig({
  test: {
    include: [resolve(sitDir, 'scenarios/**/*.test.ts')],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    sequence: {
      sequential: true,
      sequencer: AlphabeticalSequencer,
    },
  },
});
