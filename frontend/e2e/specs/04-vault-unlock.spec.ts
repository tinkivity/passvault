import { test, expect } from '../fixtures/auth.fixture.js';

/**
 * Vault unlock tests — these require a vault to already exist for the
 * logged-in admin user. Mark as skipped with TODO until vault seeding
 * is available in the E2E test environment.
 */
test.describe('Vault — Unlock', () => {
  // TODO: Implement vault seeding so these tests can run.
  // Currently skipped because a vault must pre-exist for the admin user.

  test.skip('shows unlock page with password input', async ({ adminPage }) => {
    // Navigate to a vault — requires knowing the vault ID
    const vaultId = process.env.E2E_VAULT_ID ?? '';
    test.skip(!vaultId, 'E2E_VAULT_ID must be set');

    await adminPage.goto(`/ui/${vaultId}`);

    await expect(
      adminPage.getByText(/Enter the vault password/i),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      adminPage.locator('#password, input[type="password"]').first(),
    ).toBeVisible();
  });

  test.skip('wrong password shows error', async ({ adminPage }) => {
    const vaultId = process.env.E2E_VAULT_ID ?? '';
    test.skip(!vaultId, 'E2E_VAULT_ID must be set');

    await adminPage.goto(`/ui/${vaultId}`);
    await adminPage.waitForLoadState('networkidle');

    await adminPage.locator('#password, input[type="password"]').first().fill('WrongVaultPass123!');
    await adminPage.locator('button[type="submit"]').click();

    await expect(
      adminPage.getByText(/Incorrect password/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test.skip('correct password navigates to items', async ({ adminPage }) => {
    const vaultId = process.env.E2E_VAULT_ID ?? '';
    const vaultPassword = process.env.E2E_VAULT_PASSWORD ?? '';
    test.skip(!vaultId || !vaultPassword, 'E2E_VAULT_ID and E2E_VAULT_PASSWORD must be set');

    await adminPage.goto(`/ui/${vaultId}`);
    await adminPage.waitForLoadState('networkidle');

    await adminPage.locator('#password, input[type="password"]').first().fill(vaultPassword);
    await adminPage.locator('button[type="submit"]').click();

    await adminPage.waitForURL(`**/ui/${vaultId}/items`, { timeout: 15000 });
    expect(adminPage.url()).toContain('/items');
  });
});
