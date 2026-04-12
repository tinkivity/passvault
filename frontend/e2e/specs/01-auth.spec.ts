import { test, expect } from '@playwright/test';
import { postWithPoW, POW_DIFFICULTY } from '../helpers/pow.js';

const email = process.env.E2E_ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const hasCredentials = email.length > 0 && password.length > 0;

test.describe('Authentication', () => {
  test('shows login page by default', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });

  test('error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#username')).toBeVisible({ timeout: 20000 });
    await page.locator('#username').fill('invalid@example.com');
    await page.locator('#password').fill('WrongPassword123!');
    await page.locator('button[type="submit"]').click();

    // Wait for the API call to complete
    await page.waitForFunction(
      () => {
        const alert = document.querySelector('[role="alert"]');
        const btn = document.querySelector('button[type="submit"]');
        return alert !== null || (btn !== null && !btn.hasAttribute('disabled'));
      },
      { timeout: 30000 },
    );
    expect(page.url()).toContain('/login');
    const alert = page.locator('[role="alert"]');
    if (await alert.count() > 0) {
      await expect(alert).toBeVisible();
    }
  });

  test('login with valid admin credentials', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');

    const apiBase = process.env.E2E_API_BASE_URL ?? '';

    // Login via API and inject session (same approach as auth fixture)
    const { body } = await postWithPoW(page.request, apiBase, '/api/auth/login', {
      data: { username: email, password },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    expect(body.success).toBe(true);

    const d = body.data as Record<string, unknown>;
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate((authState: Record<string, unknown>) => {
      sessionStorage.setItem('pv_session', JSON.stringify(authState));
    }, {
      token: d.token, userId: d.userId, role: d.role, username: d.username,
      firstName: d.firstName ?? null, lastName: d.lastName ?? null,
      displayName: d.displayName ?? null, status: 'active',
      plan: d.plan ?? null, loginEventId: d.loginEventId ?? null,
      expiresAt: d.expiresAt ?? null, accountExpired: false,
      avatarBase64: (d.avatarBase64 as string) ?? null,
    });

    await page.goto('/ui/admin/dashboard');
    await page.waitForURL('**/ui/**', { timeout: 20000 });
    expect(page.url()).toContain('/ui');
  });

  test('logout redirects to login', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');

    const apiBase = process.env.E2E_API_BASE_URL ?? '';

    // Login via API and inject session
    const { body } = await postWithPoW(page.request, apiBase, '/api/auth/login', {
      data: { username: email, password },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    expect(body.success).toBe(true);

    const d = body.data as Record<string, unknown>;
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate((authState: Record<string, unknown>) => {
      sessionStorage.setItem('pv_session', JSON.stringify(authState));
    }, {
      token: d.token, userId: d.userId, role: d.role, username: d.username,
      firstName: d.firstName ?? null, lastName: d.lastName ?? null,
      displayName: d.displayName ?? null, status: 'active',
      plan: d.plan ?? null, loginEventId: d.loginEventId ?? null,
      expiresAt: d.expiresAt ?? null, accountExpired: false,
      avatarBase64: (d.avatarBase64 as string) ?? null,
    });

    await page.goto('/ui/admin/dashboard');
    await page.waitForURL('**/ui/**', { timeout: 20000 });

    // Logout button is an icon in the header bar with aria-label, or in the user dropdown
    const headerLogout = page.locator('button[aria-label="Log out"], button[aria-label="Abmelden"], button[aria-label="Se déconnecter"], button[aria-label="Выйти"]').first();
    const isHeaderBtn = await headerLogout.isVisible({ timeout: 5000 }).catch(() => false);
    if (isHeaderBtn) {
      await headerLogout.click();
    } else {
      // Fallback: open user dropdown in sidebar, then click logout
      await page.locator('[data-slot="sidebar-menu-button"]').last().click();
      await page.getByText('Log out').or(page.getByText('Abmelden')).first().click({ timeout: 5000 });
    }
    await page.waitForURL('**/login', { timeout: 15000 });
  });

  test('vault sidebar never renders raw displayName ciphertext', async ({ page }) => {
    test.skip(!hasCredentials, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');

    const apiBase = process.env.E2E_API_BASE_URL ?? '';
    const { body } = await postWithPoW(page.request, apiBase, '/api/auth/login', {
      data: { username: email, password },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    expect(body.success).toBe(true);

    const d = body.data as Record<string, unknown>;
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate((authState: Record<string, unknown>) => {
      sessionStorage.setItem('pv_session', JSON.stringify(authState));
    }, {
      token: d.token, userId: d.userId, role: d.role, username: d.username,
      firstName: d.firstName ?? null, lastName: d.lastName ?? null,
      displayName: d.displayName ?? null, status: 'active',
      plan: d.plan ?? null, loginEventId: d.loginEventId ?? null,
      expiresAt: d.expiresAt ?? null, accountExpired: false,
      avatarBase64: (d.avatarBase64 as string) ?? null,
    });

    await page.goto('/ui');
    // Match /ui and /ui/anything — an empty vault list stays at exactly /ui.
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
    // Wait for the sidebar to be rendered before scanning the DOM.
    await expect(page.getByText('PassVault').first()).toBeVisible({ timeout: 20000 });

    // Any vault in the sidebar must be rendered as plaintext — the raw
    // on-disk format `v1:<base64url>` must never leak to the UI.
    const leaked = await page.locator('text=/^v1:[A-Za-z0-9_-]+$/').count();
    expect(leaked, 'raw displayName ciphertext leaked into the sidebar').toBe(0);
  });

  test('unauthenticated /ui redirects to login', async ({ page }) => {
    await page.goto('/ui');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });

  test('unauthenticated /ui/admin redirects to login', async ({ page }) => {
    await page.goto('/ui/admin');
    await page.waitForURL('**/login', { timeout: 20000 });
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });
});
