import { readFileSync, writeFileSync } from 'fs';

// Use a fixed path (not os.tmpdir() which varies across platforms)
const CTX_FILE = '/tmp/passvault-sit-context.json';

export interface SitContext {
  baseUrl: string;
  env: string;
  adminEmail: string;
  adminOtp: string;
  adminPassword: string;
  adminToken: string;
  adminUserId: string;

  proUserEmail: string;
  proUserOtp: string;
  proUserId: string;
  proUserPassword: string;
  proUserToken: string;

  freeUserEmail: string;
  freeUserOtp: string;
  freeUserId: string;

  vaultId: string;
  vaultSalt: string;
  secondVaultId: string;

  createdUserIds: string[];
  createdVaultIds: string[];
}

const defaults: SitContext = {
  baseUrl: process.env.SIT_BASE_URL ?? '',
  env: process.env.SIT_ENV ?? 'dev',
  adminEmail: process.env.SIT_ADMIN_EMAIL ?? '',
  adminOtp: process.env.SIT_ADMIN_OTP ?? '',
  adminPassword: '',
  adminToken: '',
  adminUserId: '',

  proUserEmail: '',
  proUserOtp: '',
  proUserId: '',
  proUserPassword: '',
  proUserToken: '',

  freeUserEmail: '',
  freeUserOtp: '',
  freeUserId: '',

  vaultId: '',
  vaultSalt: '',
  secondVaultId: '',

  createdUserIds: [],
  createdVaultIds: [],
};

/** Load context from temp file, falling back to env-based defaults. */
export function load(): SitContext {
  try {
    const raw = readFileSync(CTX_FILE, 'utf-8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

/** Save context to temp file so subsequent test files can read it. */
export function save(ctx: SitContext): void {
  writeFileSync(CTX_FILE, JSON.stringify(ctx, null, 2));
}

/** Reset context file (call from sitest.sh before test run). */
export function reset(): void {
  save(defaults);
}

// For backward compat: export a mutable ctx that starts from file or defaults
export const ctx = load();
