/**
 * One-shot generator for the known-vault import fixture.
 *
 * Produces two files alongside this script:
 *   known-vault.json    — plain JSON in VaultDownloadResponse shape
 *   known-vault.vault.gz — gzip-compressed copy of the same bytes
 *
 * The password is intentionally documented in `known-vault.ts` because this
 * is a test fixture, not a credential.
 *
 * Run with:  npx tsx frontend/e2e/fixtures/generate-known-vault.ts
 */
import { writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { argon2id } from 'hash-wasm';
import {
  ARGON2_PARAMS,
  AES_PARAMS,
  SALT_LENGTH,
  ENCRYPTION_ALGORITHM,
  type VaultDownloadResponse,
  type VaultIndexFile,
  type VaultItemsFile,
} from '@passvault/shared';
import {
  KNOWN_VAULT_PASSWORD,
  KNOWN_VAULT_JSON_PATH,
  KNOWN_VAULT_GZ_PATH,
} from './known-vault.js';

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

async function main(): Promise<void> {
  const now = new Date().toISOString();

  const indexFile: VaultIndexFile = {
    version: 2,
    entries: [
      {
        id: 'fixture-item-1',
        name: 'Fixture Login',
        category: 'login',
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
      },
      {
        id: 'fixture-item-2',
        name: 'Fixture Note',
        category: 'note',
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
      },
    ],
  };

  const itemsFile: VaultItemsFile = {
    version: 2,
    items: {
      'fixture-item-1': {
        id: 'fixture-item-1',
        name: 'Fixture Login',
        category: 'login',
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
        username: 'fixture@example.com',
        password: 'fixture-secret',
        url: 'https://example.com',
      },
      'fixture-item-2': {
        id: 'fixture-item-2',
        name: 'Fixture Note',
        category: 'note',
        createdAt: now,
        updatedAt: now,
        warningCodes: [],
        format: 'raw',
        text: 'A fixture note for the import e2e test.',
      },
    },
  };

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(KNOWN_VAULT_PASSWORD, salt);

  const encryptedIndex = await encryptString(key, JSON.stringify(indexFile));
  const encryptedItems = await encryptString(key, JSON.stringify(itemsFile));

  const payload: VaultDownloadResponse = {
    encryptedIndex,
    encryptedItems,
    encryptionSalt: bytesToBase64(salt),
    algorithm: ENCRYPTION_ALGORITHM,
    parameters: {
      argon2: {
        memory: ARGON2_PARAMS.memory,
        iterations: ARGON2_PARAMS.iterations,
        parallelism: ARGON2_PARAMS.parallelism,
        hashLength: ARGON2_PARAMS.hashLength,
      },
      aes: {
        keySize: AES_PARAMS.keyLength,
        ivSize: AES_PARAMS.ivLength,
        tagSize: AES_PARAMS.tagLength,
      },
    },
    lastModified: now,
    username: 'fixture@e2e.local',
  };

  const json = JSON.stringify(payload, null, 2);
  writeFileSync(KNOWN_VAULT_JSON_PATH, json, 'utf-8');
  writeFileSync(KNOWN_VAULT_GZ_PATH, gzipSync(Buffer.from(json, 'utf-8')));

  console.log(`wrote ${KNOWN_VAULT_JSON_PATH} (${json.length} bytes)`);
  console.log(`wrote ${KNOWN_VAULT_GZ_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
