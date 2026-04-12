import { test, expect } from '../fixtures/auth.fixture.js';
import { createTestUser, deleteTestUser } from '../helpers/users.js';
import { testUserEmail } from '../helpers/test-emails.js';
import type { APIRequestContext } from '@playwright/test';

// Hoisted to module scope so the resolveTargetUser helper can read it.
// Set by the "create user — OTP dialog appears" test in the serial chain.
let createdUsername: string | undefined;

/**
 * Targets either the user created by the "create user" UI test (shared via
 * module-scope `createdUsername`) or a freshly-created API user when the
 * shared state isn't available.
 *
 * This matters for `playwright test --last-failed`: Playwright only re-runs
 * the specific failing tests, so the upstream "create user" test never fires
 * and `createdUsername` is undefined. Without this helper the dependent
 * tests would silently skip via `test.skip(!createdUsername, ...)`. With it,
 * each test self-provisions when running in isolation and cleans up after
 * itself; when running as part of the full serial chain it reuses the
 * shared user as before.
 */
async function resolveTargetUser(
  request: APIRequestContext,
  apiBase: string,
  token: string,
): Promise<{ username: string; userId: string | null; selfCreated: boolean }> {
  if (createdUsername) {
    return { username: createdUsername, userId: null, selfCreated: false };
  }
  const user = await createTestUser(request, apiBase, token, { usernamePrefix: 'e2e-02-rerun' });
  return { username: user.username, userId: user.userId, selfCreated: true };
}

