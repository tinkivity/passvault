export const ARGON2_PARAMS = {
  memory: 65536,      // 64 MB
  iterations: 3,
  parallelism: 4,
  hashLength: 32,     // 256-bit key
} as const;

export const AES_PARAMS = {
  algorithm: 'AES-GCM' as const,
  keyLength: 256,     // bits
  ivLength: 12,       // bytes (96 bits)
  tagLength: 128,     // bits
} as const;

export const SALT_LENGTH = 32;  // bytes (256 bits)

export const ENCRYPTION_ALGORITHM = 'argon2id+aes-256-gcm';
