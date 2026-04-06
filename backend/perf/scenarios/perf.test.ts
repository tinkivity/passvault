/**
 * PassVault Performance Test Suite
 *
 * Main runner — orchestrates setup, benchmarks, and report generation.
 * Runs via: npx vitest run --config backend/perf/vitest.config.ts
 *
 * Required env vars:
 *   SIT_BASE_URL  — API base URL (e.g. https://beta.passvault.example.com)
 *   SIT_ENV       — environment name (dev|beta|prod)
 *   SIT_ADMIN_EMAIL — admin username
 *   SIT_ADMIN_OTP   — admin one-time password (or current password)
 */

import { afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createPerfContext } from '../lib/context.js';
import { generateTerminalReport, generateHtmlReport, generateMarkdownReport } from '../lib/report.js';
import { setupPerf } from './00-setup.js';
import { responseTimeScenarios } from './01-response-times.js';
import { concurrentScenarios } from './02-concurrent.js';
import { payloadScenarios } from './03-payload-size.js';
import { request, pow } from '../../sit/lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import baselines from '../baselines.json';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const ctx = createPerfContext();

// Register scenarios in order
setupPerf(ctx);
responseTimeScenarios(ctx);
concurrentScenarios(ctx);
payloadScenarios(ctx);

afterAll(async () => {
  // -------------------------------------------------------------------------
  // Cleanup: delete test user (vault is deleted with the user)
  // -------------------------------------------------------------------------
  for (const userId of ctx.createdUserIds) {
    try {
      const path = API_PATHS.ADMIN_USER.replace('{userId}', userId);
      await request('DELETE', path, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });
    } catch (err) {
      console.error(`Perf cleanup: failed to delete user ${userId}:`, err);
    }
  }

  // -------------------------------------------------------------------------
  // Generate reports
  // -------------------------------------------------------------------------
  const allResults = {
    endpoints: ctx.endpointResults,
    concurrent: ctx.concurrentResults,
    payload: ctx.payloadResults,
  };

  // Terminal report
  const terminalReport = generateTerminalReport(allResults, baselines);
  console.log(terminalReport);

  // JSON results
  const outputDir = resolve(dirname(new URL(import.meta.url).pathname), '..');
  const jsonPath = resolve(outputDir, 'results.json');
  writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));
  console.log(`  Results JSON:  ${jsonPath}`);

  // HTML report
  const htmlPath = resolve(outputDir, 'perf-report.html');
  writeFileSync(htmlPath, generateHtmlReport(allResults, baselines));
  console.log(`  HTML report:   ${htmlPath}`);

  // Markdown report
  const mdDir = resolve(outputDir, '..', '..', 'docs', 'perf');
  mkdirSync(mdDir, { recursive: true });
  const mdPath = resolve(mdDir, 'report.md');
  writeFileSync(mdPath, generateMarkdownReport(allResults, baselines));
  console.log(`  MD report:     ${mdPath}`);
});
