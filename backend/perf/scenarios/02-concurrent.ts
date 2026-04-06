/**
 * Concurrent access scenario: 5 parallel request streams.
 * Each stream performs GET /api/vaults + GET /api/vaults/{id}/index.
 * Asserts no errors, no 429s, each completes within baseline.
 */

import { describe, it, expect } from 'vitest';
import { request, pow } from '../../sit/lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import { measure, stats } from '../lib/measure.js';
import type { BenchmarkResult } from '../lib/measure.js';
import type { PerfContext } from '../lib/context.js';
import baselines from '../baselines.json';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const STREAMS = 5;

export function concurrentScenarios(ctx: PerfContext) {
  describe('02 - Concurrent Access', () => {
    it(`${STREAMS} parallel streams complete without errors`, async () => {
      const allSamples: number[] = [];
      const statuses: number[] = [];
      let has429 = false;

      /**
       * A single stream: list vaults, then get vault index.
       * Returns the total elapsed time for both requests.
       */
      async function stream(id: number): Promise<number> {
        const elapsed = await measure(async () => {
          // Request 1: list vaults
          const listRes = await request('GET', API_PATHS.VAULTS, {
            token: ctx.testUserToken,
            powDifficulty: pow(HIGH),
          });
          statuses.push(listRes.status);
          if (listRes.status === 429) has429 = true;

          // Request 2: get vault
          const vaultPath = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);
          const getRes = await request('GET', vaultPath, {
            token: ctx.testUserToken,
            powDifficulty: pow(HIGH),
          });
          statuses.push(getRes.status);
          if (getRes.status === 429) has429 = true;
        });

        console.log(`  stream-${id}: ${elapsed}ms`);
        return elapsed;
      }

      // Launch all streams in parallel
      const promises = Array.from({ length: STREAMS }, (_, i) => stream(i));
      const results = await Promise.all(promises);
      allSamples.push(...results);

      // Build result for reporting
      const s = stats(allSamples);
      const result: BenchmarkResult = {
        name: 'concurrent_5_streams',
        samples: allSamples,
        baseline: baselines.concurrent.max_per_user_ms,
        ...s,
      };
      ctx.concurrentResults.push(result);

      // Assertions
      const errorStatuses = statuses.filter(s => s >= 400);
      if (!baselines.concurrent.allow_429) {
        expect(has429).toBe(false);
      }
      expect(errorStatuses).toHaveLength(0);

      // Each stream must complete within the per-user max
      for (let i = 0; i < results.length; i++) {
        expect(results[i]).toBeLessThanOrEqual(baselines.concurrent.max_per_user_ms);
      }

      console.log(`  Overall: p50=${s.p50}ms p95=${s.p95}ms max=${s.max}ms`);
    });
  });
}
