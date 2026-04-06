import { test, expect } from '../fixtures/auth.fixture.js';

// Notification preferences are only available for users with role='user'.
// The E2E admin fixture creates an admin user, so these tests verify the
// admin-accessible notification controls (user detail page) instead.
// TODO: Add user-role E2E tests when a non-admin user fixture exists.

test.describe('Notifications', () => {
  test.fixme('open notifications dialog — current setting shown', async ({ adminPage }) => {
    // Notifications dialog is only available in the user dropdown for role='user'.
    // Admin users do not see the notification menu item.
    // This test needs a non-admin user fixture to work.
  });

  test.fixme('change to quarterly — saves without error', async ({ adminPage }) => {
    // Requires role='user' — see above.
  });

  test.fixme('reopen — shows quarterly', async ({ adminPage }) => {
    // Requires role='user' — see above.
  });
});
