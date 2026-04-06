import { test, expect } from '@playwright/test';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCredentials = email.length > 0 && password.length > 0;

test.describe('Language Switching', () => {
  // Language selector is only available after login (in the shell header),
  // so these tests require valid admin credentials.

  test('switch to German — UI text changes', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');

    // Login first
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 10000 });
    await page.locator('#username').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/ui/**', { timeout: 15000 });

    // Find and click the language selector in the header
    const langButton = page.locator('[aria-label*="anguage"], button:has(svg)').filter({ hasText: /EN|DE|FR|RU/ }).first();
    await langButton.click({ timeout: 5000 });

    // Select German
    const deOption = page.getByText('DE').or(page.getByText('Deutsch'));
    await deOption.first().click();

    // Wait for UI to update — check for a known German translation
    await expect(page.getByText('Abmelden').or(page.getByText('Benutzer'))).toBeVisible({ timeout: 10000 });
  });

  test('switch back to English — reverts', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');

    // Login first
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 10000 });
    await page.locator('#username').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/ui/**', { timeout: 15000 });

    // Switch to German first
    const langButton = page.locator('[aria-label*="anguage"], button:has(svg)').filter({ hasText: /EN|DE|FR|RU/ }).first();
    await langButton.click({ timeout: 5000 });
    await page.getByText('DE').or(page.getByText('Deutsch')).first().click();
    await expect(page.getByText('Abmelden').or(page.getByText('Benutzer'))).toBeVisible({ timeout: 10000 });

    // Now switch back to English
    await langButton.click({ timeout: 5000 });
    await page.getByText('EN').or(page.getByText('English')).first().click();

    // Check for English text
    await expect(page.getByText('Log out').or(page.getByText('Users'))).toBeVisible({ timeout: 10000 });
  });
});
