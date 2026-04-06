import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Language Switching', () => {
  test('switch to German — UI text changes', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await adminPage.waitForLoadState('networkidle');

    // Click the globe icon (language selector) in the header
    await adminPage.locator('[aria-label="Language"]').click({ timeout: 5000 });

    // Select German from dropdown
    await adminPage.getByText('DE', { exact: true }).click();

    // Wait for UI to update — sidebar should show German text
    await expect(adminPage.getByRole('link', { name: 'Benutzer' })).toBeVisible({ timeout: 10000 });
  });

  test('switch back to English — reverts', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await adminPage.waitForLoadState('networkidle');

    // Switch to German first
    await adminPage.locator('[aria-label="Language"]').click({ timeout: 5000 });
    await adminPage.getByText('DE', { exact: true }).click();
    await expect(adminPage.getByRole('link', { name: 'Benutzer' })).toBeVisible({ timeout: 10000 });

    // Now switch back to English — aria-label will be in German now: "Sprache"
    await adminPage.locator('[aria-label="Sprache"], [aria-label="Language"]').first().click({ timeout: 5000 });
    await adminPage.getByText('EN', { exact: true }).click();

    // Check for English text
    await expect(adminPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });
  });
});
