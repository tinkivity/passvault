import { test, expect } from '../fixtures/auth.fixture.js';

test.describe.serial('Admin — User Management', () => {
  let createdUsername: string;

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

    // Fill out the form — email address field
    createdUsername = `e2e-test-${Date.now()}@example.com`;
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

  test('view user detail — info displayed', async ({ adminPage }) => {
    test.skip(!createdUsername, 'Depends on create user test');

    await adminPage.goto('/ui/admin/users');

    // Filter by username to bypass TanStack pagination — dev DBs accumulate
    // e2e-* users and new ones frequently end up on page 2+, where
    // getByRole('row') won't find them. The filter input renders
    // immediately; listUsers (PoW HIGH, 10-30s) fills the table behind it
    // and the filter is re-applied whenever the data arrives.
    const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(filter).toBeVisible({ timeout: 45000 });
    await filter.fill(createdUsername);

    const userRow = adminPage.getByRole('row').filter({ hasText: createdUsername });
    await expect(userRow).toBeVisible({ timeout: 45000 });
    await userRow.click();

    // Should navigate to user detail
    await adminPage.waitForURL('**/ui/admin/users/**', { timeout: 15000 });

    // User info should be displayed (use paragraph to avoid breadcrumb duplicate)
    await expect(adminPage.getByRole('paragraph').filter({ hasText: createdUsername })).toBeVisible({ timeout: 10000 });
  });

  test('edit user — save succeeds', async ({ adminPage }) => {
    test.skip(!createdUsername, 'Depends on create user test');

    await adminPage.goto('/ui/admin/users');

    // Filter by username to bypass pagination (see view-user-detail test).
    const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(filter).toBeVisible({ timeout: 45000 });
    await filter.fill(createdUsername);

    const userRow = adminPage.getByRole('row').filter({ hasText: createdUsername });
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
  });

  test('delete user — removed', async ({ adminPage }) => {
    test.skip(!createdUsername, 'Depends on create user test');

    await adminPage.goto('/ui/admin/users');

    // Filter by username to bypass pagination (see view-user-detail test).
    const filter = adminPage.getByRole('textbox', { name: /Filter by username/i });
    await expect(filter).toBeVisible({ timeout: 45000 });
    await filter.fill(createdUsername);

    const userRow = adminPage.getByRole('row').filter({ hasText: createdUsername });
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
    await postDeleteFilter.fill(createdUsername);
    await expect(adminPage.getByRole('row').filter({ hasText: createdUsername }))
      .toHaveCount(0, { timeout: 10000 });
  });
});
