import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { request, pow } from '../lib/client.js';
import { ctx } from '../lib/context.js';
import { deriveKey, encrypt, decrypt } from '../lib/crypto.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { VaultPutResponse, VaultGetResponse } from '@passvault/shared';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

// The backend uses split format: encryptedIndex + encryptedItems
// Index: { version: 2, entries: [{ id, name, category, createdAt, updatedAt, warningCodes }] }
// Items: { version: 2, items: { [id]: fullItem } }

const now = new Date().toISOString();

const items = [
  {
    id: randomUUID(),
    name: 'Test Login',
    category: 'login' as const,
    username: 'test@example.com',
    password: 'TestPass123!',
    createdAt: now,
    updatedAt: now,
    warningCodes: [] as string[],
  },
  {
    id: randomUUID(),
    name: 'Test Note',
    category: 'note' as const,
    format: 'raw' as const,
    text: 'Hello SIT',
    createdAt: now,
    updatedAt: now,
    warningCodes: [] as string[],
  },
  {
    id: randomUUID(),
    name: 'Test WiFi',
    category: 'wifi' as const,
    ssid: 'SIT-Network',
    password: 'WifiPass123!',
    createdAt: now,
    updatedAt: now,
    warningCodes: [] as string[],
  },
];

interface SitVaultItem {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  warningCodes: string[];
  [key: string]: unknown;
}

function buildIndex(itemList: SitVaultItem[]) {
  return {
    version: 2,
    entries: itemList.map(i => ({
      id: i.id,
      name: i.name,
      category: i.category,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      warningCodes: i.warningCodes,
    })),
  };
}

function buildItems(itemList: SitVaultItem[]) {
  return {
    version: 2,
    items: Object.fromEntries(itemList.map(i => [i.id, i])),
  };
}

describe('05 — Vault Items', () => {
  let vaultKey: Buffer;

  it('saves vault with 3 items -> encrypt index+items, PUT, success', async () => {
    const salt = Buffer.from(ctx.vaultSalt, 'base64');
    vaultKey = await deriveKey(ctx.proUserPassword, salt);

    const indexFile = buildIndex(items);
    const itemsFile = buildItems(items);

    const encryptedIndex = encrypt(JSON.stringify(indexFile), vaultKey);
    const encryptedItems = encrypt(JSON.stringify(itemsFile), vaultKey);

    const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);
    const res = await request<{ success: boolean; data: VaultPutResponse }>('PUT', path, {
      body: { encryptedIndex, encryptedItems },
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.lastModified).toBeDefined();
  });

  it('gets vault index -> decrypt, 3 entries', async () => {
    const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);
    const res = await request<{ success: boolean; data: VaultGetResponse }>('GET', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.encryptedIndex).toBeTruthy();

    const decrypted = decrypt(res.data.data.encryptedIndex, vaultKey);
    const parsed = JSON.parse(decrypted) as { version: number; entries: unknown[] };
    expect(parsed.version).toBe(2);
    expect(parsed.entries).toHaveLength(3);
  });

  it('gets vault items -> decrypt, 3 items with full data', async () => {
    const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);
    const res = await request<{ success: boolean; data: VaultGetResponse }>('GET', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.data.encryptedItems).toBeTruthy();

    const decrypted = decrypt(res.data.data.encryptedItems, vaultKey);
    const parsed = JSON.parse(decrypted) as { version: number; items: Record<string, unknown> };
    expect(parsed.version).toBe(2);
    expect(Object.keys(parsed.items)).toHaveLength(3);
  });

  it('updates vault (modify 1, add 1) -> success', async () => {
    const updatedItems = [
      ...items.map(i =>
        i.name === 'Test Login'
          ? { ...i, password: 'UpdatedPass456!', updatedAt: new Date().toISOString() }
          : i,
      ),
      {
        id: randomUUID(),
        name: 'Test Credit Card',
        category: 'credit_card' as const,
        cardholderName: 'SIT Tester',
        cardNumber: '4111111111111111',
        expiryMonth: '12',
        expiryYear: '2028',
        cvv: '999',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        warningCodes: [] as string[],
      },
    ];

    const indexFile = buildIndex(updatedItems);
    const itemsFile = buildItems(updatedItems);

    const encryptedIndex = encrypt(JSON.stringify(indexFile), vaultKey);
    const encryptedItems = encrypt(JSON.stringify(itemsFile), vaultKey);

    const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);
    const res = await request<{ success: boolean; data: VaultPutResponse }>('PUT', path, {
      body: { encryptedIndex, encryptedItems },
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('verifies index has 4 entries', async () => {
    const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);
    const res = await request<{ success: boolean; data: VaultGetResponse }>('GET', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    const decrypted = decrypt(res.data.data.encryptedIndex, vaultKey);
    const parsed = JSON.parse(decrypted) as { version: number; entries: unknown[] };
    expect(parsed.entries).toHaveLength(4);
  });

  it('gets warning codes catalog -> contains all codes', async () => {
    const res = await request<{ success: boolean; data: Array<{ code: string }> }>('GET', API_PATHS.CONFIG_WARNING_CODES);

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const codes = res.data.data.map(c => c.code);
    expect(codes).toContain('duplicate_password');
    expect(codes).toContain('too_simple_password');
  });
});
