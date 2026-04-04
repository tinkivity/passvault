import { defineConfig } from 'vitest/config';
import { resolve, basename } from 'path';
import { BaseSequencer } from 'vitest/node';
import { SCENARIO_ORDER } from './scenario-order.js';

const sitDir = resolve(__dirname);

/**
 * Orders test files according to SCENARIO_ORDER config.
 * Files not listed in the config run last (alphabetically among themselves).
 */
class ConfigDrivenSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer['sort']>[0]) {
    const order = new Map(SCENARIO_ORDER.map((name, i) => [name, i]));

    return [...files].sort((a, b) => {
      const nameA = basename(typeof a === 'string' ? a : a[1]);
      const nameB = basename(typeof b === 'string' ? b : b[1]);
      const idxA = order.get(nameA) ?? 999;
      const idxB = order.get(nameB) ?? 999;
      if (idxA !== idxB) return idxA - idxB;
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
      sequencer: ConfigDrivenSequencer,
    },
  },
});
