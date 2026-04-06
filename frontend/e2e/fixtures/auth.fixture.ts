import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * Custom fixture that provides a `adminPage` — a Page already logged in
 * as admin using E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars.
 *
 * Authenticates via direct API call and injects the session into
 * sessionStorage, bypassing browser form submission entirely.
 * This avoids race conditions with vite preview where native form
 * POST can fire before React attaches event handlers.
 *
 * Tests that use this fixture are automatically skipped when the env vars
 * are not set.
 */
export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page, request }, use) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const apiBase = process.env.E2E_API_BASE_URL ?? '';

    if (!email || !password) {
      base.skip(true, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
      return;
    }

    // Login via API directly (no browser form, no CORS, no PoW in dev)
    const loginRes = await request.post(`${apiBase}/api/auth/login`, {
      data: { username: email, password },
    });
    const body = await loginRes.json();
    if (!body.success) {
      throw new Error(`API login failed: ${JSON.stringify(body)}`);
    }
    const d = body.data;

    // Navigate to the app origin so sessionStorage is on the right domain
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Inject auth session (matches AuthContext SESSION_KEY = 'pv_session')
    await page.evaluate((authState: Record<string, unknown>) => {
      sessionStorage.setItem('pv_session', JSON.stringify(authState));
    }, {
      token: d.token,
      userId: d.userId,
      role: d.role,
      username: d.username,
      firstName: d.firstName ?? null,
      lastName: d.lastName ?? null,
      displayName: d.displayName ?? null,
      status: 'active',
      plan: d.plan ?? null,
      loginEventId: d.loginEventId ?? null,
      expiresAt: d.expiresAt ?? null,
      accountExpired: false,
    });

    // Navigate to admin dashboard — React reads sessionStorage on mount
    await page.goto('/ui/admin/dashboard');
    await page.waitForURL('**/ui/**', { timeout: 20000 });

    await use(page);
  },
});

export { expect } from '@playwright/test';
