import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('User Avatar', () => {
  test('default: puppy image visible in sidebar (not initials)', async ({ adminPage }) => {
    // The sidebar should show an avatar image — either a puppy or custom photo
    const sidebarAvatar = adminPage.locator('[data-slot="avatar-image"]').first();
    await expect(sidebarAvatar).toBeVisible({ timeout: 10000 });
  });

  test('open AccountDialog -> puppy or avatar shown in large avatar', async ({ adminPage }) => {
    // Open account dialog via dropdown
    const userButton = adminPage.locator('[data-slot="sidebar-menu-button"]').last();
    await userButton.click();
    const accountItem = adminPage.getByText('Account', { exact: false });
    await accountItem.click();

    // Large avatar in account dialog should be visible
    const dialogAvatar = adminPage.locator('[role="dialog"] [data-slot="avatar-image"]');
    await expect(dialogAvatar).toBeVisible({ timeout: 10000 });
  });

  test('avatar persists after page reload (session injection with avatarBase64)', async ({ adminPage }) => {
    // Inject a session with avatarBase64 set
    await adminPage.evaluate(() => {
      const raw = sessionStorage.getItem('pv_session');
      if (raw) {
        const session = JSON.parse(raw);
        session.avatarBase64 = 'dGVzdA=='; // tiny base64 for test
        sessionStorage.setItem('pv_session', JSON.stringify(session));
      }
    });

    await adminPage.reload();
    await adminPage.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    // Avatar image should still be visible after reload
    const avatar = adminPage.locator('[data-slot="avatar-image"]').first();
    await expect(avatar).toBeVisible({ timeout: 10000 });
  });
});
