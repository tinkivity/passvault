/**
 * Response time benchmarks for all major endpoints.
 * Runs each endpoint 10 times and asserts p95 <= baseline.
 */

import { describe, it, expect } from 'vitest';
import { request, pow } from '../../sit/lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import { benchmark } from '../lib/measure.js';
import type { PerfContext } from '../lib/context.js';
import { resolveBaselines } from '../lib/baselines.js';

const baselines = resolveBaselines(process.env.SIT_ENV ?? 'dev');

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;
const ITERATIONS = 10;

interface EndpointSpec {
  name: string;
  method: string;
  path: string | ((ctx: PerfContext) => string);
  powDifficulty?: (ctx: PerfContext) => number | undefined;
  token?: (ctx: PerfContext) => string | undefined;
  body?: (ctx: PerfContext) => unknown;
}

const endpoints: EndpointSpec[] = [
  {
    name: 'health',
    method: 'GET',
    path: API_PATHS.HEALTH,
  },
  {
    name: 'challenge',
    method: 'GET',
    path: API_PATHS.CHALLENGE,
  },
  {
    name: 'auth_login',
    method: 'POST',
    path: API_PATHS.AUTH_LOGIN,
    powDifficulty: () => pow(MEDIUM),
    body: (ctx) => ({ username: ctx.testUserEmail, password: ctx.testUserPassword }),
  },
  {
    name: 'vault_list',
    method: 'GET',
    path: API_PATHS.VAULTS,
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.testUserToken,
  },
  {
    name: 'vault_get_index',
    method: 'GET',
    path: (ctx) => API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId),
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.testUserToken,
  },
  {
    name: 'vault_put',
    method: 'PUT',
    path: (ctx) => API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId),
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.testUserToken,
    body: () => ({ encryptedIndex: 'B'.repeat(500), encryptedItems: 'B'.repeat(500) }),
  },
  {
    name: 'admin_users',
    method: 'GET',
    path: API_PATHS.ADMIN_USERS,
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.adminToken,
  },
  {
    name: 'admin_stats',
    method: 'GET',
    path: API_PATHS.ADMIN_STATS,
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.adminToken,
  },
  {
    name: 'admin_templates',
    method: 'GET',
    path: API_PATHS.ADMIN_EMAIL_TEMPLATES,
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.adminToken,
  },
  {
    name: 'admin_export',
    method: 'GET',
    path: API_PATHS.ADMIN_EMAIL_TEMPLATES_EXPORT,
    powDifficulty: () => pow(HIGH),
    token: (ctx) => ctx.adminToken,
  },
];

export function responseTimeScenarios(ctx: PerfContext) {
  describe('01 - Response Times', () => {
    for (const ep of endpoints) {
      it(`${ep.name} p95 <= ${baselines.endpoints[ep.name]?.p95 ?? '?'}ms`, async () => {
        const baselineP95 = baselines.endpoints[ep.name]?.p95;
        expect(baselineP95).toBeDefined();

        const resolvedPath = typeof ep.path === 'function' ? ep.path(ctx) : ep.path;
        const resolvedPow = ep.powDifficulty?.(ctx);
        const resolvedToken = ep.token?.(ctx);
        const resolvedBody = ep.body?.(ctx);

        const result = await benchmark(
          ep.name,
          async () => {
            const res = await request(ep.method, resolvedPath, {
              powDifficulty: resolvedPow,
              token: resolvedToken,
              body: resolvedBody,
            });
            // Ensure the request actually succeeded (don't measure error responses)
            expect(res.status).toBeLessThan(400);
          },
          ITERATIONS,
        );

        result.baseline = baselineP95;
        ctx.endpointResults.push(result);

        console.log(
          `  ${ep.name}: min=${result.min}ms p50=${result.p50}ms p95=${result.p95}ms max=${result.max}ms (baseline=${baselineP95}ms)`,
        );

        expect(result.p95).toBeLessThanOrEqual(baselineP95!);
      });
    }
  });
}
