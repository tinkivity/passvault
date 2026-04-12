import { test, expect } from '@playwright/test';
import { gzipSync } from 'zlib';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { postWithPoW, getWithPoW, deleteWithPoW, POW_DIFFICULTY } from '../helpers/pow.js';

/**
 * Vault import — verifies that both .json and .vault.gz files can be imported
 * via the import dialog. Creates a vault via API, exports it, gzip-compresses
 * it, then imports it through the UI.
 *
 * Requires E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_API_BASE_URL.
 */

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const apiBase = process.env.E2E_API_BASE_URL ?? '';
const hasCredentials = email.length > 0 && password.length > 0;

test.describe.serial('Vault — import .vault.gz', () => {
  let token: string;
  let sourceVaultId: string;
  let importedVaultId: string | null = null;
  const vaultPassword = 'E2eImportTest99!';
  const sourceVaultName = `E2E Import Source ${Date.now()}`;
  const importedVaultName = `E2E Imported GZ ${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    test.skip(!hasCredentials, 'E2E credentials must be set');

    // Login
    const { body: loginBody } = await postWithPoW(request, apiBase, '/api/auth/login', {
      data: { username: email, password },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    if (!loginBody.success) throw new Error(`login failed: ${JSON.stringify(loginBody)}`);
    token = (loginBody.data as Record<string, string>).token;

    // Create a source vault with a known password
    const { body: createBody } = await postWithPoW(request, apiBase, '/api/vaults', {
      headers: { Authorization: `Bearer ${token}` },
      data: { displayName: sourceVaultName, password: vaultPassword },
      difficulty: POW_DIFFICULTY.HIGH,
    });
    if (!createBody.success) throw new Error(`create failed: ${JSON.stringify(createBody)}`);
    sourceVaultId = (createBody.data as Record<string, string>).vaultId;
  });

  test.afterAll(async ({ request }) => {
    // Clean up both vaults
    const ids = [sourceVaultId, importedVaultId].filter(Boolean);
    for (const id of ids) {
      await deleteWithPoW(request, apiBase, `/api/vaults/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        difficulty: POW_DIFFICULTY.HIGH,
      }).catch(() => undefined);
    }
  });

  function injectSession(page: import('@playwright/test').Page) {
    return page.evaluate((t: string) => {
      sessionStorage.setItem('pv_session', JSON.stringify({
        token: t, userId: 'unused', role: 'admin', username: 'e2e',
        firstName: null, lastName: null, displayName: null,
        status: 'active', plan: 'pro', loginEventId: null,
        expiresAt: null, accountExpired: false,
      }));
    }, token);
  }

  test('imports a .vault.gz file via the import dialog', async ({ page, request }) => {
    test.skip(!hasCredentials, 'E2E credentials must be set');

    // 1. Download the vault as JSON (this is what the backend sends as attachment)
    const { body: downloadBody } = await getWithPoW(request, apiBase, `/api/vaults/${sourceVaultId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      difficulty: POW_DIFFICULTY.HIGH,
    });
    expect(downloadBody.success, `download failed: ${JSON.stringify(downloadBody)}`).toBe(true);

    // 2. Create a .vault.gz file (same format as email attachment)
    const jsonContent = JSON.stringify(downloadBody.data, null, 2);
    const compressed = gzipSync(Buffer.from(jsonContent, 'utf-8'));
    const tmpFile = join(tmpdir(), `passvault-e2e-${Date.now()}.vault.gz`);
    writeFileSync(tmpFile, compressed);

    try {
      // 3. Navigate to the vault UI
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      await injectSession(page);
      await page.goto('/ui');
      await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

      // 4. Open the import dialog
      const importButton = page.getByRole('button', { name: /import/i });
      await importButton.click();

      // 5. Upload the .vault.gz file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(tmpFile);

      // 6. Fill in vault name and password
      await page.locator('#import-name').fill(importedVaultName);
      await page.locator('#import-password').fill(vaultPassword);

      // 7. Click Preview — verifies gzip decompression + decryption work
      await page.getByRole('button', { name: /preview/i }).click();

      // 8. The preview should appear (may show 0 items for an empty vault)
      await expect(page.getByText(/items found/i)).toBeVisible({ timeout: 15000 });

      // 9. Click Import
      await page.getByRole('button', { name: /^import$/i }).click();

      // 10. Should navigate to the imported vault's items page
      await page.waitForURL(/\/ui\/[^/]+\/items/, { timeout: 20000 });

      // 11. The imported vault should appear in the sidebar
      await expect(page.getByText(importedVaultName, { exact: true }).first())
        .toBeVisible({ timeout: 10000 });

      // Capture the imported vault ID from the URL for cleanup
      const url = page.url();
      const match = url.match(/\/ui\/([^/]+)\/items/);
      if (match) importedVaultId = match[1];
    } finally {
      // Clean up temp file
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });

  test('also accepts a plain .json file', async ({ page, request }) => {
    test.skip(!hasCredentials, 'E2E credentials must be set');

    // Download the vault as JSON
    const { body: downloadBody } = await getWithPoW(request, apiBase, `/api/vaults/${sourceVaultId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
      difficulty: POW_DIFFICULTY.HIGH,
    });
    expect(downloadBody.success).toBe(true);

    // Write as plain JSON (not gzipped)
    const jsonContent = JSON.stringify(downloadBody.data, null, 2);
    const tmpFile = join(tmpdir(), `passvault-e2e-${Date.now()}.json`);
    writeFileSync(tmpFile, jsonContent, 'utf-8');

    const jsonImportName = `E2E Imported JSON ${Date.now()}`;
    let jsonImportedVaultId: string | null = null;

    try {
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      await injectSession(page);
      await page.goto('/ui');
      await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

      const importButton = page.getByRole('button', { name: /import/i });
      await importButton.click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(tmpFile);

      await page.locator('#import-name').fill(jsonImportName);
      await page.locator('#import-password').fill(vaultPassword);

      await page.getByRole('button', { name: /preview/i }).click();
      await expect(page.getByText(/items found/i)).toBeVisible({ timeout: 15000 });

      await page.getByRole('button', { name: /^import$/i }).click();
      await page.waitForURL(/\/ui\/[^/]+\/items/, { timeout: 20000 });

      await expect(page.getByText(jsonImportName, { exact: true }).first())
        .toBeVisible({ timeout: 10000 });

      const url = page.url();
      const match = url.match(/\/ui\/([^/]+)\/items/);
      if (match) jsonImportedVaultId = match[1];
    } finally {
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
      // Clean up the JSON-imported vault
      if (jsonImportedVaultId) {
        await deleteWithPoW(request, apiBase, `/api/vaults/${jsonImportedVaultId}`, {
          headers: { Authorization: `Bearer ${token}` },
          difficulty: POW_DIFFICULTY.HIGH,
        }).catch(() => undefined);
      }
    }
  });
});
