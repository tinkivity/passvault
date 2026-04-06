/**
 * Payload size scaling scenarios.
 * Tests round-trip times for various payload sizes and rejection of oversized payloads.
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { request, pow } from '../../sit/lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import { benchmark } from '../lib/measure.js';
import type { PerfContext } from '../lib/context.js';
import baselines from '../baselines.json';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

interface PayloadSpec {
  name: string;
  sizeBytes: number;
  baselineKey: keyof typeof baselines.payload;
  roundTrip: boolean; // true = PUT + GET, false = PUT only
}

const payloads: PayloadSpec[] = [
  { name: '1kb', sizeBytes: 1_024, baselineKey: '1kb_roundtrip_ms', roundTrip: true },
  { name: '50kb', sizeBytes: 50 * 1_024, baselineKey: '50kb_roundtrip_ms', roundTrip: true },
  { name: '200kb', sizeBytes: 200 * 1_024, baselineKey: '200kb_roundtrip_ms', roundTrip: true },
  { name: '500kb', sizeBytes: 500 * 1_024, baselineKey: '500kb_roundtrip_ms', roundTrip: true },
  { name: '1mb', sizeBytes: 1_024 * 1_024, baselineKey: '1mb_put_ms', roundTrip: false },
];

/** Generate a random base64 string of approximately the given byte size. */
function generatePayload(sizeBytes: number): string {
  // base64 inflates by ~33%, so generate fewer raw bytes
  const rawBytes = Math.ceil(sizeBytes * 0.75);
  return randomBytes(rawBytes).toString('base64');
}

export function payloadScenarios(ctx: PerfContext) {
  describe('03 - Payload Size Scaling', () => {
    for (const spec of payloads) {
      const baselineMs = baselines.payload[spec.baselineKey];

      it(`${spec.name} ${spec.roundTrip ? 'round-trip' : 'PUT'} <= ${baselineMs}ms`, async () => {
        const payload = generatePayload(spec.sizeBytes);
        const vaultPath = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);

        const result = await benchmark(
          spec.roundTrip ? `${spec.name}_roundtrip` : `${spec.name}_put`,
          async () => {
            // PUT the payload
            const putRes = await request('PUT', vaultPath, {
              body: { encryptedIndex: payload, encryptedItems: payload },
              token: ctx.testUserToken,
              powDifficulty: pow(HIGH),
            });
            expect(putRes.status).toBeLessThan(400);

            // GET it back (only for round-trip tests)
            if (spec.roundTrip) {
              const getRes = await request('GET', vaultPath, {
                token: ctx.testUserToken,
                powDifficulty: pow(HIGH),
              });
              expect(getRes.status).toBe(200);
            }
          },
          5, // fewer iterations for large payloads
        );

        result.baseline = baselineMs;
        ctx.payloadResults.push(result);

        console.log(
          `  ${spec.name}: min=${result.min}ms p50=${result.p50}ms p95=${result.p95}ms max=${result.max}ms (baseline=${baselineMs}ms)`,
        );

        expect(result.p95).toBeLessThanOrEqual(baselineMs);
      });
    }

    it('1.1MB PUT is rejected with 400', async () => {
      const oversizedPayload = generatePayload(1.1 * 1_024 * 1_024);
      const vaultPath = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);

      const res = await request('PUT', vaultPath, {
        body: { encryptedIndex: oversizedPayload, encryptedItems: oversizedPayload },
        token: ctx.testUserToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(400);
    });

    it('restores vault to seed data after payload tests', async () => {
      const seedData = 'A'.repeat(500);
      const vaultPath = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);

      const res = await request('PUT', vaultPath, {
        body: { encryptedIndex: seedData, encryptedItems: seedData },
        token: ctx.testUserToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
    });
  });
}
