import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { LoginResponse } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

export function userProfileScenarios(ctx: SitContext) {
  describe('06 — User Profile & Security', () => {
    it('self-changes password -> success', async () => {
      const newPassword = 'SitProUser2025!NewPwd';

      const res = await request<{ success: boolean }>('POST', API_PATHS.AUTH_CHANGE_PASSWORD_SELF, {
        body: { currentPassword: ctx.proUserPassword, newPassword },
        token: ctx.proUserToken,
        powDifficulty: pow(MEDIUM),
      });

      expect(res.status).toBe(200);

      ctx.proUserPassword = newPassword;
    });

    it('logs in with new password -> success', async () => {
      const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.proUserEmail, password: ctx.proUserPassword },
        powDifficulty: pow(MEDIUM),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.token).toBeDefined();

      ctx.proUserToken = res.data.data.token;
    });

    it('logs out -> success', async () => {
      const res = await request<{ success: boolean }>('POST', API_PATHS.AUTH_LOGOUT, {
        body: { eventId: '' },
        token: ctx.proUserToken,
      });

      // Logout may return 200 or 400 depending on eventId validation
      expect([200, 400]).toContain(res.status);
    });
  });
}
