/**
 * Shared in-memory context for perf scenarios.
 *
 * All scenarios run in a single test file, so this object is shared
 * by reference — no file I/O or IPC needed.
 */

import type { BenchmarkResult } from './measure.js';

export interface PerfContext {
  baseUrl: string;
  env: string;

  // Admin credentials (from env vars)
  adminEmail: string;
  adminOtp: string;
  adminPassword: string;
  adminToken: string;
  adminUserId: string;

  // Test user (created during setup)
  testUserEmail: string;
  testUserOtp: string;
  testUserId: string;
  testUserPassword: string;
  testUserToken: string;

  // Vault
  vaultId: string;
  vaultSalt: string;

  // Cleanup tracking
  createdUserIds: string[];
  createdVaultIds: string[];

  // Results collected across scenarios
  endpointResults: BenchmarkResult[];
  concurrentResults: BenchmarkResult[];
  payloadResults: BenchmarkResult[];
}

export function createPerfContext(): PerfContext {
  return {
    baseUrl: process.env.SIT_BASE_URL ?? '',
    env: process.env.SIT_ENV ?? 'dev',

    adminEmail: process.env.SIT_ADMIN_EMAIL ?? '',
    adminOtp: process.env.SIT_ADMIN_OTP ?? '',
    adminPassword: process.env.SIT_ADMIN_PASSWORD ?? '',
    adminToken: '',
    adminUserId: '',

    testUserEmail: '',
    testUserOtp: '',
    testUserId: '',
    testUserPassword: '',
    testUserToken: '',

    vaultId: '',
    vaultSalt: '',

    createdUserIds: [],
    createdVaultIds: [],

    endpointResults: [],
    concurrentResults: [],
    payloadResults: [],
  };
}
