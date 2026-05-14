/**
 * Vault seeding for E2E tests. Creates a vault for the given user (admin or
 * regular) and, optionally, populates it with a seed item using the same
 * Argon2id+AES-GCM client-side encryption the browser uses. Run from Node —
 * the Web Crypto API is available globally in Node 22+; Argon2id comes from
 * `hash-wasm` (already a frontend dep).
 *
 * The seeded item lets specs 04 (unlock) and 05 (items) work: an empty vault
 * unlocks with any password (no ciphertext to decrypt), so the
 * "wrong password shows error" assertion needs at least one encrypted entry.
 */
import type { APIRequestContext } from '@playwright/test';
import { argon2id } from 'hash-wasm';
import {
  ARGON2_PARAMS,
  AES_PARAMS,
  type VaultIndexFile,
  type VaultItemsFile,
} from '@passvault/shared';
import { postWithPoW, putWithPoW, deleteWithPoW, POW_DIFFICULTY } from './pow.js';

export interface SeededVault {
  vaultId: string;
  encryptionSalt: string;
  password: string;
  /** The item name in the seeded index, if `seedItem` was provided. */
  seedItemName: string | null;
}

export interface SeedVaultOpts {
  displayName: string;
  password: string;
  /**
   * When set, writes a single login item into the vault as encrypted index +
   * items files. Leave undefined for an empty vault (e.g. spec 05 which
   * creates its first item via the UI).
   */
  seedItem?: {
    name: string;
    username: string;
    password: string;
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return Buffer.from(binary, 'binary').toString('base64');
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const hashBytes = await argon2id({
    password,
    salt,
    iterations: ARGON2_PARAMS.iterations,
    memorySize: ARGON2_PARAMS.memory,
    parallelism: ARGON2_PARAMS.parallelism,
    hashLength: ARGON2_PARAMS.hashLength,
    outputType: 'binary',
  });
  return crypto.subtle.importKey(
    'raw',
    hashBytes as Uint8Array<ArrayBuffer>,
    { name: AES_PARAMS.algorithm, length: AES_PARAMS.keyLength },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_PARAMS.ivLength));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_PARAMS.algorithm, iv, tagLength: AES_PARAMS.tagLength },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

export async function seedVaultViaAPI(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  opts: SeedVaultOpts,
): Promise<SeededVault> {
  // 1. Create the vault via API. The backend hands back an `encryptionSalt`
  //    we then derive the AES key from with the supplied password.
  const { body: createBody } = await postWithPoW(request, apiBase, '/api/vaults', {
    headers: { Authorization: `Bearer ${token}` },
    data: { displayName: opts.displayName },
    difficulty: POW_DIFFICULTY.HIGH,
  });
  if (!createBody.success) {
    throw new Error(`vault create failed: ${JSON.stringify(createBody)}`);
  }
  const data = createBody.data as { vaultId: string; encryptionSalt: string };
  const { vaultId, encryptionSalt } = data;

  if (!opts.seedItem) {
    return { vaultId, encryptionSalt, password: opts.password, seedItemName: null };
  }

  // 2. Build the plaintext index + items files (vault v2 layout) and encrypt
  //    them under the user-supplied password.
  const now = new Date().toISOString();
  const itemId = `seed-${Date.now()}`;
  const indexFile: VaultIndexFile = {
    version: 2,
    entries: [
      {
        id: itemId,
        name: opts.seedItem.name,
        category: 'login',
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
      },
    ],
  };
  const itemsFile: VaultItemsFile = {
    version: 2,
    items: {
      [itemId]: {
        id: itemId,
        name: opts.seedItem.name,
        category: 'login',
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
        username: opts.seedItem.username,
        password: opts.seedItem.password,
      },
    },
  };

  const salt = base64ToBytes(encryptionSalt);
  const key = await deriveKey(opts.password, salt);
  const encryptedIndex = await encryptString(key, JSON.stringify(indexFile));
  const encryptedItems = await encryptString(key, JSON.stringify(itemsFile));

  // 3. PUT the encrypted content. Backend stores the bytes as-is.
  const { body: putBody, status } = await putWithPoW(request, apiBase, `/api/vaults/${vaultId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { encryptedIndex, encryptedItems },
    difficulty: POW_DIFFICULTY.HIGH,
  });
  if (!putBody.success) {
    throw new Error(`vault PUT failed (${status}): ${JSON.stringify(putBody)}`);
  }

  return { vaultId, encryptionSalt, password: opts.password, seedItemName: opts.seedItem.name };
}

export async function deleteSeededVault(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  vaultId: string,
): Promise<void> {
  await deleteWithPoW(request, apiBase, `/api/vaults/${vaultId}`, {
    headers: { Authorization: `Bearer ${token}` },
    difficulty: POW_DIFFICULTY.HIGH,
  }).catch(() => undefined);
}
