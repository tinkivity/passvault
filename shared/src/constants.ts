// API path prefixes
export const API_PATHS = {
  CHALLENGE: '/challenge',
  HEALTH: '/health',
  AUTH_LOGIN: '/auth/login',
  AUTH_CHANGE_PASSWORD: '/auth/change-password',
  AUTH_TOTP_SETUP: '/auth/totp/setup',
  AUTH_TOTP_VERIFY: '/auth/totp/verify',
  ADMIN_LOGIN: '/admin/login',
  ADMIN_CHANGE_PASSWORD: '/admin/change-password',
  ADMIN_TOTP_SETUP: '/admin/totp/setup',
  ADMIN_TOTP_VERIFY: '/admin/totp/verify',
  ADMIN_USERS: '/admin/users',
  VAULT: '/vault',
  VAULT_DOWNLOAD: '/vault/download',
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

// TOTP configuration
export const TOTP_CONFIG = {
  ISSUER: 'PassVault',
  DIGITS: 6,
  PERIOD: 30,
  ALGORITHM: 'SHA1',
  WINDOW: 1,  // ±1 time step tolerance
} as const;

// Error messages
export const ERRORS = {
  INVALID_CREDENTIALS: 'Invalid username or password',
  INVALID_TOTP: 'Invalid TOTP code',
  TOTP_NOT_ENABLED: 'TOTP is not enabled in this environment',
  PASSWORD_CHANGE_REQUIRED: 'Password change required',
  TOTP_SETUP_REQUIRED: 'TOTP setup required',
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
} as const;
