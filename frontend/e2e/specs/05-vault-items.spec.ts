import { test, expect } from '../fixtures/auth.fixture.js';

/**
 * Vault item CRUD tests — these depend on an unlocked vault, which requires
 * vault seeding and the unlock step. Skipped until the vault test
 * infrastructure is in place.
 */
test.describe('Vault — Items', () => {
  // TODO: Implement vault seeding + unlock fixture so these tests can run.

  test.skip('create login item', async ({ adminPage }) => {
    const vaultId = process.env.E2E_VAULT_ID ?? '';
    const vaultPassword = process.env.E2E_VAULT_PASSWORD ?? '';
    test.skip(!vaultId || !vaultPassword, 'E2E_VAULT_ID and E2E_VAULT_PASSWORD must be set');

    // Unlock vault first
    await adminPage.goto(`/ui/${vaultId}`);
    await adminPage.locator('#password, input[type="password"]').first().fill(vaultPassword);
    await adminPage.locator('button[type="submit"]').click();
    await adminPage.waitForURL(`**/ui/${vaultId}/items`, { timeout: 15000 });

    // Click new item
    await adminPage.getByRole('link', { name: /New Item/i }).first().click();
    await adminPage.waitForURL(`**/ui/${vaultId}/items/new`, { timeout: 10000 });

    // Fill in item details
    const nameInput = adminPage.locator('#name, input[name="name"]').first();
    await nameInput.fill('E2E Test Login');

    const usernameInput = adminPage.locator('#username, input[name="username"]').first();
    if (await usernameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await usernameInput.fill('testuser@example.com');
    }

    const passwordInput = adminPage.locator('input[name="password"], #itemPassword').first();
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordInput.fill('SecureTestPass123!');
    }

    // Save
    await adminPage.getByRole('button', { name: /Save/i }).click();

    // Should redirect back to items list or item detail
    await expect(adminPage.getByText('E2E Test Login')).toBeVisible({ timeout: 15000 });
  });

  test.skip('search filters results', async ({ adminPage }) => {
    const vaultId = process.env.E2E_VAULT_ID ?? '';
    const vaultPassword = process.env.E2E_VAULT_PASSWORD ?? '';
    test.skip(!vaultId || !vaultPassword, 'E2E_VAULT_ID and E2E_VAULT_PASSWORD must be set');

    // Unlock and navigate
    await adminPage.goto(`/ui/${vaultId}`);
    await adminPage.locator('#password, input[type="password"]').first().fill(vaultPassword);
    await adminPage.locator('button[type="submit"]').click();
    await adminPage.waitForURL(`**/ui/${vaultId}/items`, { timeout: 15000 });

    // Search for the item we created
    const searchInput = adminPage.getByPlaceholder(/Search by name/i);
    await searchInput.fill('E2E Test Login');

    // The item should still be visible
    await expect(adminPage.getByText('E2E Test Login')).toBeVisible({ timeout: 10000 });

    // Search for something that does not exist
    await searchInput.fill('nonexistent-item-xyz');
    await expect(
      adminPage.getByText(/No items match/i),
    ).toBeVisible({ timeout: 10000 });
  });

  test.skip('delete item', async ({ adminPage }) => {
    const vaultId = process.env.E2E_VAULT_ID ?? '';
    const vaultPassword = process.env.E2E_VAULT_PASSWORD ?? '';
    test.skip(!vaultId || !vaultPassword, 'E2E_VAULT_ID and E2E_VAULT_PASSWORD must be set');

    // Unlock and navigate
    await adminPage.goto(`/ui/${vaultId}`);
    await adminPage.locator('#password, input[type="password"]').first().fill(vaultPassword);
    await adminPage.locator('button[type="submit"]').click();
    await adminPage.waitForURL(`**/ui/${vaultId}/items`, { timeout: 15000 });

    // Click on the test item
    await adminPage.getByText('E2E Test Login').click();

    // Click delete
    await adminPage.getByRole('button', { name: /Delete/i }).first().click();

    // Confirm deletion (dialog asks for vault password)
    const confirmPasswordInput = adminPage.locator('input[type="password"]').last();
    if (await confirmPasswordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmPasswordInput.fill(vaultPassword);
    }

    await adminPage.getByRole('button', { name: /Delete|Confirm/i }).last().click();

    // Item should be gone
    await expect(adminPage.getByText('E2E Test Login')).not.toBeVisible({ timeout: 15000 });
  });
});
