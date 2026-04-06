import { test as base, expect, type Page } from '@playwright/test';

/**
 * Custom fixture that provides a `adminPage` — a Page already logged in
 * as admin using E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars.
 *
 * Tests that use this fixture are automatically skipped when the env vars
 * are not set.
 *
 * NOTE: Authenticated E2E tests are currently marked as fixme due to a
 * form submission issue with vite preview (React event handlers not
 * attaching before Playwright interacts with the form). See 01-auth.spec.ts
 * for details.
 */
export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;

    if (!email || !password) {
      base.skip(true, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
      return;
    }

    // Navigate to login page and wait for the form to render
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 20000 });

    // Fill credentials and submit
    await page.locator('#username').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to /ui (admin lands on /ui/admin/dashboard)
    await page.waitForURL('**/ui/**', { timeout: 45000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';
