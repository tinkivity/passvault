import { argon2id } from 'hash-wasm';
import { ARGON2_PARAMS, AES_PARAMS, SALT_LENGTH } from '@passvault/shared';

// Per-vault derived keys — never serialized
const derivedKeys = new Map<string, CryptoKey>();

/**
 * Derive an AES-256-GCM key from a vault password and its stored salt.
 * The salt is base64-encoded (as stored in DynamoDB).
 */
export async function deriveKey(vaultId: string, password: string, saltBase64: string): Promise<void> {
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

  const key = await crypto.subtle.importKey(
    'raw',
    hashBytes as Uint8Array<ArrayBuffer>,
    { name: AES_PARAMS.algorithm, length: AES_PARAMS.keyLength },
    false,
    ['encrypt', 'decrypt'],
  );

  derivedKeys.set(vaultId, key);
}

/**
 * Encrypt plaintext string for the given vault. Returns base64-encoded `iv || ciphertext`.
 */
export async function encrypt(vaultId: string, plaintext: string): Promise<string> {
  const key = derivedKeys.get(vaultId);
  if (!key) throw new Error('Encryption key not derived for vault');

  const iv = crypto.getRandomValues(new Uint8Array(AES_PARAMS.ivLength));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_PARAMS.algorithm, iv, tagLength: AES_PARAMS.tagLength },
    key,
    encoded,
  );

  // Prepend IV: iv (12 bytes) + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypt base64-encoded `iv || ciphertext` for the given vault. Returns plaintext string.
 */
export async function decrypt(vaultId: string, encryptedBase64: string): Promise<string> {
  const key = derivedKeys.get(vaultId);
  if (!key) throw new Error('Encryption key not derived for vault');

  const combined = base64ToBytes(encryptedBase64);
  const iv = combined.slice(0, AES_PARAMS.ivLength);
  const ciphertext = combined.slice(AES_PARAMS.ivLength);

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_PARAMS.algorithm, iv, tagLength: AES_PARAMS.tagLength },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Verify a password by attempting to decrypt a known encrypted blob.
 * Uses a temporary local key — does NOT overwrite any vault key.
 * Returns true if decryption succeeds, false if the password is wrong.
 */
export async function verifyPassword(password: string, saltBase64: string, encryptedContent: string): Promise<boolean> {
  try {
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

    const tempKey = await crypto.subtle.importKey(
      'raw',
      hashBytes as Uint8Array<ArrayBuffer>,
      { name: AES_PARAMS.algorithm, length: AES_PARAMS.keyLength },
      false,
      ['decrypt'],
    );

    const combined = base64ToBytes(encryptedContent);
    const iv = combined.slice(0, AES_PARAMS.ivLength);
    const ciphertext = combined.slice(AES_PARAMS.ivLength);

    await crypto.subtle.decrypt(
      { name: AES_PARAMS.algorithm, iv, tagLength: AES_PARAMS.tagLength },
      tempKey,
      ciphertext,
    );

    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the in-memory key(s) on logout or vault lock.
 * If vaultId is provided, only that vault's key is removed.
 * Otherwise all keys are cleared.
 */
export function clearKey(vaultId?: string): void {
  if (vaultId !== undefined) {
    derivedKeys.delete(vaultId);
  } else {
    derivedKeys.clear();
  }
}

export function hasKey(vaultId: string): boolean {
  return derivedKeys.has(vaultId);
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
