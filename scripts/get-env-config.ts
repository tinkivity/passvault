#!/usr/bin/env tsx
/**
 * get-env-config.ts — Print VITE_* env vars derived from shared environment config.
 *
 * Usage:
 *   npx tsx scripts/get-env-config.ts <dev|beta|prod>
 *
 * Output (shell-compatible, suitable for eval or .env.local):
 *   VITE_PASSKEY_REQUIRED=false
 *   VITE_SESSION_TIMEOUT_SECONDS=300
 *   VITE_VAULT_TIMEOUT_SECONDS=600
 */

import { getEnvironmentConfig } from '../shared/src/config/environments.js';

const env = process.argv[2];
if (!env) {
  console.error('Usage: get-env-config.ts <dev|beta|prod>');
  process.exit(1);
}

const c = getEnvironmentConfig(env);

console.log(`VITE_PASSKEY_REQUIRED=${c.features.passkeyRequired}`);
console.log(`VITE_SESSION_TIMEOUT_SECONDS=${c.session.sessionTimeoutSeconds}`);
console.log(`VITE_VAULT_TIMEOUT_SECONDS=${c.session.vaultTimeoutSeconds}`);
