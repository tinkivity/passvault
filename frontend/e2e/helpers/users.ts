import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { testUserEmail } from './test-emails.js';
import { postWithPoW, getWithPoW, deleteWithPoW, POW_DIFFICULTY } from './pow.js';

/**
 * Admin-side user management helpers for e2e tests.
 *
 * All API calls include PoW headers (solved via helpers/pow.ts). On dev,
 * the challenge endpoint returns a trivial difficulty and the middleware
 * accepts any solution; on beta/prod the full solve is required.
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
  opts: { plan?: 'free' | 'pro' | 'administrator'; usernamePrefix?: string } = {},
): Promise<CreatedTestUser> {
  const prefix = opts.usernamePrefix ?? 'e2e-lifecycle';
  const username = testUserEmail(`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const { body } = await postWithPoW(request, apiBase, '/api/admin/users', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username,
      plan: opts.plan ?? 'free',
      firstName: 'E2E',
      lastName: 'Test',
    },
    difficulty: POW_DIFFICULTY.HIGH,
  });
  if (!body.success) {
    throw new Error(`createTestUser failed: ${JSON.stringify(body)}`);
  }
  const data = body.data as Record<string, string>;
  return {
    userId: data.userId,
    username,
    oneTimePassword: data.oneTimePassword,
  };
}

export async function deleteTestUser(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  userId: string,
): Promise<void> {
  await deleteWithPoW(request, apiBase, `/api/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
    difficulty: POW_DIFFICULTY.HIGH,
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
  const { body } = await getWithPoW(request, apiBase, '/api/admin/users', {
    headers: { Authorization: `Bearer ${token}` },
    difficulty: POW_DIFFICULTY.HIGH,
  });
  if (!body.success) {
    throw new Error(`getUserState list failed: ${JSON.stringify(body)}`);
  }
  const data = body.data as { users: UserStateSummary[] };
  const match = data.users.find(u => u.userId === userId);
  return match ?? null;
}

/**
 * Onboard a freshly-created test user to `active` status via pure API calls
 * (no browser). Performs OTP login + change-password so the user is ready
 * for admin lifecycle tests that gate action buttons on status='active'
 * (e.g. Lock, Expire, Reset Login in UserDetailPage).
 *
 * Includes a short retry around login to absorb username-index GSI
 * propagation delay after createTestUser, which writes via the admin API
 * path and can occasionally race a too-fast subsequent login.
 */
export async function onboardTestUserViaAPI(
  request: APIRequestContext,
  apiBase: string,
  username: string,
  oneTimePassword: string,
  newPassword: string,
): Promise<void> {
  let token = '';
  let lastBody: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { body } = await postWithPoW(request, apiBase, '/api/auth/login', {
      data: { username, password: oneTimePassword },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    lastBody = body;
    const data = body.data as Record<string, string> | undefined;
    if (body.success && data?.token) {
      token = data.token;
      break;
    }
    if (attempt < 5) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  if (!token) {
    throw new Error(`onboardTestUserViaAPI login failed after 5 attempts: ${JSON.stringify(lastBody)}`);
  }

  const { body: cpBody } = await postWithPoW(request, apiBase, '/api/auth/change-password', {
    headers: { Authorization: `Bearer ${token}` },
    data: { newPassword },
    difficulty: POW_DIFFICULTY.MEDIUM,
  });
  if (!cpBody.success) {
    throw new Error(`onboardTestUserViaAPI change-password failed: ${JSON.stringify(cpBody)}`);
  }
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

/**
 * Drive the full admin first-login flow on a **passkey-required backend**
 * (beta/prod). An admin account with `passkeyRequired=true` must:
 *
 *   1. OTP login → /change-password
 *   2. Change password → "Password Changed" success → Continue to Login → /login
 *   3. Log in again with the new password → backend returns
 *      `requirePasskeySetup: true` because the admin is in status
 *      `pending_passkey_setup` → frontend navigates to /passkey-setup
 *   4. Register a passkey on the PasskeySetupPage → navigate to /ui
 *   5. Router redirects admin to /ui/admin/dashboard
 *
 * This helper assumes a virtual authenticator is already installed on the
 * page (via the passkey.fixture.ts fixture) so the WebAuthn ceremony in
 * step 4 resolves without a human.
 *
 * NOT useful on dev — dev has `passkeyRequired=false`, which short-circuits
 * the passkey-setup redirect in step 3 and lands the admin directly on
 * /ui/admin/dashboard after step 2. Use `completeAdminFirstLogin` for dev.
 *
 * Requires `E2E_PASSKEY_REQUIRED=true` in the environment when the tests
 * run against a beta backend, otherwise the flow collapses to the dev one.
 */
export async function completeAdminOnboardingWithPasskey(
  page: Page,
  username: string,
  oneTimePassword: string,
  newPassword: string,
  passkeyLabel: string = 'E2E Admin Key',
): Promise<void> {
  // Phase 1: OTP login
  await page.goto('/login');
  await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(oneTimePassword);
  await page.locator('button[type="submit"]').click();

  // Phase 2: change password
  await page.waitForURL('**/change-password', { timeout: 15000 });
  await page.locator('#new-password').fill(newPassword);
  await page.locator('#confirm-password').fill(newPassword);
  await page.locator('button[type="submit"]').click();

  const continueBtn = page.getByRole('button', { name: /Continue to Login/i });
  await expect(continueBtn).toBeVisible({ timeout: 15000 });
  await continueBtn.click();
  await page.waitForURL('**/login', { timeout: 15000 });

  // Phase 3: re-login with new password → requirePasskeySetup → /passkey-setup
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(newPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/passkey-setup', { timeout: 15000 });

  // Phase 4: register passkey via virtual authenticator. PasskeySetupPage
  // uses the "Register passkey" button (see PasskeySetupPage.tsx:94) and
  // an optional #passkey-name input (line 85). The virtual authenticator
  // resolves navigator.credentials.create() automatically.
  await page.locator('#passkey-name').fill(passkeyLabel);
  await page.getByRole('button', { name: /^Register passkey$/i }).click();

  // Phase 5: land on admin dashboard (PasskeySetupPage navigates to
  // ROUTES.UI.ROOT which is /ui; the router then redirects admins to
  // /ui/admin/dashboard).
  await page.waitForURL(/\/ui\/admin\/dashboard/, { timeout: 20000 });
}
