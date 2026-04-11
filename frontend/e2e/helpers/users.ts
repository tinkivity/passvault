import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Admin-side user management helpers for e2e tests.
 *
 * These wrap the admin HTTP API. In dev, PoW is disabled
 * (config.features.powEnabled=false) so no challenge/solution is needed.
 *
 * Never invoke directly against prod — these endpoints require a valid
 * admin token and mutate real records.
 */

export interface CreatedTestUser {
  userId: string;
  username: string;
  oneTimePassword: string;
}

// Mirror of the fields the admin list endpoint actually returns — note that
// lockedUntil is NOT exposed via GET /api/admin/users, so lock state has to
// be checked through `status === 'locked'` rather than a timestamp.
export interface UserStateSummary {
  userId: string;
  username: string;
  status: string;
  expiresAt?: string | null;
  plan?: string;
  role?: string;
}

export async function createTestUser(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  opts: { plan?: 'free' | 'pro'; usernamePrefix?: string } = {},
): Promise<CreatedTestUser> {
  const prefix = opts.usernamePrefix ?? 'e2e-lifecycle';
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@passvault-test.local`;
  const res = await request.post(`${apiBase}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username,
      plan: opts.plan ?? 'free',
      firstName: 'E2E',
      lastName: 'Test',
    },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`createTestUser failed: ${res.status()} ${JSON.stringify(body)}`);
  }
  return {
    userId: body.data.userId,
    username,
    oneTimePassword: body.data.oneTimePassword,
  };
}

export async function deleteTestUser(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  userId: string,
): Promise<void> {
  await request.delete(`${apiBase}/api/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

export async function getUserState(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  userId: string,
): Promise<UserStateSummary | null> {
  // There is no single-user GET endpoint in the admin API — fetch the list
  // and filter. Acceptable for test dev volumes (< 100 users).
  const res = await request.get(`${apiBase}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`getUserState list failed: ${res.status()} ${JSON.stringify(body)}`);
  }
  const match = (body.data.users as UserStateSummary[]).find(u => u.userId === userId);
  return match ?? null;
}

/**
 * Drive the full browser first-login flow for a regular user:
 *   /login → OTP → /onboarding → "Set a password instead" → /change-password
 *   → fill new password → submit → success screen → "Continue to Login" → /login
 *
 * After this helper returns, the user is logged out and the browser is on
 * `/login` with the user's password changed to `newPassword`. Subsequent tests
 * can log in with those credentials through any path (form, API, injection).
 *
 * Intended for use from other specs to set up an "active" test user when
 * they need one. Admin-role first login is different (no onboarding step) —
 * use `completeAdminFirstLogin` when you need that path.
 */
export async function completeFirstLogin(
  page: Page,
  username: string,
  oneTimePassword: string,
  newPassword: string,
): Promise<void> {
  // Step 1: land on login, fill the OTP as the current password
  await page.goto('/login');
  await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(oneTimePassword);
  await page.locator('button[type="submit"]').click();

  // Step 2: user role lands on /onboarding — click "Set a password instead"
  await page.waitForURL('**/onboarding', { timeout: 15000 });
  await page.getByRole('button', { name: /Set a password instead/i }).click();

  // Step 3: /change-password — fill both fields and submit
  await page.waitForURL('**/change-password', { timeout: 15000 });
  await page.locator('#new-password').fill(newPassword);
  await page.locator('#confirm-password').fill(newPassword);
  await page.locator('button[type="submit"]').click();

  // Step 4: success screen, click "Continue to Login" → lands on /login.
  // PasswordChangePage uses shadcn `<CardTitle>` which renders as a `<div>`,
  // NOT a heading, so we wait on the button instead (which is also the
  // next action we'll take).
  const continueBtn = page.getByRole('button', { name: /Continue to Login/i });
  await expect(continueBtn).toBeVisible({ timeout: 15000 });
  await continueBtn.click();
  await page.waitForURL('**/login', { timeout: 15000 });
}

/**
 * Admin variant of completeFirstLogin — admins skip /onboarding and go
 * directly to /change-password after OTP login.
 */
export async function completeAdminFirstLogin(
  page: Page,
  username: string,
  oneTimePassword: string,
  newPassword: string,
): Promise<void> {
  await page.goto('/login');
  await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(oneTimePassword);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL('**/change-password', { timeout: 15000 });
  await page.locator('#new-password').fill(newPassword);
  await page.locator('#confirm-password').fill(newPassword);
  await page.locator('button[type="submit"]').click();

  // PasswordChangePage's "Password Changed" renders via shadcn <CardTitle>
  // which is a <div>, not a heading. Wait on the Continue button instead.
  const continueBtn = page.getByRole('button', { name: /Continue to Login/i });
  await expect(continueBtn).toBeVisible({ timeout: 15000 });
  await continueBtn.click();
  await page.waitForURL('**/login', { timeout: 15000 });
}
