/**
 * Shared in-memory context for SIT scenarios.
 *
 * All scenarios run in a single test file, so this object is shared
 * by reference — no file I/O or IPC needed.
 */

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

export function createContext(): SitContext {
  return {
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
}
