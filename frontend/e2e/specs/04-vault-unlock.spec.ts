import { test, expect } from '../fixtures/auth.fixture.js';
import { seedVaultViaAPI, deleteSeededVault, type SeededVault } from '../helpers/vault.js';

/**
 * Vault unlock — verifies the password gate at /ui/{vaultId}.
 *
 * Seeds a fresh vault for the admin in `beforeAll` (with one encrypted item
 * so the wrong-password assertion can actually fail decryption — an empty
 * vault has no ciphertext to verify against, so it unlocks with any input).
 * Cleans up the vault in `afterAll`.
 */
const VAULT_PASSWORD = 'E2eUnlockTest42!Secure';

test.describe.serial('Vault — Unlock', () => {
  let seeded: SeededVault;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    seeded = await seedVaultViaAPI(request, apiBase, adminAuth.token, {
      displayName: `E2E Unlock ${Date.now()}`,
      password: VAULT_PASSWORD,
      seedItem: {
        name: 'E2E Seed Login',
        username: 'seed@example.com',
        password: 'seed-secret',
      },
    });
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (seeded?.vaultId) await deleteSeededVault(request, apiBase, adminAuth.token, seeded.vaultId);
  });

  test('shows unlock page with password input', async ({ adminPage }) => {
    await adminPage.goto(`/ui/${seeded.vaultId}`);

    await expect(
      adminPage.getByText(/Enter the vault password/i),
    ).toBeVisible({ timeout: 15000 });

    await expect(adminPage.locator('#vault-password')).toBeVisible();
  });

  test('wrong password shows error', async ({ adminPage }) => {
    await adminPage.goto(`/ui/${seeded.vaultId}`);

    await adminPage.locator('#vault-password').fill('WrongVaultPass123!');
    await adminPage.locator('button[type="submit"]').click();

    await expect(
      adminPage.getByText(/Incorrect password/i),
    ).toBeVisible({ timeout: 15000 });
  });

  test('correct password navigates to items', async ({ adminPage }) => {
    await adminPage.goto(`/ui/${seeded.vaultId}`);

    await adminPage.locator('#vault-password').fill(seeded.password);
    await adminPage.locator('button[type="submit"]').click();

    await adminPage.waitForURL(`**/ui/${seeded.vaultId}/items`, { timeout: 15000 });
    expect(adminPage.url()).toContain('/items');
  });
});
