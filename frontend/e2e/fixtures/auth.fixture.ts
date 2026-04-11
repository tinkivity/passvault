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
 * Also installs a response listener that fails the test if any `/api/*`
 * request returns a 5xx status — catching regressions where the UI swallows
 * a backend error instead of surfacing it (e.g. DashboardPage setting an
 * `admin.error` state on a 500 from /api/admin/stats while the page still
 * renders its heading).
 *
 * Tests that use this fixture are automatically skipped when the env vars
 * are not set.
 */
interface AdminAuth {
  token: string;
  userId: string;
}

export const test = base.extend<{
  adminPage: Page;
  adminAuth: AdminAuth;
  apiBase: string;
}>({
  apiBase: async ({}, use) => {
    await use(process.env.E2E_API_BASE_URL ?? '');
  },

  adminAuth: async ({ request }, use) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;
    const apiBase = process.env.E2E_API_BASE_URL ?? '';
    if (!email || !password) {
      base.skip(true, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
      return;
    }
    const loginRes = await request.post(`${apiBase}/api/auth/login`, {
      data: { username: email, password },
    });
    const body = await loginRes.json();
    if (!body.success) {
      throw new Error(`API login failed: ${JSON.stringify(body)}`);
    }
    await use({ token: body.data.token, userId: body.data.userId });
  },

  adminPage: async ({ page, adminAuth }, use) => {
    const email = process.env.E2E_ADMIN_EMAIL;
    const password = process.env.E2E_ADMIN_PASSWORD;

    if (!email || !password) {
      base.skip(true, 'E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD must be set');
      return;
    }

    // Collect any 5xx responses from /api/* so we can fail the test in teardown.
    // page.on('response') callbacks cannot throw into the test directly — errors
    // thrown from event handlers are swallowed by Playwright's event loop.
    const serverErrors: Array<{ url: string; status: number; body: string }> = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('/api/')) return;
      const status = response.status();
      if (status < 500 || status >= 600) return;
      let body = '';
      try {
        body = (await response.text()).slice(0, 500);
      } catch {
        body = '<unreadable body>';
      }
      serverErrors.push({ url, status, body });
    });

    // Re-fetch the full login payload so we can inject profile fields into
    // sessionStorage. The adminAuth fixture above only kept the minimal
    // fields used for API calls.
    const apiBase = process.env.E2E_API_BASE_URL ?? '';
    const loginRes = await page.request.post(`${apiBase}/api/auth/login`, {
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
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    await use(page);

    // Teardown: fail the test if the page saw any 5xx responses during its run.
    if (serverErrors.length > 0) {
      const lines = serverErrors.map(
        (e) => `  ${e.status} ${e.url}\n    body: ${e.body}`,
      );
      throw new Error(
        `Saw ${serverErrors.length} server error(s) during test:\n${lines.join('\n')}`,
      );
    }
  },
});

export { expect } from '@playwright/test';
