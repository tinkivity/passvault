import { describe, it, expect, beforeAll } from 'vitest';
import { request, pow } from '../lib/client.js';
import { load, save, type SitContext } from '../lib/context.js';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import type { VaultSummary, VaultGetResponse, VaultDownloadResponse } from '@passvault/shared';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

let ctx: SitContext;

describe('04 — Vault Lifecycle', () => {
  beforeAll(() => { ctx = load(); });

  it('creates vault -> vaultId + encryptionSalt', async () => {
    const res = await request<{ success: boolean; data: VaultSummary }>('POST', API_PATHS.VAULTS, {
      body: { displayName: 'SIT Test Vault' },
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.vaultId).toBeDefined();
    expect(res.data.data.encryptionSalt).toBeDefined();

    ctx.vaultId = res.data.data.vaultId;
    ctx.vaultSalt = res.data.data.encryptionSalt;
    ctx.createdVaultIds.push(ctx.vaultId);
    save(ctx);
  });

  it('lists vaults -> contains created vault', async () => {
    const res = await request<{ success: boolean; data: VaultSummary[] }>('GET', API_PATHS.VAULTS, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const ids = res.data.data.map(v => v.vaultId);
    expect(ids).toContain(ctx.vaultId);
  });

  it('gets vault index (empty) -> empty content', async () => {
    const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);

    const res = await request<{ success: boolean; data: VaultGetResponse }>('GET', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // Newly created vault has empty encrypted fields
    expect(res.data.data.encryptedIndex).toBe('');
    expect(res.data.data.encryptedItems).toBe('');
  });

  it('renames vault -> success', async () => {
    const path = `/api/vaults/${ctx.vaultId}`;

    const res = await request<{ success: boolean; data: VaultSummary }>('PATCH', path, {
      body: { displayName: 'SIT Renamed Vault' },
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.displayName).toBe('SIT Renamed Vault');
  });

  it('creates second vault (pro can have 10) -> success', async () => {
    const res = await request<{ success: boolean; data: VaultSummary }>('POST', API_PATHS.VAULTS, {
      body: { displayName: 'SIT Second Vault' },
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.vaultId).toBeDefined();

    ctx.secondVaultId = res.data.data.vaultId;
    ctx.createdVaultIds.push(ctx.secondVaultId);
    save(ctx);
  });

  it('deletes second vault -> success', async () => {
    const path = `/api/vaults/${ctx.secondVaultId}`;

    const res = await request<{ success: boolean }>('DELETE', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('cannot delete last vault -> error', async () => {
    const path = `/api/vaults/${ctx.vaultId}`;

    const res = await request<{ success: boolean; error: string }>('DELETE', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(400);
    expect(res.data.error).toBe(ERRORS.CANNOT_DELETE_LAST_VAULT);
  });

  it('downloads vault -> returns encrypted data', async () => {
    const path = API_PATHS.VAULT_DOWNLOAD.replace('{vaultId}', ctx.vaultId);

    const res = await request<{ success: boolean; data: VaultDownloadResponse }>('GET', path, {
      token: ctx.proUserToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.encryptionSalt).toBeDefined();
    expect(res.data.data.algorithm).toBe('argon2id+aes-256-gcm');
    expect(res.data.data.parameters).toBeDefined();
    expect(res.data.data.username).toBe(ctx.proUserEmail);
  });
});
