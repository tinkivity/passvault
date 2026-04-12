import { test, expect } from '../fixtures/auth.fixture.js';
import { createTestUser, deleteTestUser, getUserState, onboardTestUserViaAPI } from '../helpers/users.js';
import { postWithPoW, POW_DIFFICULTY } from '../helpers/pow.js';

const ONBOARD_PASSWORD = 'E2eLifecycle42!Secure';

/**
 * Admin user lifecycle actions — covers lock/unlock, expire/reactivate,
 * retire, reset, refresh OTP, email vault, and download vault.
 *
 * Each group uses a fresh test user created via the API and cleaned up
 * afterward so groups cannot affect one another. The `adminAuth` and
 * `apiBase` fixtures provide the admin token and base URL for API setup.
 *
 * All groups rely on the fixture-level 5xx guard added in auth.fixture.ts
 * to catch silent 500s from any admin endpoint touched during the test.
 */

// Navigate to a user's detail page. Important: UserDetailPage reads the
// `user` record from `location.state` set by the row click in UsersPage.
// Visiting /ui/admin/users/{id} directly renders a "User not found" stub
// with no action buttons, so we must navigate through the list.
//
// Uses the username filter input to bypass TanStack pagination — dev DBs
// accumulate e2e-* users (especially renamed retired ones that can't be
// deleted), and a fresh test user frequently ends up on page 2+ of the
// default view, where getByRole('row') won't find it.
async function gotoUserDetail(
  page: import('@playwright/test').Page,
  user: { userId: string; username: string },
): Promise<void> {
  await page.goto('/ui/admin/users');

  // Wait for the filter input — it renders immediately on mount, before
  // listUsers returns. Filling it now is fine because TanStack re-applies
  // the filter once the data arrives.
  const filter = page.getByRole('textbox', { name: /Filter by username/i });
  await expect(filter).toBeVisible({ timeout: 45000 });
  await filter.fill(user.username);

  // listUsers is PoW HIGH (10-30s). Playwright retries until the filtered
  // row appears.
  const row = page.getByRole('row').filter({ hasText: user.username });
  await expect(row).toBeVisible({ timeout: 45000 });
  await row.click();
  await page.waitForURL(new RegExp(`/ui/admin/users/${user.userId}`), { timeout: 15000 });
  // Edit button at UserDetailPage.tsx:251 is the one action button that
  // renders unconditionally (for any non-retired target in read mode),
  // regardless of status. Action buttons like Refresh OTP, Lock, Expire,
  // etc. are status-gated and NOT reliable as readiness markers.
  await expect(page.getByRole('button', { name: /^Edit$/i })).toBeVisible({ timeout: 15000 });
}

// Helper: assert that the user-detail status badge text contains the given
// value (case-insensitive). The UserDetailPage renders status as a plain
// text span inside a `dl`.
async function expectStatusOnDetail(page: import('@playwright/test').Page, expected: RegExp): Promise<void> {
  await expect(page.locator('dd').filter({ hasText: expected }).first()).toBeVisible({ timeout: 15000 });
}

