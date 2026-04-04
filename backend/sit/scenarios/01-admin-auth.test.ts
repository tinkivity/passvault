import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { ctx } from '../lib/context.js';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import type { LoginResponse, ChangePasswordResponse } from '@passvault/shared';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

describe('01 — Admin Authentication', () => {
  it('logs in with OTP -> requirePasswordChange', async () => {
    const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.ADMIN_LOGIN, {
      body: { username: ctx.adminEmail, password: ctx.adminOtp },
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.requirePasswordChange).toBe(true);
    expect(res.data.data.token).toBeDefined();

    ctx.adminToken = res.data.data.token;
    ctx.adminUserId = res.data.data.loginEventId ? res.data.data.loginEventId : '';
  });

  it('changes password', async () => {
    ctx.adminPassword = 'SitTest2025!Secure';

    const res = await request<{ success: boolean; data: ChangePasswordResponse }>('POST', API_PATHS.ADMIN_CHANGE_PASSWORD, {
      body: { newPassword: ctx.adminPassword },
      token: ctx.adminToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it('re-logs in with new password -> token', async () => {
    const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.ADMIN_LOGIN, {
      body: { username: ctx.adminEmail, password: ctx.adminPassword },
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.token).toBeDefined();
    expect(res.data.data.requirePasswordChange).toBeFalsy();

    ctx.adminToken = res.data.data.token;
    // Extract userId from the token or login response
    if (res.data.data.loginEventId) {
      ctx.adminUserId = res.data.data.loginEventId;
    }
  });

  it('rejects wrong password -> 401', async () => {
    const res = await request<{ success: boolean; error: string }>('POST', API_PATHS.ADMIN_LOGIN, {
      body: { username: ctx.adminEmail, password: 'wrong-password-x' },
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(401);
    expect(res.data.error).toBe(ERRORS.INVALID_CREDENTIALS);
  });

  it('health check -> 200', async () => {
    const res = await request<{ success: boolean; data: { status: string } }>('GET', API_PATHS.HEALTH);

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('ok');
  });
});
