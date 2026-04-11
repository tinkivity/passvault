import { test, expect } from '@playwright/test';

/**
 * Vault CRUD — verifies that vault displayName values survive the backend's
 * at-rest encryption boundary. Creates, renames, and deletes vaults via the
 * API while asserting on what the sidebar renders in the browser.
 *
 * In dev, PoW is disabled (config.features.powEnabled=false), so these API
 * calls can be made directly without a solved challenge.
 */

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const apiBase = process.env.E2E_API_BASE_URL ?? '';
const hasCredentials = email.length > 0 && password.length > 0;

test.describe.serial('Vault — displayName round-trip', () => {
  let token: string;
  let createdVaultId: string | null = null;
  const initialName = `E2E 🔐 Test Vault ${Date.now()}`;
  const renamedName = `E2E Renamed ${Date.now()}`;

  test.beforeAll(async ({ request }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
    const res = await request.post(`${apiBase}/api/auth/login`, {
      data: { username: email, password },
    });
    const body = await res.json();
    if (!body.success) throw new Error(`login failed: ${JSON.stringify(body)}`);
    token = body.data.token;
  });

  test.afterAll(async ({ request }) => {
    if (!createdVaultId) return;
    // Best-effort cleanup so repeat runs don't bump into the plan limit.
    await request.delete(`${apiBase}/api/vaults/${createdVaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  });

  async function injectSession(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate((t: string) => {
      const session = JSON.parse(sessionStorage.getItem('pv_session') ?? 'null');
      if (session) return;
      // Minimal session — we only need role/token/status so the SPA renders
      // the sidebar. The admin role is what grants access to /ui.
      sessionStorage.setItem('pv_session', JSON.stringify({
        token: t, userId: 'unused', role: 'admin', username: 'e2e',
        firstName: null, lastName: null, displayName: null,
        status: 'active', plan: 'pro', loginEventId: null,
        expiresAt: null, accountExpired: false,
      }));
    }, token);
  }

  test('create: unicode displayName round-trips through encrypt → decrypt → sidebar', async ({ page, request }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');

    // 1. Create the vault via the API. Its displayName will be encrypted at rest.
    const createRes = await request.post(`${apiBase}/api/vaults`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { displayName: initialName },
    });
    const createBody = await createRes.json();
    expect(createBody.success, `create failed: ${JSON.stringify(createBody)}`).toBe(true);
    expect(createBody.data.displayName).toBe(initialName);
    createdVaultId = createBody.data.vaultId;

    // 2. Load the sidebar in the browser (which hits the list endpoint, forcing
    //    the decrypt path) and assert the plaintext name is rendered.
    await injectSession(page);
    await page.goto('/ui');
    // Match /ui and /ui/anything — a user with no vaults stays at exactly /ui.
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    await expect(page.getByText(initialName, { exact: true }).first())
      .toBeVisible({ timeout: 20000 });

    // 3. Defense in depth: no raw ciphertext leaked into the DOM.
    const leaked = await page.locator('text=/^v1:[A-Za-z0-9_-]+$/').count();
    expect(leaked, 'raw displayName ciphertext leaked into the sidebar').toBe(0);
  });

  test('rename: new displayName replaces the old one in the sidebar', async ({ page, request }) => {
    test.skip(!hasCredentials || !createdVaultId, 'Depends on create test');

    const patchRes = await request.patch(`${apiBase}/api/vaults/${createdVaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { displayName: renamedName },
    });
    const patchBody = await patchRes.json();
    expect(patchBody.success, `rename failed: ${JSON.stringify(patchBody)}`).toBe(true);
    expect(patchBody.data.displayName).toBe(renamedName);

    await injectSession(page);
    await page.goto('/ui');
    // Match /ui and /ui/anything — a user with no vaults stays at exactly /ui.
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    await expect(page.getByText(renamedName, { exact: true }).first())
      .toBeVisible({ timeout: 20000 });
    await expect(page.getByText(initialName, { exact: true }))
      .toHaveCount(0);
  });

  test('delete: vault disappears from the sidebar', async ({ page, request }) => {
    test.skip(!hasCredentials || !createdVaultId, 'Depends on create test');

    // The backend refuses to delete the last vault, so create a throwaway
    // alongside the one we already have and delete that instead. This still
    // exercises the decrypt-on-list + gone-after-delete path end to end.
    const throwawayName = `E2E Throwaway ${Date.now()}`;
    const createRes = await request.post(`${apiBase}/api/vaults`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { displayName: throwawayName },
    });
    const createBody = await createRes.json();
    expect(createBody.success, `throwaway create failed: ${JSON.stringify(createBody)}`).toBe(true);
    const throwawayVaultId: string = createBody.data.vaultId;

    // Sanity: sidebar shows both the renamed-from-test-2 vault and the throwaway.
    await injectSession(page);
    await page.goto('/ui');
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
    await expect(page.getByText(throwawayName, { exact: true }).first())
      .toBeVisible({ timeout: 20000 });
    await expect(page.getByText(renamedName, { exact: true }).first())
      .toBeVisible({ timeout: 20000 });

    // Delete the throwaway.
    const delRes = await request.delete(`${apiBase}/api/vaults/${throwawayVaultId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const delBody = await delRes.json();
    expect(delBody.success, `delete failed: ${JSON.stringify(delBody)}`).toBe(true);

    // Reload the sidebar and assert the throwaway is gone while the original remains.
    await page.goto('/ui');
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
    await expect(page.getByText(throwawayName, { exact: true }))
      .toHaveCount(0);
    await expect(page.getByText(renamedName, { exact: true }).first())
      .toBeVisible({ timeout: 20000 });
  });
});