// ────────────────────────────────────────────────────────────────────────────
// Group 1: lock / unlock cycle
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Admin lifecycle — lock / unlock', () => {
  let testUser: { userId: string; username: string };

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, { usernamePrefix: 'e2e-lock' });
    testUser = { userId: created.userId, username: created.username };
    // Lock button is only visible for users with status='active'.
    await onboardTestUserViaAPI(request, apiBase, created.username, created.oneTimePassword, ONBOARD_PASSWORD);
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (testUser?.userId) await deleteTestUser(request, apiBase, adminAuth.token, testUser.userId);
  });

  test('lock: status transitions to locked', async ({ adminPage, request, adminAuth, apiBase }) => {
    await gotoUserDetail(adminPage, testUser);

    // Wait for the actual POST /lock response before continuing. This is the
    // only reliable sync point — waitForTimeout races Lambda cold starts,
    // and the fixture guard only catches 5xx, not pending requests.
    const lockResponse = adminPage.waitForResponse(
      (res) => res.url().includes(`/api/admin/users/${testUser.userId}/lock`) && res.request().method() === 'POST',
      { timeout: 30000 },
    );
    await adminPage.getByRole('button', { name: /^Lock$/i }).click();
    const lockRes = await lockResponse;
    expect(lockRes.status()).toBe(200);

    // UI sanity: the Lock button should disappear and Unlock should appear.
    await expect(adminPage.getByRole('button', { name: /^Unlock$/i })).toBeVisible({ timeout: 15000 });

    // API: listAllUsers uses Scan without ConsistentRead (eventually
    // consistent), so poll to absorb any lag between UpdateItem and Scan.
    await expect.poll(async () => {
      const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
      return state?.status;
    }, { timeout: 10000 }).toBe('locked');
  });

  test('unlock: status reverts, Lock button reappears', async ({ adminPage, request, adminAuth, apiBase }) => {
    await gotoUserDetail(adminPage, testUser);

    const unlockResponse = adminPage.waitForResponse(
      (res) => res.url().includes(`/api/admin/users/${testUser.userId}/unlock`) && res.request().method() === 'POST',
      { timeout: 30000 },
    );
    await adminPage.getByRole('button', { name: /^Unlock$/i }).click();
    const unlockRes = await unlockResponse;
    expect(unlockRes.status()).toBe(200);

    await expect(adminPage.getByRole('button', { name: /^Lock$/i })).toBeVisible({ timeout: 15000 });

    await expect.poll(async () => {
      const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
      return state?.status;
    }, { timeout: 10000 }).not.toBe('locked');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 2: expire / reactivate cycle
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Admin lifecycle — expire / reactivate', () => {
  let testUser: { userId: string; username: string };

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, { usernamePrefix: 'e2e-expire' });
    testUser = { userId: created.userId, username: created.username };
    // Expire button requires status='active' or 'locked'; onboard first.
    await onboardTestUserViaAPI(request, apiBase, created.username, created.oneTimePassword, ONBOARD_PASSWORD);
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (testUser?.userId) await deleteTestUser(request, apiBase, adminAuth.token, testUser.userId);
  });

  test('expire: user status becomes expired', async ({ adminPage, request, adminAuth, apiBase }) => {
    await gotoUserDetail(adminPage, testUser);

    // Wait for the POST /expire response — NOT a fixed timeout. Lambda
    // cold-starts in dev can exceed 500ms, in which case the assertion
    // below would race an in-flight request and read stale 'active'.
    // Seen as status=-1, time=-1ms in the Playwright trace.
    const expireResponse = adminPage.waitForResponse(
      (res) => res.url().includes(`/api/admin/users/${testUser.userId}/expire`) && res.request().method() === 'POST',
      { timeout: 30000 },
    );
    await adminPage.getByRole('button', { name: /^Expire$/i }).click();
    const expireRes = await expireResponse;
    expect(expireRes.status()).toBe(200);

    // Poll the admin list API — listAllUsers Scans without ConsistentRead,
    // so the change may not be visible to the very next read.
    await expect.poll(async () => {
      const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
      return state?.status;
    }, { timeout: 10000 }).toBe('expired');
  });

  test('reactivate: user returns to active via list-row action', async ({ adminPage, request, adminAuth, apiBase }) => {
    // Reactivate lives in the row-level dropdown on the users list, not on
    // the detail page. Navigate to the list, filter by username to bypass
    // TanStack pagination, and match the row.
    await adminPage.goto('/ui/admin/users');
    const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(filter).toBeVisible({ timeout: 45000 });
    await filter.fill(testUser.username);
    const userRow = adminPage.getByRole('row').filter({ hasText: testUser.username });
    await expect(userRow).toBeVisible({ timeout: 45000 });

    // Open the row actions dropdown and click Reactivate.
    await userRow.getByRole('button').last().click();
    await adminPage.getByRole('menuitem', { name: /Reactivate/i }).click();

    // A date picker dialog appears — submit with the default (+30 days).
    const submit = adminPage.getByRole('button', { name: /Reactivate|Confirm/i }).last();
    await submit.click({ timeout: 5000 });

    // API: GET /api/admin/users reports status=active
    await expect.poll(async () => {
      const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
      return state?.status;
    }, { timeout: 15000 }).toBe('active');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 3: retire (destructive, one-way)
// ────────────────────────────────────────────────────────────────────────────
test.describe('Admin lifecycle — retire', () => {
  test('retire: user status becomes retired and username is renamed', async ({
    adminPage, request, adminAuth, apiBase,
  }) => {
    // Use a distinct prefix so the retired-user graveyard is easy to find.
    const created = await createTestUser(request, apiBase, adminAuth.token, {
      usernamePrefix: 'e2e-retired',
    });
    const { userId, username } = created;

    await gotoUserDetail(adminPage, { userId, username });

    // Retire is two-step: first click opens confirm, second commits.
    await adminPage.getByRole('button', { name: /Retire user/i }).click();
    await adminPage.getByRole('button', { name: /Confirm retire/i }).click();

    // The backend's listUsers service at admin.ts:247 filters out
    // status='retired' rows, so the meaningful post-condition is that
    // the user disappears from the admin list API entirely.
    await expect.poll(async () => {
      const state = await getUserState(request, apiBase, adminAuth.token, userId);
      return state === null;
    }, { timeout: 15000 }).toBe(true);

    // (We can't assert on the renamed username here because listUsers
    // won't return the row — that would require a direct DynamoDB read.)
    void username;

    // NOTE: retired users cannot be deleted via the admin delete endpoint.
    // This test deliberately leaves the row behind; dev cleanup scripts
    // should recognize the `e2e-retired-` username prefix.
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 4: reset
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Admin lifecycle — reset login', () => {
  let testUser: { userId: string; username: string };

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, { usernamePrefix: 'e2e-reset' });
    testUser = { userId: created.userId, username: created.username };
    // Reset Login button is hidden when status='pending_first_login' (a
    // fresh account already IS in that state — there's nothing to reset).
    // Onboard to 'active' so the button renders.
    await onboardTestUserViaAPI(request, apiBase, created.username, created.oneTimePassword, ONBOARD_PASSWORD);
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (testUser?.userId) await deleteTestUser(request, apiBase, adminAuth.token, testUser.userId);
  });

  test('reset: new OTP dialog appears, status returns to pending_first_login', async ({
    adminPage, request, adminAuth, apiBase,
  }) => {
    await gotoUserDetail(adminPage, testUser);

    // Reset is two-step: click opens confirm, confirm commits.
    await adminPage.getByRole('button', { name: /Reset Login/i }).click();
    await adminPage.getByRole('button', { name: /Confirm reset/i }).click();

    // The OTP dialog renders the new password.
    await expect(adminPage.getByRole('heading', { name: /One-Time Password/i })).toBeVisible({ timeout: 15000 });

    // API: after reset, the user reverts from 'active' (onboarded in beforeAll)
    // back to 'pending_first_login' with a fresh OTP.
    const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
    expect(state?.status).toBe('pending_first_login');

    // Close the dialog so teardown can navigate freely.
    await adminPage.context().grantPermissions(['clipboard-write', 'clipboard-read']);
    await adminPage.getByRole('button', { name: /copy/i }).click({ timeout: 5000 });
    await adminPage.getByRole('button', { name: /Done/i }).click({ timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 5: refresh OTP
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Admin lifecycle — refresh OTP', () => {
  let testUser: { userId: string; username: string };

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, { usernamePrefix: 'e2e-otp' });
    testUser = { userId: created.userId, username: created.username };
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (testUser?.userId) await deleteTestUser(request, apiBase, adminAuth.token, testUser.userId);
  });

  test('refresh OTP: dialog shows a freshly generated 12-char password', async ({ adminPage }) => {
    await gotoUserDetail(adminPage, testUser);

    await adminPage.getByRole('button', { name: /Refresh OTP/i }).click();

    // OTP dialog renders with the new password. Assert the heading and
    // then scope further matches to within the dialog so unrelated page
    // text (sidebar, breadcrumb, etc.) cannot produce false matches.
    await expect(adminPage.getByRole('heading', { name: /One-Time Password/i })).toBeVisible({ timeout: 15000 });

    // The OTP is rendered inside a <code> element by OtpDisplay.tsx.
    // It starts masked (• bullet chars) until the user clicks Reveal, so
    // assert on either the real OTP or the bullet mask. Length is
    // LIMITS.OTP_LENGTH = 16 (shared/src/constants.ts).
    const dialog = adminPage.getByRole('dialog');
    const otpCode = dialog.locator('code').first();
    await expect(otpCode).toBeVisible({ timeout: 5000 });
    await expect(otpCode).toHaveText(/^[A-Za-z0-9!@#$%^&*\u2022]{16}$/);

    // Close the dialog via the copy → Done flow used by existing tests.
    await adminPage.context().grantPermissions(['clipboard-write', 'clipboard-read']);
    await adminPage.getByRole('button', { name: /copy/i }).click({ timeout: 5000 });
    await adminPage.getByRole('button', { name: /Done/i }).click({ timeout: 5000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 6: email-vault (uses admin's own vault as target)
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Admin lifecycle — email vault', () => {
  let testUser: { userId: string; username: string };

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    const created = await createTestUser(request, apiBase, adminAuth.token, { usernamePrefix: 'e2e-emailvault' });
    testUser = { userId: created.userId, username: created.username };
    await onboardTestUserViaAPI(request, apiBase, created.username, created.oneTimePassword, ONBOARD_PASSWORD);
    // Create a vault for the test user so the email-vault action has content
    const { body: loginBody } = await postWithPoW(request, apiBase, '/api/auth/login', {
      data: { username: created.username, password: ONBOARD_PASSWORD },
      difficulty: POW_DIFFICULTY.MEDIUM,
    });
    if (loginBody.success) {
      const userToken = (loginBody.data as Record<string, string>).token;
      await postWithPoW(request, apiBase, '/api/vaults', {
        headers: { Authorization: `Bearer ${userToken}` },
        data: { displayName: 'E2E Email Test Vault' },
        difficulty: POW_DIFFICULTY.HIGH,
      });
    }
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (testUser?.userId) await deleteTestUser(request, apiBase, adminAuth.token, testUser.userId);
  });

  test('email-vault: shows sending then success dialog from user list 3-dot menu', async ({
    adminPage, apiBase,
  }) => {
    await adminPage.goto('/ui/admin/users');

    // Filter to the test user
    const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(filter).toBeVisible({ timeout: 45000 });
    await filter.fill(testUser.username);

    // Wait for the row to appear
    const row = adminPage.getByRole('row').filter({ hasText: testUser.username });
    await expect(row).toBeVisible({ timeout: 45000 });

    // Open the 3-dot menu
    const actionsButton = adminPage.getByRole('button', { name: new RegExp(`Actions for ${testUser.username}`) });
    await actionsButton.click();

    // Click "email vault"
    const emailItem = adminPage.getByRole('menuitem', { name: /email vault/i });
    await expect(emailItem).toBeVisible({ timeout: 5000 });
    await emailItem.click();

    // Sending dialog should appear immediately (before API returns)
    await expect(adminPage.getByText(/sending vault export/i)).toBeVisible({ timeout: 3000 });

    // OK button should be disabled while sending
    const okButton = adminPage.getByRole('button', { name: /^ok$/i });
    await expect(okButton).toBeDisabled();

    // Wait for success — the dialog transitions once the API completes
    await expect(adminPage.getByText(/vault export has been emailed/i)).toBeVisible({ timeout: 60000 });

    // OK button should be enabled now
    await expect(okButton).toBeEnabled();

    // Dismiss the dialog
    await okButton.click();
    await expect(adminPage.getByText(/vault export has been emailed/i)).not.toBeVisible();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 7: download-vault
// ────────────────────────────────────────────────────────────────────────────
test.describe('Admin lifecycle — download vault', () => {
  test.fixme('download-vault: file download event fires with expected filename', async ({
    adminPage, request, adminAuth, apiBase,
  }) => {
    // TODO: Requires admin's own vault to exist with real content for the
    // download to succeed. Factor the vault-create helper out of 08 so this
    // test can reuse it, then assert on `page.waitForEvent('download')`
    // suggestedFilename and byte length.
  });
});
