import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { ctx } from '../lib/context.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { LoginResponse } from '@passvault/shared';

const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

describe('06 — User Profile & Security', () => {
  it('self-changes password -> success', async () => {
    const newPassword = 'SitProUser2025!NewPwd';

    const res = await request<{ success: boolean }>('POST', API_PATHS.AUTH_CHANGE_PASSWORD_SELF, {
      body: { currentPassword: ctx.proUserPassword, newPassword },
      token: ctx.proUserToken,
      powDifficulty: pow(MEDIUM),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    ctx.proUserPassword = newPassword;
  });

  it('logs in with new password -> success', async () => {
    const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
      body: { username: ctx.proUserEmail, password: ctx.proUserPassword },
      powDifficulty: pow(MEDIUM),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.token).toBeDefined();

    ctx.proUserToken = res.data.data.token;
  });

  it('logs out -> success', async () => {
    const res = await request<{ success: boolean }>('POST', API_PATHS.AUTH_LOGOUT, {
      body: { loginEventId: '' },
      token: ctx.proUserToken,
    });

    // Logout should succeed even with empty loginEventId
    expect(res.status).toBe(200);
  });
});
