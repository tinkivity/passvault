// API path prefixes
export const API_PATHS = {
  CHALLENGE: '/api/challenge',
  HEALTH: '/api/health',
  AUTH_LOGIN: '/api/auth/login',
  AUTH_CHANGE_PASSWORD: '/api/auth/change-password',
  AUTH_CHANGE_PASSWORD_SELF: '/api/auth/change-password/self',
  AUTH_PASSKEY_CHALLENGE: '/api/auth/passkey/challenge',
  AUTH_PASSKEY_VERIFY: '/api/auth/passkey/verify',
  AUTH_PASSKEY_REGISTER_CHALLENGE: '/api/auth/passkey/register/challenge',
  AUTH_PASSKEY_REGISTER: '/api/auth/passkey/register',
  AUTH_VERIFY_EMAIL: '/api/auth/verify-email',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_PROFILE: '/api/auth/profile',
  AUTH_PASSKEYS: '/api/auth/passkeys',
  AUTH_PASSKEY_REVOKE: '/api/auth/passkeys/{credentialId}',
  ADMIN_LOGIN: '/api/admin/login',
  ADMIN_CHANGE_PASSWORD: '/api/admin/change-password',
  ADMIN_PASSKEY_CHALLENGE: '/api/admin/passkey/challenge',
  ADMIN_PASSKEY_VERIFY: '/api/admin/passkey/verify',
  ADMIN_PASSKEY_REGISTER_CHALLENGE: '/api/admin/passkey/register/challenge',
  ADMIN_PASSKEY_REGISTER: '/api/admin/passkey/register',
  ADMIN_PASSKEYS: '/api/admin/passkeys',
  ADMIN_PASSKEY_REVOKE: '/api/admin/passkeys/{credentialId}',
  ADMIN_USERS: '/api/admin/users',
  ADMIN_USER: '/api/admin/users/{userId}',
  ADMIN_USER_VAULT: '/api/admin/users/{userId}/vault',
  ADMIN_USER_REFRESH_OTP: '/api/admin/users/{userId}/refresh-otp',
  ADMIN_USER_LOCK: '/api/admin/users/{userId}/lock',
  ADMIN_USER_UNLOCK: '/api/admin/users/{userId}/unlock',
  ADMIN_USER_RETIRE: '/api/admin/users/{userId}/retire',
  ADMIN_USER_EXPIRE: '/api/admin/users/{userId}/expire',
  ADMIN_USER_EMAIL_VAULT: '/api/admin/users/{userId}/email-vault',
  ADMIN_USER_REACTIVATE: '/api/admin/users/{userId}/reactivate',
  ADMIN_USER_RESET: '/api/admin/users/{userId}/reset',
  ADMIN_STATS: '/api/admin/stats',
  ADMIN_LOGIN_EVENTS: '/api/admin/login-events',
  ADMIN_AUDIT_EVENTS: '/api/admin/audit-events',
  ADMIN_AUDIT_CONFIG: '/api/admin/audit-config',
  VAULTS: '/api/vaults',
  VAULT: '/api/vaults/{vaultId}',
  VAULT_INDEX: '/api/vaults/{vaultId}/index',
  VAULT_ITEMS: '/api/vaults/{vaultId}/items',
  VAULT_DOWNLOAD: '/api/vaults/{vaultId}/download',
  VAULT_EMAIL: '/api/vaults/{vaultId}/email',
  VAULT_NOTIFICATIONS: '/api/vaults/notifications',
  CONFIG_WARNING_CODES: '/api/config/warning-codes',
} as const;

// PoW header names
export const POW_HEADERS = {
  SOLUTION: 'x-pow-solution',
  NONCE: 'x-pow-nonce',
  TIMESTAMP: 'x-pow-timestamp',
} as const;

// PoW configuration
export const POW_CONFIG = {
  CHALLENGE_TTL_SECONDS: 60,
  NONCE_BYTES: 32,
  DIFFICULTY: {
    LOW: 16,     // public endpoints (~100ms)
    MEDIUM: 18,  // login (~200ms)
    HIGH: 20,    // file ops, admin (~500ms)
  },
} as const;

// Passkey configuration
export const PASSKEY_CONFIG = {
  RP_NAME: 'PassVault',
  CHALLENGE_JWT_EXPIRY_SECONDS: 300,
  PASSKEY_TOKEN_EXPIRY_SECONDS: 300,
  CHALLENGE_BYTES: 32,
} as const;

// Error messages
export const ERRORS = {
  INVALID_CREDENTIALS: 'Invalid username or password',
  INVALID_PASSKEY: 'Invalid passkey',
  PASSKEY_SETUP_REQUIRED: 'Passkey setup required',
  PASSKEY_NOT_REGISTERED: 'No passkey registered for this account',
  PASSWORD_CHANGE_REQUIRED: 'Password change required',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  ADMIN_NOT_ACTIVE: 'Admin account setup not complete',
  USER_EXISTS: 'Username already exists',
  INVALID_USERNAME: 'Invalid email address',
  INVALID_EMAIL: 'Invalid email address',
  POW_REQUIRED: 'Proof of work required',
  POW_INVALID: 'Invalid proof of work solution',
  POW_EXPIRED: 'Proof of work challenge expired',
  FILE_TOO_LARGE: 'File exceeds maximum size of 1MB',
  ACCOUNT_LOCKED: 'Account temporarily locked due to too many failed attempts',
  ACCOUNT_SUSPENDED: 'Your account has been suspended. Please contact your administrator.',
  ACCOUNT_EXPIRED: 'Your account has expired. Please contact your administrator.',
  OTP_EXPIRED: 'One-time password has expired',
  NO_EMAIL_ADDRESS: 'No email address on file for this account',
  EMAIL_VERIFICATION_INVALID: 'Invalid or expired verification code',
  PASSWORD_SAME_AS_OTP: 'New password must be different from the one-time password',
  VAULT_LIMIT_REACHED: 'Vault limit reached for your plan',
  VAULT_NOT_FOUND: 'Vault not found',
  CANNOT_DELETE_LAST_VAULT: 'Cannot delete the last vault',
  PASSKEY_LIMIT_REACHED: 'Maximum number of passkeys reached',
  PASSKEY_DUPLICATE_PROVIDER: 'A passkey from this provider is already registered',
  PASSKEY_CANNOT_REVOKE_LAST: 'Cannot revoke the last passkey',
  PASSKEY_NOT_FOUND: 'Passkey not found',
  CANNOT_MODIFY_SELF: 'Cannot modify your own admin account',
} as const;

// Limits
export const LIMITS = {
  MAX_FILE_SIZE_BYTES: 1_048_576, // 1 MB
  OTP_LENGTH: 16,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  RATE_LIMIT_FAILED_ATTEMPTS: 5,
  RATE_LIMIT_WINDOW_MINUTES: 15,
  MAX_PASSWORD_LENGTH: 1024,
  EMAIL_MAX_LENGTH: 254,
  VAULT_LIMITS: { free: 1, pro: 10, administrator: 10 } as Record<string, number>,
  MAX_PASSKEYS_USER: 10,
  MAX_PASSKEYS_ADMIN: 2,
  MAX_PASSKEY_NAME_LENGTH: 64,
} as const;
