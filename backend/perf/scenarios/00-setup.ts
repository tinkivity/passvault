/**
 * Perf test setup: authenticate admin, create test user, create vault.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { request, pow } from '../../sit/lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type {
  LoginResponse,
  ChangePasswordResponse,
  CreateUserResponse,
  VaultSummary,
  VaultPutResponse,
} from '@passvault/shared';
import type { PerfContext } from '../lib/context.js';
import { testUserEmail } from '../../sit/lib/test-emails.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;
const ts = Date.now();

export function setupPerf(ctx: PerfContext) {
  describe('00 - Perf Setup', () => {
    afterAll(async () => {
      // Cleanup: delete test user and vault on failure or completion
      // (runs even if tests fail so we don't leak resources)
      // Note: actual cleanup is best-effort; the main test runner handles
      // final cleanup in its own afterAll block.
    });

    it('logs in as admin', async () => {
      // Try password first (admin may have been onboarded by a prior SIT run),
      // fall back to OTP if password is empty or login fails.
      const password = ctx.adminPassword || ctx.adminOtp;
      const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.adminEmail, password },
        powDifficulty: pow(MEDIUM),
      });

      if (res.status === 200 && !res.data.data.requirePasswordChange) {
        // Already onboarded — use as-is
        ctx.adminToken = res.data.data.token;
        ctx.adminUserId = res.data.data.userId;
        if (!ctx.adminPassword) ctx.adminPassword = password;
        return;
      }

      // Either OTP login succeeded with requirePasswordChange, or we need to try OTP
      let loginRes = res;
      if (res.status !== 200) {
        // Password failed — try OTP
        loginRes = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
          body: { username: ctx.adminEmail, password: ctx.adminOtp },
          powDifficulty: pow(MEDIUM),
        });
      }

      expect(loginRes.status).toBe(200);
      expect(loginRes.data.success).toBe(true);

      if (loginRes.data.data.requirePasswordChange) {
        ctx.adminToken = loginRes.data.data.token;
        ctx.adminUserId = loginRes.data.data.userId;
        ctx.adminPassword = `PerfAdmin${ts}!Secure`;

        const cpRes = await request<{ success: boolean; data: ChangePasswordResponse }>(
          'POST',
          API_PATHS.AUTH_CHANGE_PASSWORD,
          {
            body: { newPassword: ctx.adminPassword },
            token: ctx.adminToken,
            powDifficulty: pow(HIGH),
          },
        );
        expect(cpRes.status).toBe(200);

        const reLogin = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
          body: { username: ctx.adminEmail, password: ctx.adminPassword },
          powDifficulty: pow(MEDIUM),
        });
        expect(reLogin.status).toBe(200);
        ctx.adminToken = reLogin.data.data.token;
        ctx.adminUserId = reLogin.data.data.userId;
      } else {
        ctx.adminToken = loginRes.data.data.token;
        ctx.adminUserId = loginRes.data.data.userId;
        ctx.adminPassword = password;
      }
    });

    it('creates test user via admin API', async () => {
      ctx.testUserEmail = testUserEmail(`perf-user-${ts}`);

      const res = await request<{ success: boolean; data: CreateUserResponse }>('POST', API_PATHS.ADMIN_USERS, {
        body: { username: ctx.testUserEmail, plan: 'pro', firstName: 'Perf', lastName: 'Tester' },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(201);
      expect(res.data.data.oneTimePassword).toBeDefined();
      expect(res.data.data.userId).toBeDefined();

      ctx.testUserOtp = res.data.data.oneTimePassword;
      ctx.testUserId = res.data.data.userId;
      ctx.createdUserIds.push(ctx.testUserId);
    });

    it('onboards test user (OTP login + password change + re-login)', async () => {
      // First login with OTP
      const loginRes = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.testUserEmail, password: ctx.testUserOtp },
        powDifficulty: pow(MEDIUM),
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.data.data.requirePasswordChange).toBe(true);

      ctx.testUserToken = loginRes.data.data.token;
      ctx.testUserPassword = `PerfUser${ts}!Secure`;

      // Change password
      const cpRes = await request<{ success: boolean; data: ChangePasswordResponse }>(
        'POST',
        API_PATHS.AUTH_CHANGE_PASSWORD,
        {
          body: { newPassword: ctx.testUserPassword },
          token: ctx.testUserToken,
          powDifficulty: pow(MEDIUM),
        },
      );
      expect(cpRes.status).toBe(200);

      // Re-login with real password
      const reLogin = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.testUserEmail, password: ctx.testUserPassword },
        powDifficulty: pow(MEDIUM),
      });
      expect(reLogin.status).toBe(200);
      expect(reLogin.data.data.requirePasswordChange).toBeFalsy();

      ctx.testUserToken = reLogin.data.data.token;
    });

    it('creates a vault with seed data', async () => {
      // Create vault
      const createRes = await request<{ success: boolean; data: VaultSummary }>('POST', API_PATHS.VAULTS, {
        body: { displayName: 'Perf Test Vault' },
        token: ctx.testUserToken,
        powDifficulty: pow(HIGH),
      });

      expect(createRes.status).toBe(201);
      expect(createRes.data.data.vaultId).toBeDefined();
      expect(createRes.data.data.encryptionSalt).toBeDefined();

      ctx.vaultId = createRes.data.data.vaultId;
      ctx.vaultSalt = createRes.data.data.encryptionSalt;
      ctx.createdVaultIds.push(ctx.vaultId);

      // Seed with a small encrypted payload (~500 bytes)
      const seedData = 'A'.repeat(500);
      const path = API_PATHS.VAULT.replace('{vaultId}', ctx.vaultId);

      const putRes = await request<{ success: boolean; data: VaultPutResponse }>('PUT', path, {
        body: { encryptedIndex: seedData, encryptedItems: seedData },
        token: ctx.testUserToken,
        powDifficulty: pow(HIGH),
      });

      expect(putRes.status).toBe(200);
      expect(putRes.data.success).toBe(true);
    });
  });
}
