import { argon2id } from 'hash-wasm';
import { ARGON2_PARAMS, AES_PARAMS, SALT_LENGTH } from '@passvault/shared';

// Derived key held in memory — never serialized
let derivedKey: CryptoKey | null = null;

/**
 * Derive an AES-256-GCM key from the user's password and their stored salt.
 * The salt is base64-encoded (as stored in DynamoDB).
 */
export async function deriveKey(password: string, saltBase64: string): Promise<void> {
  const salt = base64ToBytes(saltBase64);

  const hashBytes = await argon2id({
    password,
    salt,
    iterations: ARGON2_PARAMS.iterations,
    memorySize: ARGON2_PARAMS.memory,
    parallelism: ARGON2_PARAMS.parallelism,
    hashLength: ARGON2_PARAMS.hashLength,
    outputType: 'binary',
  });

  derivedKey = await crypto.subtle.importKey(
    'raw',
    hashBytes as Uint8Array<ArrayBuffer>,
    { name: AES_PARAMS.algorithm, length: AES_PARAMS.keyLength },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext string. Returns base64-encoded `iv || ciphertext`.
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!derivedKey) throw new Error('Encryption key not derived');

  const iv = crypto.getRandomValues(new Uint8Array(AES_PARAMS.ivLength));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_PARAMS.algorithm, iv, tagLength: AES_PARAMS.tagLength },
    derivedKey,
    encoded,
  );

  // Prepend IV: iv (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypt base64-encoded `iv || ciphertext`. Returns plaintext string.
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  if (!derivedKey) throw new Error('Encryption key not derived');

  const combined = base64ToBytes(encryptedBase64);
  const iv = combined.slice(0, AES_PARAMS.ivLength);
  const ciphertext = combined.slice(AES_PARAMS.ivLength);

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_PARAMS.algorithm, iv, tagLength: AES_PARAMS.tagLength },
    derivedKey,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Clear the in-memory key on logout.
 */
export function clearKey(): void {
  derivedKey = null;
}

export function hasKey(): boolean {
  return derivedKey !== null;
}

// ---- Helpers ----------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  // Handle both standard base64 and base64url
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export { SALT_LENGTH };
