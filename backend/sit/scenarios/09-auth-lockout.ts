import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG, LIMITS } from '@passvault/shared';
import type { CreateUserResponse } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

/**
 * Auto-lockout via real failed login attempts.
 *
 * Distinct from 02 (admin-initiated lock/unlock): this exercises the rate
 * limiter in backend/src/services/auth.ts#recordFailedAttempt which flips
 * the user to `lockedUntil = now + RATE_LIMIT_WINDOW_MINUTES` once
 * failedLoginAttempts reaches RATE_LIMIT_FAILED_ATTEMPTS (5 by default).
 *
 * Uses a dedicated throwaway user so no other scenario state is disturbed.
 */
export function authLockoutScenarios(ctx: SitContext) {
  describe('09 — Auto-lockout via failed logins', () => {
    const ts = Date.now();
    let victimEmail: string;
    let victimUserId: string;
    let victimOtp: string;

    it('creates a throwaway user for lockout testing', async () => {
      victimEmail = `sit-lockout-${ts}@passvault-test.local`;
      const res = await request<{ success: boolean; data: CreateUserResponse }>('POST', API_PATHS.ADMIN_USERS, {
        body: { username: victimEmail, plan: 'free', firstName: 'SIT', lastName: 'Lockout' },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });
      expect(res.status).toBe(201);
      victimUserId = res.data.data.userId;
      victimOtp = res.data.data.oneTimePassword;
      ctx.createdUserIds.push(victimUserId);
    });

    it('4 wrong passwords in a row -> 401 each, user not yet locked', async () => {
      for (let attempt = 1; attempt <= LIMITS.RATE_LIMIT_FAILED_ATTEMPTS - 1; attempt++) {
        const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
          body: { username: victimEmail, password: `WrongPassword${attempt}!` },
          powDifficulty: pow(MEDIUM),
        });
        expect(res.status, `attempt ${attempt} expected 401`).toBe(401);
      }
    });

    it('correct OTP still works before threshold is hit', async () => {
      // Sanity check: the user is not locked yet, so OTP login must still succeed.
      const res = await request<{ success: boolean; data: { token: string; requirePasswordChange?: boolean } }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: victimEmail, password: victimOtp },
        powDifficulty: pow(MEDIUM),
      });
      expect(res.status).toBe(200);
      expect(res.data.data.requirePasswordChange).toBe(true);
      // A successful login resets failedLoginAttempts to 0, so we must re-run
      // the failed attempts to reach the lockout threshold.
    });

    it('5 fresh wrong passwords -> last one triggers lockout (401 or 403)', async () => {
      // After the successful OTP login above, failedLoginAttempts is reset to 0.
      // The 5th consecutive wrong attempt crosses the threshold.
      let lastStatus = 0;
      for (let attempt = 1; attempt <= LIMITS.RATE_LIMIT_FAILED_ATTEMPTS; attempt++) {
        const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
          body: { username: victimEmail, password: `WrongPassword${attempt}!` },
          powDifficulty: pow(MEDIUM),
        });
        lastStatus = res.status;
      }
      // The last rejection is 401 (wrong password) — the lockout is recorded
      // on the DB side during that same request. Subsequent attempts see 403.
      expect(lastStatus).toBe(401);
    });

    it('correct OTP after lockout -> 403 (locked)', async () => {
      const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: victimEmail, password: victimOtp },
        powDifficulty: pow(MEDIUM),
      });
      expect(res.status).toBe(403);
    });

    it('admin unlock -> user can log in again', async () => {
      const unlockPath = API_PATHS.ADMIN_USER_UNLOCK.replace('{userId}', victimUserId);
      const unlockRes = await request<{ success: boolean }>('POST', unlockPath, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });
      expect(unlockRes.status).toBe(200);

      const loginRes = await request<{ success: boolean; data: { token: string } }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: victimEmail, password: victimOtp },
        powDifficulty: pow(MEDIUM),
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.data.success).toBe(true);
    });
  });
}
