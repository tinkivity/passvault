import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { LoginResponse, ChangePasswordResponse } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

export function adminAuthScenarios(ctx: SitContext) {
  describe('01 — Admin Authentication', () => {
    it('logs in with OTP -> requirePasswordChange', async () => {
      const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.adminEmail, password: ctx.adminOtp },
        powDifficulty: pow(POW_CONFIG.DIFFICULTY.MEDIUM),
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.requirePasswordChange).toBe(true);
      expect(res.data.data.token).toBeDefined();

      ctx.adminToken = res.data.data.token;
      ctx.adminUserId = res.data.data.userId;
    });

    it('changes password', async () => {
      ctx.adminPassword = process.env.SIT_ADMIN_PASSWORD || `SitAuto${Date.now()}!Pw`;

      const res = await request<{ success: boolean; data: ChangePasswordResponse }>('POST', API_PATHS.AUTH_CHANGE_PASSWORD, {
        body: { newPassword: ctx.adminPassword },
        token: ctx.adminToken,
        powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('re-logs in with new password -> token', async () => {
      const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.adminEmail, password: ctx.adminPassword },
        powDifficulty: pow(POW_CONFIG.DIFFICULTY.MEDIUM),
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.token).toBeDefined();
      expect(res.data.data.requirePasswordChange).toBeFalsy();

      ctx.adminToken = res.data.data.token;
      ctx.adminUserId = res.data.data.userId;
    });

    it('rejects wrong password -> 401', async () => {
      const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.adminEmail, password: 'wrong-password-x' },
        powDifficulty: pow(POW_CONFIG.DIFFICULTY.MEDIUM),
      });

      expect(res.status).toBe(401);
    });

    it('health check -> 200', async () => {
      const res = await request<{ success: boolean }>('GET', API_PATHS.HEALTH);
      expect(res.status).toBe(200);
    });
  });
}
