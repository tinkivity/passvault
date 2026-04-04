import { describe, it, expect, beforeAll } from 'vitest';
import { request, pow } from '../lib/client.js';
import { load, save, type SitContext } from '../lib/context.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { LoginResponse, ChangePasswordResponse } from '@passvault/shared';

const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

let ctx: SitContext;

describe('03 — User Onboarding (pro user)', () => {
  beforeAll(() => { ctx = load(); });

  it('first login with OTP -> requirePasswordChange', async () => {
    const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
      body: { username: ctx.proUserEmail, password: ctx.proUserOtp },
      powDifficulty: pow(MEDIUM),
    });

    expect(res.status).toBe(200);
    expect(res.data.data.requirePasswordChange).toBe(true);

    ctx.proUserToken = res.data.data.token;
    save(ctx);
  });

  it('sets real password -> success', async () => {
    ctx.proUserPassword = 'SitProUser2025!Pwd';

    const res = await request<{ success: boolean; data: ChangePasswordResponse }>('POST', API_PATHS.AUTH_CHANGE_PASSWORD, {
      body: { newPassword: ctx.proUserPassword },
      token: ctx.proUserToken,
      powDifficulty: pow(MEDIUM),
    });

    expect(res.status).toBe(200);
    save(ctx);
  });

  it('logs in with new password -> token, active', async () => {
    const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
      body: { username: ctx.proUserEmail, password: ctx.proUserPassword },
      powDifficulty: pow(MEDIUM),
    });

    expect(res.status).toBe(200);
    expect(res.data.data.requirePasswordChange).toBeFalsy();

    ctx.proUserToken = res.data.data.token;
    save(ctx);
  });

  it('updates profile name -> success', async () => {
    const res = await request<{ success: boolean }>('PATCH', API_PATHS.AUTH_PROFILE, {
      body: { firstName: 'Integration', lastName: 'Tester', displayName: 'SIT Pro' },
      token: ctx.proUserToken,
    });

    expect(res.status).toBe(200);
  });
});
