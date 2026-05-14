import { test, expect } from '@playwright/test';
import { postWithPoW, deleteWithPoW, POW_DIFFICULTY } from '../helpers/pow.js';
import {
  KNOWN_VAULT_PASSWORD,
  KNOWN_VAULT_JSON_PATH,
  KNOWN_VAULT_GZ_PATH,
  KNOWN_VAULT_ITEM_COUNT,
} from '../fixtures/known-vault.js';

/**
 * Vault import — verifies that both .json and .vault.gz files can be imported
 * via the import dialog.
 *
 * Uses pre-baked fixture files (frontend/e2e/fixtures/known-vault.*) generated
 * by `generate-known-vault.ts`. The fixtures contain a real Argon2id+AES-GCM
 * encrypted index/items pair, so the import dialog's decrypt path actually
 * exercises something — unlike the previous incarnation of this test which
 * fed it an API-created vault with empty ciphertext.
 *
 * Requires E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_API_BASE_URL — used only
 * to obtain a session token; the source vault no longer comes from the API.
 */

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const apiBase = process.env.E2E_API_BASE_URL ?? '';
const hasCredentials = email.length > 0 && password.length > 0;

test.describe.serial('Vault — import fixture', () => {
  let token: string;
  const importedVaultIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    test.skip(!hasCredentials, 'E2E credentials must be set');
    const { body: loginBody } = await postWithPoW(request, apiBase, '/api/auth/login', {
      data: { username: email, password },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    if (!loginBody.success) throw new Error(`login failed: ${JSON.stringify(loginBody)}`);
    token = (loginBody.data as Record<string, string>).token;
  });

  test.afterAll(async ({ request }) => {
    for (const id of importedVaultIds) {
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
        expiresAt: null, accountExpired: false, avatarBase64: null,
      }));
    }, token);
  }

  async function importFromFile(
    page: import('@playwright/test').Page,
    filePath: string,
    displayName: string,
  ): Promise<string | null> {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await injectSession(page);
    await page.goto('/ui');
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    await page.getByRole('button', { name: /import/i }).click();

    await page.locator('input[type="file"]').setInputFiles(filePath);
    await page.locator('#import-name').fill(displayName);
    await page.locator('#import-password').fill(KNOWN_VAULT_PASSWORD);

    await page.getByRole('button', { name: /preview/i }).click();
    // The fixture contains KNOWN_VAULT_ITEM_COUNT entries — assert on that
    // specific count so a silent fallback to 0 can't pass the test.
    await expect(page.getByText(new RegExp(`${KNOWN_VAULT_ITEM_COUNT}\\s*item`, 'i')))
      .toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /^import$/i }).click();
    await page.waitForURL(/\/ui\/[^/]+\/items/, { timeout: 20000 });

    await expect(page.getByText(displayName, { exact: true }).first())
      .toBeVisible({ timeout: 10000 });

    const match = page.url().match(/\/ui\/([^/]+)\/items/);
    return match ? match[1] : null;
  }

  test('imports a .vault.gz file via the import dialog', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E credentials must be set');
    const displayName = `E2E Imported GZ ${Date.now()}`;
    const id = await importFromFile(page, KNOWN_VAULT_GZ_PATH, displayName);
    if (id) importedVaultIds.push(id);
  });

  test('also accepts a plain .json file', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E credentials must be set');
    const displayName = `E2E Imported JSON ${Date.now()}`;
    const id = await importFromFile(page, KNOWN_VAULT_JSON_PATH, displayName);
    if (id) importedVaultIds.push(id);
  });
});
