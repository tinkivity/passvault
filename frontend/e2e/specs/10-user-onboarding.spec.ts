import { test, expect } from '../fixtures/auth.fixture.js';
import {
  createTestUser,
  deleteTestUser,
  completeFirstLogin,
  completeAdminFirstLogin,
} from '../helpers/users.js';
import { testUserEmail } from '../helpers/test-emails.js';
import { postWithPoW, POW_DIFFICULTY } from '../helpers/pow.js';

/**
 * First-login OTP → change-password UI flow.
 *
 * Backend SIT (backend/sit/scenarios/01-admin-auth.ts and 03-user-onboarding.ts)
 * already covers the API contract for this flow. This spec exercises the
 * browser path — login form → onboarding/change-password forms → redirect
 * chain → session state after onboarding — where UI bugs are most likely
 * to hide.
 *
 * Uses the admin fixture to create a fresh throwaway user per test via API,
 * then drives the entire first-login experience through the browser using a
 * plain Playwright `page` (NOT `adminPage`, because we need to log in as the
 * new user, not as admin).
 */

const NEW_PASSWORD = 'OnboardingTest42!Secure';

test.describe.serial('User onboarding — first-login password change (pro user)', () => {
  let userId: string;
  let username: string;
  let otp: string;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, {
      plan: 'pro',
      usernamePrefix: 'e2e-onboarding-pro',
    });
    userId = created.userId;
    username = created.username;
    otp = created.oneTimePassword;
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (userId) await deleteTestUser(request, apiBase, adminAuth.token, userId);
  });

  test('OTP login redirects to onboarding, then change-password, then /ui', async ({ page }) => {
    // Full browser flow — the helper asserts on every step internally.
    await completeFirstLogin(page, username, otp, NEW_PASSWORD);

    // After the helper completes, the user is back on /login. Log in with
    // the new password and verify we land somewhere under /ui (a fresh user
    // with no vaults lands on exactly /ui).
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(NEW_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
    // The sidebar should render — confirms the session was accepted.
    await expect(page.getByText('PassVault').first()).toBeVisible({ timeout: 20000 });
  });

  test('old OTP no longer logs the user in', async ({ page }) => {
    // Use the OTP from beforeAll — it should be invalid now because a
    // password has been set.
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(otp);
    await page.locator('button[type="submit"]').click();

    // The app should stay on /login and surface an error.
    await page.waitForFunction(
      () => {
        const alert = document.querySelector('[role="alert"]');
        const btn = document.querySelector('button[type="submit"]');
        return alert !== null || (btn !== null && !btn.hasAttribute('disabled'));
      },
      { timeout: 30000 },
    );
    expect(page.url()).toContain('/login');
  });
});

test.describe.serial('User onboarding — first-login password change (admin)', () => {
  let userId: string;
  let username: string;
  let otp: string;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    // Create an admin user via the admin API so we can test the admin
    // first-login path (skips /onboarding, goes straight to /change-password).
    const { body } = await postWithPoW(request, apiBase, '/api/admin/users', {
      headers: { Authorization: `Bearer ${adminAuth.token}` },
      data: {
        username: testUserEmail(`e2e-onboarding-admin-${Date.now()}`),
        plan: 'administrator',
        firstName: 'E2E',
        lastName: 'AdminOnboarding',
      },
      difficulty: POW_DIFFICULTY.HIGH,
    });
    if (!body.success) {
      throw new Error(`admin create failed: ${JSON.stringify(body)}`);
    }
    userId = body.data.userId;
    username = body.data.username ?? testUserEmail(`e2e-onboarding-admin-${Date.now()}`);
    otp = body.data.oneTimePassword;
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (userId) await deleteTestUser(request, apiBase, adminAuth.token, userId);
  });

  test('admin OTP login goes directly to change-password, then admin dashboard', async ({ page }) => {
    await completeAdminFirstLogin(page, username, otp, NEW_PASSWORD);

    // Log in with the new password and confirm we land on the admin dashboard.
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(NEW_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Admin role lands on /ui/admin/dashboard after a non-first login.
    // In dev passkey is optional, so no passkey-setup interstitial.
    await page.waitForURL(/\/ui\/admin\/dashboard/, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
  });
});
