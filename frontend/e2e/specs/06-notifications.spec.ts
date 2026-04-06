import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Notifications', () => {
  test('open notifications dialog — current setting shown', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await adminPage.waitForLoadState('networkidle');

    // Open user menu / sidebar to find Notifications trigger
    const notifTrigger = adminPage.getByText(/Notifications/i).first();
    await expect(notifTrigger).toBeVisible({ timeout: 15000 });
    await notifTrigger.click();

    // The dialog should show a backup frequency select
    await expect(
      adminPage.getByText(/Vault Backup|Vault backup/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('change to quarterly — saves without error', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await adminPage.waitForLoadState('networkidle');

    // Open notifications dialog
    await adminPage.getByText(/Notifications/i).first().click();

    // Wait for dialog to load preferences
    await expect(
      adminPage.getByText(/Vault Backup|Vault backup/i).first(),
    ).toBeVisible({ timeout: 10000 });

    // Open the select dropdown and pick quarterly
    const selectTrigger = adminPage.locator('[role="combobox"], button[role="combobox"]').first();
    if (await selectTrigger.isVisible({ timeout: 5000 }).catch(() => false)) {
      await selectTrigger.click();
      await adminPage.getByRole('option', { name: /Quarterly/i }).click();
    }

    // Save
    await adminPage.getByRole('button', { name: /Save/i }).click();

    // Should not show an error
    await expect(adminPage.locator('.text-destructive')).not.toBeVisible({ timeout: 5000 });
  });

  test('reopen — shows quarterly', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await adminPage.waitForLoadState('networkidle');

    // Open notifications dialog again
    await adminPage.getByText(/Notifications/i).first().click();

    // Wait for preferences to load and verify quarterly is selected
    await expect(
      adminPage.getByText(/Quarterly/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
