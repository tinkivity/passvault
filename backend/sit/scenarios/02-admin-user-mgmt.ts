import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { CreateUserResponse, ListUsersResponse, AdminStats } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;
const ts = Date.now();

export function adminUserMgmtScenarios(ctx: SitContext) {
  describe('02 — Admin User Management', () => {
    it('creates pro user -> OTP + userId', async () => {
      ctx.proUserEmail = `sit-pro-${ts}@passvault-test.local`;

      const res = await request<{ success: boolean; data: CreateUserResponse }>('POST', API_PATHS.ADMIN_USERS, {
        body: { username: ctx.proUserEmail, plan: 'pro', firstName: 'SIT', lastName: 'ProUser' },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(201);
      expect(res.data.data.oneTimePassword).toBeDefined();
      expect(res.data.data.userId).toBeDefined();

      ctx.proUserOtp = res.data.data.oneTimePassword;
      ctx.proUserId = res.data.data.userId;
      ctx.createdUserIds.push(ctx.proUserId);
    });

    it('creates free user -> OTP + userId', async () => {
      ctx.freeUserEmail = `sit-free-${ts}@passvault-test.local`;

      const res = await request<{ success: boolean; data: CreateUserResponse }>('POST', API_PATHS.ADMIN_USERS, {
        body: { username: ctx.freeUserEmail, plan: 'free', firstName: 'SIT', lastName: 'FreeUser' },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(201);
      expect(res.data.data.oneTimePassword).toBeDefined();

      ctx.freeUserOtp = res.data.data.oneTimePassword;
      ctx.freeUserId = res.data.data.userId;
      ctx.createdUserIds.push(ctx.freeUserId);
    });

    it('lists users -> contains both', async () => {
      const res = await request<{ success: boolean; data: ListUsersResponse }>('GET', API_PATHS.ADMIN_USERS, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      const usernames = res.data.data.users.map(u => u.username);
      expect(usernames).toContain(ctx.proUserEmail);
      expect(usernames).toContain(ctx.freeUserEmail);
    });

    it('gets admin stats -> totalUsers >= 2', async () => {
      const res = await request<{ success: boolean; data: AdminStats }>('GET', API_PATHS.ADMIN_STATS, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.totalUsers).toBeGreaterThanOrEqual(2);
    });

    it('locks free user -> success', async () => {
      const path = API_PATHS.ADMIN_USER_LOCK.replace('{userId}', ctx.freeUserId);

      const res = await request<{ success: boolean }>('POST', path, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
    });

    it('locked user cannot login -> 403', async () => {
      const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.freeUserEmail, password: ctx.freeUserOtp },
        powDifficulty: pow(MEDIUM),
      });

      expect(res.status).toBe(403);
    });

    it('unlocks free user -> success', async () => {
      const path = API_PATHS.ADMIN_USER_UNLOCK.replace('{userId}', ctx.freeUserId);

      const res = await request<{ success: boolean }>('POST', path, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
    });

    it('creates another admin -> plan=administrator, success', async () => {
      const adminEmail = `sit-admin2-${ts}@passvault-test.local`;

      const res = await request<{ success: boolean; data: CreateUserResponse }>('POST', API_PATHS.ADMIN_USERS, {
        body: { username: adminEmail, plan: 'administrator' },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(201);
      ctx.createdUserIds.push(res.data.data.userId);
    });

    it('cannot self-expire -> 403', async () => {
      const path = API_PATHS.ADMIN_USER_EXPIRE.replace('{userId}', ctx.adminUserId);

      const res = await request<{ error: string }>('POST', path, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(403);
    });
  });
}
