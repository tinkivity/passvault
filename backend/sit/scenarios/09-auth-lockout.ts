import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG, LIMITS } from '@passvault/shared';
import type { CreateUserResponse } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';
import { testUserEmail } from '../lib/test-emails.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;
const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

/**
 * Auto-lockout via real failed login attempts.
 *
 * Distinct from 02 (admin-initiated lock/unlock): this exercises the rate
 * limiter in backend/src/services/auth.ts#recordFailedAttempt which sets
 * `lockedUntil = now + RATE_LIMIT_WINDOW_MINUTES` once
 * failedLoginAttempts reaches RATE_LIMIT_FAILED_ATTEMPTS (5 by default).
 *
 * Two mechanisms to keep straight:
 *   - `status === 'locked'`  — admin-initiated suspension, returns 403
 *     ACCOUNT_SUSPENDED, cleared by POST /api/admin/users/{id}/unlock.
 *   - `lockedUntil > now`    — brute-force auto-lockout, returns 429
 *     ACCOUNT_LOCKED, NOT cleared by admin unlock (which requires
 *     status='locked'). Real recovery: wait for the window to expire or
 *     admin reset (which issues a new OTP and clears both fields).
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
      victimEmail = testUserEmail(`sit-lockout-${ts}`);
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
      // A successful login resets failedLoginAttempts to 0, so we must re-run
      // the failed attempts to reach the lockout threshold.
      const res = await request<{ success: boolean; data: { token: string; requirePasswordChange?: boolean } }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: victimEmail, password: victimOtp },
        powDifficulty: pow(MEDIUM),
      });
      expect(res.status).toBe(200);
      expect(res.data.data.requirePasswordChange).toBe(true);
    });

    it('5 fresh wrong passwords -> last one triggers lockout (401)', async () => {
      let lastStatus = 0;
      for (let attempt = 1; attempt <= LIMITS.RATE_LIMIT_FAILED_ATTEMPTS; attempt++) {
        const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
          body: { username: victimEmail, password: `WrongPassword${attempt}!` },
          powDifficulty: pow(MEDIUM),
        });
        lastStatus = res.status;
      }
      // The last rejection itself is 401 (wrong password) — recordFailedAttempt
      // sets lockedUntil as a side effect but returns 401 for this request.
      // Subsequent attempts hit the lockedUntil check first and return 429.
      expect(lastStatus).toBe(401);
    });

    it('correct OTP after lockout -> 429 (lockedUntil enforced)', async () => {
      const res = await request<{ error: string }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: victimEmail, password: victimOtp },
        powDifficulty: pow(MEDIUM),
        // Disable transparent 429 retry so we can observe the rate-limit response.
        noRetry: true,
      });
      expect(res.status).toBe(429);
    });

    it('admin reset clears lockedUntil and issues a new OTP', async () => {
      // Admin-initiated POST /api/admin/users/{id}/unlock requires
      // status='locked' and would reject a brute-force lockout with 400.
      // The correct recovery path is reset, which clears failedLoginAttempts
      // and lockedUntil at admin.ts:362-363 and returns a fresh OTP.
      const resetPath = API_PATHS.ADMIN_USER_RESET.replace('{userId}', victimUserId);
      const resetRes = await request<{ success: boolean; data: CreateUserResponse }>('POST', resetPath, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });
      expect(resetRes.status).toBe(200);
      expect(resetRes.data.data.oneTimePassword).toBeDefined();
      const newOtp = resetRes.data.data.oneTimePassword;

      const loginRes = await request<{ success: boolean; data: { token: string; requirePasswordChange?: boolean } }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: victimEmail, password: newOtp },
        powDifficulty: pow(MEDIUM),
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.data.success).toBe(true);
      expect(loginRes.data.data.requirePasswordChange).toBe(true);
    });
  });
}
