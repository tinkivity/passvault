import { describe, it, expect, beforeAll } from 'vitest';
import { request, pow } from '../lib/client.js';
import { load, save, type SitContext } from '../lib/context.js';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import type { LoginResponse, ChangePasswordResponse } from '@passvault/shared';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

let ctx: SitContext;

describe('01 — Admin Authentication', () => {
  beforeAll(() => {
    ctx = load();
    console.log('[SIT DEBUG] adminEmail:', ctx.adminEmail);
    console.log('[SIT DEBUG] adminOtp length:', ctx.adminOtp.length);
    console.log('[SIT DEBUG] adminToken present:', ctx.adminToken.length > 0);
    console.log('[SIT DEBUG] baseUrl:', ctx.baseUrl);
  });

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
    save(ctx);
  });

  it('changes password', async () => {
    ctx.adminPassword = 'SitTest2025!Secure';

    const res = await request<{ success: boolean; data: ChangePasswordResponse }>('POST', API_PATHS.AUTH_CHANGE_PASSWORD, {
      body: { newPassword: ctx.adminPassword },
      token: ctx.adminToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    save(ctx);
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
    save(ctx);
  });

  it('rejects wrong password -> 401', async () => {
    const res = await request<{ success: boolean; error: string }>('POST', API_PATHS.AUTH_LOGIN, {
      body: { username: ctx.adminEmail, password: 'wrong-password-x' },
      powDifficulty: pow(POW_CONFIG.DIFFICULTY.MEDIUM),
    });

    expect(res.status).toBe(401);
  });

  it('health check -> 200', async () => {
    const res = await request<{ success: boolean; data: { status: string } }>('GET', API_PATHS.HEALTH);

    expect(res.status).toBe(200);
  });
});
