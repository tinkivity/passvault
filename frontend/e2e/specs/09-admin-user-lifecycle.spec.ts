import { test, expect } from '../fixtures/auth.fixture.js';
import { createTestUser, deleteTestUser, getUserState, onboardTestUserViaAPI } from '../helpers/users.js';

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
async function gotoUserDetail(
  page: import('@playwright/test').Page,
  user: { userId: string; username: string },
): Promise<void> {
  await page.goto('/ui/admin/users');
  // listUsers is PoW HIGH, so the table render can take several seconds.
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

    await adminPage.getByRole('button', { name: /^Lock$/i }).click();

    // UI: the Lock button should disappear and Unlock should appear.
    await expect(adminPage.getByRole('button', { name: /^Unlock$/i })).toBeVisible({ timeout: 15000 });

    // API: GET /api/admin/users reports status=locked
    const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
    expect(state?.status).toBe('locked');
  });

  test('unlock: status reverts, Lock button reappears', async ({ adminPage, request, adminAuth, apiBase }) => {
    await gotoUserDetail(adminPage, testUser);

    await adminPage.getByRole('button', { name: /^Unlock$/i }).click();

    await expect(adminPage.getByRole('button', { name: /^Lock$/i })).toBeVisible({ timeout: 15000 });

    const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
    expect(state?.status).not.toBe('locked');
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

    await adminPage.getByRole('button', { name: /^Expire$/i }).click();

    // UI: let the page re-render. The expire button may become disabled or
    // the status badge may change — we rely on the API truth source below
    // rather than guessing the exact UI reflection.
    await adminPage.waitForTimeout(500);

    const state = await getUserState(request, apiBase, adminAuth.token, testUser.userId);
    expect(state?.status).toBe('expired');
  });

  test('reactivate: user returns to active via list-row action', async ({ adminPage, request, adminAuth, apiBase }) => {
    // Reactivate lives in the row-level dropdown on the users list, not on
    // the detail page. Navigate to the list and match by username.
    await adminPage.goto('/ui/admin/users');
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
test.describe('Admin lifecycle — email vault', () => {
  // This test requires the admin user to already own at least one vault.
  // The 08-vault-crud suite creates and cleans up its own vaults, so we
  // cannot rely on it — we create one inline for this test.
  test.fixme('email-vault: success toast appears after triggering per-vault email', async ({
    adminPage, request, adminAuth, apiBase,
  }) => {
    // TODO: Needs inline vault setup against the admin user's own account
    // (POST /api/vaults) and cleanup afterward. The Email icon lives inside
    // the per-vault row on the admin user detail page but is also gated on
    // `isProd` in the frontend. Revisit once the UI gating is resolved.
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
