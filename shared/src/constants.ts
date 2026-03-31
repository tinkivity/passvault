// API path prefixes
export const API_PATHS = {
  CHALLENGE: '/api/challenge',
  HEALTH: '/api/health',
  AUTH_LOGIN: '/api/auth/login',
  AUTH_CHANGE_PASSWORD: '/api/auth/change-password',
  AUTH_PASSKEY_CHALLENGE: '/api/auth/passkey/challenge',
  AUTH_PASSKEY_VERIFY: '/api/auth/passkey/verify',
  AUTH_PASSKEY_REGISTER_CHALLENGE: '/api/auth/passkey/register/challenge',
  AUTH_PASSKEY_REGISTER: '/api/auth/passkey/register',
  AUTH_VERIFY_EMAIL: '/api/auth/verify-email',
  AUTH_LOGOUT: '/api/auth/logout',
  AUTH_PROFILE: '/api/auth/profile',
  ADMIN_LOGIN: '/api/admin/login',
  ADMIN_CHANGE_PASSWORD: '/api/admin/change-password',
  ADMIN_PASSKEY_CHALLENGE: '/api/admin/passkey/challenge',
  ADMIN_PASSKEY_VERIFY: '/api/admin/passkey/verify',
  ADMIN_PASSKEY_REGISTER_CHALLENGE: '/api/admin/passkey/register/challenge',
  ADMIN_PASSKEY_REGISTER: '/api/admin/passkey/register',
  ADMIN_USERS: '/api/admin/users',
  ADMIN_USER_VAULT: '/api/admin/vault',
  ADMIN_USER_REFRESH_OTP: '/api/admin/users/refresh-otp',
  ADMIN_USERS_LOCK: '/api/admin/users/lock',
  ADMIN_USERS_UNLOCK: '/api/admin/users/unlock',
  ADMIN_USERS_RETIRE: '/api/admin/users/retire',
  ADMIN_USERS_EXPIRE: '/api/admin/users/expire',
  ADMIN_USERS_EMAIL_VAULT: '/api/admin/users/email-vault',
  ADMIN_USER_UPDATE: '/api/admin/users/update',
  ADMIN_USER_REACTIVATE: '/api/admin/users/reactivate',
  ADMIN_STATS: '/api/admin/stats',
  ADMIN_LOGIN_EVENTS: '/api/admin/login-events',
  VAULTS: '/api/vaults',
  VAULT_NOTIFICATIONS: '/api/vault/notifications',
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
} as const;

// Limits
export const LIMITS = {
  MAX_FILE_SIZE_BYTES: 1_048_576, // 1 MB
  OTP_LENGTH: 16,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: /^[a-zA-Z0-9_-]+$/,  // kept for admin username (legacy)
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  RATE_LIMIT_FAILED_ATTEMPTS: 5,
  RATE_LIMIT_WINDOW_MINUTES: 15,
  MAX_PASSWORD_LENGTH: 1024,
  EMAIL_MAX_LENGTH: 254,
  VAULT_LIMITS: { free: 1, pro: 10 } as Record<string, number>,
} as const;
