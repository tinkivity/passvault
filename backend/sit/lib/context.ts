export const ctx = {
  baseUrl: process.env.SIT_BASE_URL ?? '',
  env: process.env.SIT_ENV ?? 'dev',
  adminEmail: process.env.SIT_ADMIN_EMAIL ?? '',
  adminOtp: process.env.SIT_ADMIN_OTP ?? '',
  adminPassword: '',     // set in scenario 01
  adminToken: '',        // set in scenario 01
  adminUserId: '',       // set in scenario 01

  // Pro user (created in scenario 02)
  proUserEmail: '',
  proUserOtp: '',
  proUserId: '',
  proUserPassword: '',
  proUserToken: '',

  // Free user (created in scenario 02)
  freeUserEmail: '',
  freeUserOtp: '',
  freeUserId: '',

  // Vault data
  vaultId: '',
  vaultSalt: '',
  secondVaultId: '',

  // Tracking for cleanup
  createdUserIds: [] as string[],
  createdVaultIds: [] as string[],
};
