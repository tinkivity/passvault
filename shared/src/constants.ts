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
  ADMIN_LOGIN: '/api/admin/login',
  ADMIN_CHANGE_PASSWORD: '/api/admin/change-password',
  ADMIN_PASSKEY_CHALLENGE: '/api/admin/passkey/challenge',
  ADMIN_PASSKEY_VERIFY: '/api/admin/passkey/verify',
  ADMIN_PASSKEY_REGISTER_CHALLENGE: '/api/admin/passkey/register/challenge',
  ADMIN_PASSKEY_REGISTER: '/api/admin/passkey/register',
  ADMIN_USERS: '/api/admin/users',
  ADMIN_USER_VAULT: '/api/admin/vault',
  VAULT: '/api/vault',
  VAULT_DOWNLOAD: '/api/vault/download',
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
  INVALID_USERNAME: 'Username must be 3-30 characters, alphanumeric with hyphens/underscores',
  POW_REQUIRED: 'Proof of work required',
  POW_INVALID: 'Invalid proof of work solution',
  POW_EXPIRED: 'Proof of work challenge expired',
  FILE_TOO_LARGE: 'File exceeds maximum size of 1MB',
  ACCOUNT_LOCKED: 'Account temporarily locked due to too many failed attempts',
} as const;

// Limits
export const LIMITS = {
  MAX_FILE_SIZE_BYTES: 1_048_576, // 1 MB
  OTP_LENGTH: 16,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  USERNAME_PATTERN: /^[a-zA-Z0-9_-]+$/,
  RATE_LIMIT_FAILED_ATTEMPTS: 5,
  RATE_LIMIT_WINDOW_MINUTES: 15,
  MAX_PASSWORD_LENGTH: 1024,
} as const;
