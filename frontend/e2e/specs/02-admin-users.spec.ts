import { test, expect } from '../fixtures/auth.fixture.js';

test.describe.serial('Admin — User Management', () => {
  let createdUsername: string;

  test('navigate to dashboard — heading visible', async ({ adminPage }) => {
    await adminPage.goto('/ui/admin/dashboard');
    await expect(
      adminPage.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible({ timeout: 15000 });
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
    await adminPage.waitForLoadState('networkidle');

    // Click on the created user row
    await adminPage.getByText(createdUsername).click();

    // Should navigate to user detail
    await adminPage.waitForURL('**/ui/admin/users/**', { timeout: 15000 });

    // User info should be displayed
    await expect(adminPage.getByText(createdUsername)).toBeVisible({ timeout: 10000 });
  });

  test('edit user — save succeeds', async ({ adminPage }) => {
    test.skip(!createdUsername, 'Depends on create user test');

    await adminPage.goto('/ui/admin/users');
    await adminPage.waitForLoadState('networkidle');

    // Navigate to user detail
    await adminPage.getByText(createdUsername).click();
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
    await adminPage.waitForLoadState('networkidle');

    // Click on the user row to go to detail
    await adminPage.getByText(createdUsername).click();
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

    // The user should no longer appear
    await expect(adminPage.getByText(createdUsername)).not.toBeVisible({ timeout: 10000 });
  });
});
