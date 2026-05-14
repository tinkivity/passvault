import type { Page, APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture.js';
import { createTestUser, deleteTestUser, onboardTestUserViaAPI } from '../helpers/users.js';
import { postWithPoW, POW_DIFFICULTY } from '../helpers/pow.js';

/**
 * Notification preferences — the dialog is only rendered for users with
 * `role='user'` (NavUser.tsx:111), so we need a fresh non-admin test user.
 *
 * Tests run serially against the same user: test 1 verifies the dialog
 * opens with the default ("Off"), test 2 changes it to Quarterly and saves,
 * test 3 re-opens the dialog and confirms the new value persists.
 */
const USER_PASSWORD = 'E2eNotifTest42!Secure';

interface TestUserCtx {
  userId: string;
  username: string;
  token: string;
  authUserId: string;
}

async function loginAsUser(
  request: APIRequestContext,
  apiBase: string,
  username: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const { body } = await postWithPoW(request, apiBase, '/api/auth/login', {
    data: { username, password },
    difficulty: POW_DIFFICULTY.MEDIUM,
  });
  if (!body.success) {
    throw new Error(`user login failed: ${JSON.stringify(body)}`);
  }
  const data = body.data as Record<string, string>;
  return { token: data.token, userId: data.userId };
}

async function openNotificationsDialog(page: Page, ctx: TestUserCtx): Promise<void> {
  // Inject a user-role session and land on /ui (no vaults → stays at /ui).
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((state) => {
    sessionStorage.setItem('pv_session', JSON.stringify(state));
  }, {
    token: ctx.token,
    userId: ctx.authUserId,
    role: 'user',
    username: ctx.username,
    firstName: 'E2E',
    lastName: 'Test',
    displayName: null,
    status: 'active',
    plan: 'free',
    loginEventId: null,
    expiresAt: null,
    accountExpired: false,
    avatarBase64: null,
  });
  await page.goto('/ui');
  await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

  // Open the NavUser dropdown (sidebar-footer pattern — see 11-passkey
  // for why this isn't `[data-slot="sidebar-menu-button"]`).
  await page.locator('[data-slot="sidebar-footer"]').getByRole('button').first().click();
  await page.getByRole('menuitem', { name: /^Notifications$/i }).click();

  // Dialog should be open with the Notifications title.
  await expect(page.getByRole('dialog').getByText(/^Notifications$/i))
    .toBeVisible({ timeout: 10000 });
}

test.describe.serial('Notifications', () => {
  let ctx: TestUserCtx;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, {
      plan: 'free',
      usernamePrefix: 'e2e-notif',
    });
    await onboardTestUserViaAPI(request, apiBase, created.username, created.oneTimePassword, USER_PASSWORD);
    const { token, userId: authUserId } = await loginAsUser(request, apiBase, created.username, USER_PASSWORD);
    ctx = { userId: created.userId, username: created.username, token, authUserId };
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (ctx?.userId) await deleteTestUser(request, apiBase, adminAuth.token, ctx.userId);
  });

  test('open notifications dialog — current setting shown', async ({ page }) => {
    await openNotificationsDialog(page, ctx);
    // Default `vaultBackup` is 'none' → label "Off". The SelectTrigger
    // renders the current label inside a <span>.
    await expect(page.getByRole('dialog').getByText(/^Off$/i))
      .toBeVisible({ timeout: 5000 });
  });

  test('change to quarterly — saves without error', async ({ page }) => {
    await openNotificationsDialog(page, ctx);

    // Open the select dropdown and pick "Quarterly backup".
    await page.getByRole('dialog').getByRole('combobox').click();
    await page.getByRole('option', { name: /Quarterly backup/i }).click();

    // Save closes the dialog on success.
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
  });

  test('reopen — shows quarterly', async ({ page }) => {
    await openNotificationsDialog(page, ctx);
    await expect(page.getByRole('dialog').getByText(/Quarterly backup/i))
      .toBeVisible({ timeout: 5000 });
  });
});
