import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture.js';
import { seedVaultViaAPI, deleteSeededVault, type SeededVault } from '../helpers/vault.js';

/**
 * Vault item CRUD — verifies create/search/delete through the UI against a
 * freshly seeded empty vault. Tests run serially: test 1 creates the item,
 * test 2 searches for it, test 3 deletes it. Each test navigates to the
 * unlock page and re-derives the key (the in-memory key map doesn't survive
 * Page recreations across tests).
 */
const VAULT_PASSWORD = 'E2eItemsTest42!Secure';
const ITEM_NAME = 'E2E Test Login';

async function unlockVault(page: Page, vaultId: string, password: string): Promise<void> {
  await page.goto(`/ui/${vaultId}`);
  await page.locator('#vault-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**/ui/${vaultId}/items`, { timeout: 15000 });
  // The unlock handler navigates the moment the password verifies, but the
  // items page then has to fetch + AES-GCM-decrypt encryptedItems. Tests
  // that interact with rows immediately would race that fetch (the search
  // assertion sometimes hit `getByText` while the page still rendered
  // "Loading…"). Wait for the loading indicator to clear.
  await page.getByText(/^Loading…$/).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
}

test.describe.serial('Vault — Items', () => {
  let seeded: SeededVault;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    seeded = await seedVaultViaAPI(request, apiBase, adminAuth.token, {
      displayName: `E2E Items ${Date.now()}`,
      password: VAULT_PASSWORD,
      // Empty vault — test 1 creates the first item via the UI.
    });
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (seeded?.vaultId) await deleteSeededVault(request, apiBase, adminAuth.token, seeded.vaultId);
  });

  test('create login item', async ({ adminPage }) => {
    await unlockVault(adminPage, seeded.vaultId, seeded.password);

    // "New Item" is a Button, not a link (VaultItemsPage.tsx:81).
    await adminPage.getByRole('button', { name: /New Item/i }).click();
    await adminPage.waitForURL(`**/ui/${seeded.vaultId}/items/new`, { timeout: 10000 });

    await adminPage.locator('#name').fill(ITEM_NAME);
    // Category defaults to 'login', so #username and #password are rendered.
    await adminPage.locator('#username').fill('testuser@example.com');
    await adminPage.locator('#password').fill('SecureTestPass123!');

    // Submit label is t('common:create') = "Create" (VaultItemNewPage.tsx:129).
    await adminPage.getByRole('button', { name: /^Create$/i }).click();

    // Redirects to /items; row with the new name should be visible.
    await adminPage.waitForURL(`**/ui/${seeded.vaultId}/items`, { timeout: 15000 });
    await expect(adminPage.getByText(ITEM_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('search filters results', async ({ adminPage }) => {
    await unlockVault(adminPage, seeded.vaultId, seeded.password);

    const searchInput = adminPage.getByPlaceholder(/Search by name/i);
    await searchInput.fill(ITEM_NAME);
    await expect(adminPage.getByText(ITEM_NAME)).toBeVisible({ timeout: 5000 });

    await searchInput.fill('nonexistent-item-xyz');
    // Empty-match copy is t('noItemsMatch'); en/vault.json renders it as
    // "No items match…". Match the first few chars case-insensitively.
    await expect(adminPage.getByText(/No items match/i)).toBeVisible({ timeout: 5000 });
  });

  test('delete item', async ({ adminPage }) => {
    await unlockVault(adminPage, seeded.vaultId, seeded.password);

    // Open the item by clicking its row.
    await adminPage.getByRole('row').filter({ hasText: ITEM_NAME }).click();

    // ItemView delete button (VaultItemDetailPage.tsx:132).
    await adminPage.getByRole('button', { name: /^Delete$/i }).click();

    // AlertDialog opens; fill the vault password and confirm.
    await adminPage.locator('#delete-password').fill(seeded.password);
    // The dialog's confirm action is also labeled "Delete" — scope to the
    // dialog so we don't re-click the trigger.
    await adminPage.getByRole('alertdialog').getByRole('button', { name: /^Delete$/i }).click();

    // handleDelete in VaultItemDetailPage runs Argon2id verifyPassword
    // (~1–2s) + re-encrypt + PoW-HIGH PUT (~1–3s) + navigate. On dev that
    // total can reach 5–10s. Wait for the dialog to close before checking
    // the URL — both make this less flaky AND surface a clearer failure if
    // verifyPassword returns false (dialog stays open with an error).
    await expect(adminPage.getByRole('alertdialog')).not.toBeVisible({ timeout: 30000 });
    await adminPage.waitForURL(`**/ui/${seeded.vaultId}/items`, { timeout: 15000 });
    await expect(adminPage.getByText(ITEM_NAME)).not.toBeVisible({ timeout: 10000 });
  });
});