test.describe.serial('Admin — User Management', () => {

  test('navigate to dashboard — heading and stats render', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await expect(
      adminPage.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible({ timeout: 15000 });

    // The dashboard swallows /api/admin/stats errors into admin.error and
    // renders placeholders — so the heading alone is not enough to prove the
    // endpoint worked. Assert that all three metric cards render a real
    // value (non-skeleton) and that no destructive error text is shown.
    await expect(
      adminPage.locator('div').filter({ hasText: /^Users$/i }).first(),
    ).toBeVisible({ timeout: 15000 });

    // The metric values are rendered inside the metric cards as numbers or
    // byte strings ("0 B", "1.2 MB"). Wait for the Users metric to show an
    // actual numeric value rather than the Skeleton placeholder.
    const usersMetricValue = adminPage.getByRole('link').filter({ hasText: /^\d+$/ }).first();
    await expect(usersMetricValue).toBeVisible({ timeout: 15000 });

    // No error banner should have appeared from a failed stats fetch.
    await expect(adminPage.locator('p.text-destructive')).toHaveCount(0);
  });

  test('navigate to users — table visible', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/users');
    await expect(
      adminPage.getByRole('heading', { name: 'Users' }),
    ).toBeVisible({ timeout: 15000 });

    // Either the user table or an empty-state message should appear
    const tableOrEmpty = adminPage
      .locator('table, [class*="no-users"], :text("No users yet"), :text("Create the first user")');
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 15000 });
  });

  test('create user — OTP dialog appears', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/users');
    await adminPage.waitForLoadState('networkidle');

    // Click create user button
    await adminPage.getByRole('button', { name: /Create User/i }).click();

    // Dialog should open
    await expect(
      adminPage.getByRole('heading', { name: 'Create User' }),
    ).toBeVisible({ timeout: 10000 });

    // Fill out the form — email address field (must use testUserEmail for
    // proper plus-address routing on beta — bare @example.com hard-bounces)
    createdUsername = testUserEmail(`e2e-test-${Date.now()}`);
    await adminPage.locator('#new-username').fill(createdUsername);

    // Fill display name if present
    const displayNameField = adminPage.locator('#displayName, input[name="displayName"]').first();
    if (await displayNameField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await displayNameField.fill('E2E Test User');
    }

    // Submit the form
    await adminPage.getByRole('button', { name: /Create/i }).last().click();

    // OTP dialog should appear (shows one-time password heading)
    await expect(
      adminPage.getByRole('heading', { name: /One-Time Password/i }),
    ).toBeVisible({ timeout: 15000 });

    // Grant clipboard permissions so the copy button works in headless Chromium
    await adminPage.context().grantPermissions(['clipboard-write', 'clipboard-read']);

    // Click the copy button (enables the Done button)
    await adminPage.getByRole('button', { name: /copy/i }).click({ timeout: 5000 });

    // Close dialog via Done
    await adminPage.getByRole('button', { name: /Done/i }).click({ timeout: 5000 });
  });

  test('view user detail — info displayed', async ({ adminPage, request, adminAuth, apiBase }) => {
    const target = await resolveTargetUser(request, apiBase, adminAuth.token);

    try {
      await adminPage.goto('/ui/admin/users');

      // Filter by username to bypass TanStack pagination — dev DBs accumulate
      // e2e-* users and new ones frequently end up on page 2+, where
      // getByRole('row') won't find them. The filter input renders
      // immediately; listUsers (PoW HIGH, 10-30s) fills the table behind it
      // and the filter is re-applied whenever the data arrives.
      const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
      await expect(filter).toBeVisible({ timeout: 45000 });
      await filter.fill(target.username);

      const userRow = adminPage.getByRole('row').filter({ hasText: target.username });
      await expect(userRow).toBeVisible({ timeout: 45000 });
      await userRow.click();

      // Should navigate to user detail
      await adminPage.waitForURL('**/ui/admin/users/**', { timeout: 15000 });

      // User info should be displayed (use paragraph to avoid breadcrumb duplicate)
      await expect(adminPage.getByRole('paragraph').filter({ hasText: target.username })).toBeVisible({ timeout: 10000 });
    } finally {
      if (target.selfCreated && target.userId) {
        await deleteTestUser(request, apiBase, adminAuth.token, target.userId);
      }
    }
  });

  test('edit user — save succeeds', async ({ adminPage, request, adminAuth, apiBase }) => {
    const target = await resolveTargetUser(request, apiBase, adminAuth.token);

    try {
      await adminPage.goto('/ui/admin/users');

      // Filter by username to bypass pagination (see view-user-detail test).
      const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
      await expect(filter).toBeVisible({ timeout: 45000 });
      await filter.fill(target.username);

      const userRow = adminPage.getByRole('row').filter({ hasText: target.username });
      await expect(userRow).toBeVisible({ timeout: 45000 });
      await userRow.click();
      await adminPage.waitForURL('**/ui/admin/users/**', { timeout: 15000 });

      // Click edit button
      const editBtn = adminPage.getByRole('button', { name: /Edit/i }).first();
      if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editBtn.click();

        // Try to update display name
        const nameInput = adminPage.locator('#displayName, input[name="displayName"]').first();
        if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nameInput.fill('E2E Updated User');
        }

        // Save
        await adminPage.getByRole('button', { name: /Save/i }).click();

        // Should not show an error alert
        await expect(adminPage.locator('[role="alert"]')).not.toBeVisible({ timeout: 5000 });
      }
    } finally {
      if (target.selfCreated && target.userId) {
        await deleteTestUser(request, apiBase, adminAuth.token, target.userId);
      }
    }
  });

  test('delete user — removed', async ({ adminPage, request, adminAuth, apiBase }) => {
    // For delete, the whole test IS the cleanup: if we self-created a user
    // here, the UI flow deletes it, and there's nothing left for afterEach
    // to do. On success either way, no API-level cleanup is needed.
    const target = await resolveTargetUser(request, apiBase, adminAuth.token);

    await adminPage.goto('/ui/admin/users');

    // Filter by username to bypass pagination (see view-user-detail test).
    const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(filter).toBeVisible({ timeout: 45000 });
    await filter.fill(target.username);

    const userRow = adminPage.getByRole('row').filter({ hasText: target.username });
    await expect(userRow).toBeVisible({ timeout: 45000 });
    await userRow.click();
    await adminPage.waitForURL('**/ui/admin/users/**', { timeout: 15000 });

    // Open the delete action (may be in a dropdown or direct button)
    const deleteBtn = adminPage.getByRole('button', { name: /Delete/i }).first();
    await deleteBtn.click();

    // Confirm deletion in the confirmation dialog
    const confirmBtn = adminPage.getByRole('button', { name: /Confirm delete|Delete/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();

    // Should redirect back to users list or user should disappear
    await adminPage.waitForURL('**/ui/admin/users', { timeout: 15000 });

    // The user should no longer appear. Re-filter on a fresh page load
    // (the filter state resets on navigation) and assert zero matching
    // rows — a bare getByText would be a false positive if the user was
    // on page 2+ of the unfiltered list to begin with.
    const postDeleteFilter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(postDeleteFilter).toBeVisible({ timeout: 15000 });
    await postDeleteFilter.fill(target.username);
    await expect(adminPage.getByRole('row').filter({ hasText: target.username }))
      .toHaveCount(0, { timeout: 10000 });

    // Safety net: if the UI flow failed partway but we self-created the user,
    // clean up via the API so the test doesn't leak an orphan on rerun.
    if (target.selfCreated && target.userId) {
      await deleteTestUser(request, apiBase, adminAuth.token, target.userId);
    }
  });
});
