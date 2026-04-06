import { test, expect } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCredentials = email.length > 0 && password.length > 0;

test.describe('Authentication', () => {
  test('shows login page by default', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });

  test('error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 20000 });
    await page.locator('#username').fill('invalid@example.com');
    await page.locator('#password').fill('WrongPassword123!');
    await page.locator('button[type="submit"]').click();

    // Wait for the API call to complete
    await page.waitForFunction(
      () => {
        const alert = document.querySelector('[role="alert"]');
        const btn = document.querySelector('button[type="submit"]');
        return alert !== null || (btn !== null && !btn.hasAttribute('disabled'));
      },
      { timeout: 30000 },
    );
    expect(page.url()).toContain('/login');
    const alert = page.locator('[role="alert"]');
    if (await alert.count() > 0) {
      await expect(alert).toBeVisible();
    }
  });

  // TODO: Authenticated E2E tests require investigation — form submission via
  // Playwright's click() triggers a native form POST instead of React's onSubmit
  // handler when running against vite preview. The React event handlers don't
  // attach before Playwright interacts with the form. This needs either:
  // 1. Using vite dev server (with HMR disabled) instead of vite preview
  // 2. Adding a webServer config to playwright.config.ts
  // 3. Intercepting the form submission at the DOM level
  // See: frontend/e2e/README.md for details

  test.fixme('login with valid admin credentials', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 20000 });
    await page.locator('#username').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/ui/**', { timeout: 45000 });
    expect(page.url()).toContain('/ui');
  });

  test.fixme('logout redirects to login', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 20000 });
    await page.locator('#username').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/ui/**', { timeout: 45000 });
    const logoutBtn = page.getByText('Log out').or(page.getByText('Abmelden')).or(page.getByText('Déconnexion')).first();
    await logoutBtn.click({ timeout: 10000 });
    await page.waitForURL('**/login', { timeout: 15000 });
  });

  test('unauthenticated /ui redirects to login', async ({ page }) => {
    await page.goto('/ui');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });

  test('unauthenticated /ui/admin redirects to login', async ({ page }) => {
    await page.goto('/ui/admin');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });
});
