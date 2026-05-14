import { test, expect } from '../fixtures/auth.fixture.js';

// 4x4 red JPEG — a real image so the <img> actually loads.
// `'dGVzdA=='` (base64 of "test") makes the browser fire `onerror` and
// Base UI's AvatarImage then unmounts itself, falling back to initials.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQY' +
  'GBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSgBBwcHCggKEwoKEygaFhooKCgo' +
  'KCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAAQABA' +
  'MBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQE' +
  'AAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqND' +
  'U2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZ' +
  'qio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5' +
  '+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFIT' +
  'EGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRk' +
  'dISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqa' +
  'qys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhED' +
  'EQA/APOq+OP6RP8A/9k=';

test.describe('User Avatar', () => {
  test('default: puppy image visible in sidebar (not initials)', async ({ adminPage }) => {
    // The sidebar should show an avatar image — either a puppy or custom photo
    const sidebarAvatar = adminPage.locator('[data-slot="avatar-image"]').first();
    await expect(sidebarAvatar).toBeVisible({ timeout: 10000 });
  });

  test('open AccountDialog -> puppy or avatar shown in large avatar', async ({ adminPage }) => {
    // Open account dialog via dropdown. NavUser composes DropdownMenuTrigger
    // around SidebarMenuButton, which strips the inner data-slot — so
    // [data-slot="sidebar-menu-button"] does NOT match the NavUser trigger.
    // Target the sidebar-footer container instead (see 11-passkey.spec.ts).
    await adminPage.locator('[data-slot="sidebar-footer"]')
      .getByRole('button')
      .first()
      .click();
    // Scope to the menuitem role so unrelated page text (e.g. "Account Reset"
    // template card on /admin/email-templates) cannot match.
    const accountItem = adminPage.getByRole('menuitem', { name: /^account$/i });
    await accountItem.click();

    // Large avatar in account dialog should be visible
    const dialogAvatar = adminPage.locator('[role="dialog"] [data-slot="avatar-image"]');
    await expect(dialogAvatar).toBeVisible({ timeout: 10000 });
  });

  test('avatar persists after page reload (session injection with avatarBase64)', async ({ adminPage }) => {
    // Inject a session with avatarBase64 set
    await adminPage.evaluate((jpegBase64) => {
      const raw = sessionStorage.getItem('pv_session');
      if (raw) {
        const session = JSON.parse(raw);
        session.avatarBase64 = jpegBase64;
        sessionStorage.setItem('pv_session', JSON.stringify(session));
      }
    }, TINY_JPEG_BASE64);

    await adminPage.reload();
    await adminPage.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    // Avatar image should still be visible after reload
    const avatar = adminPage.locator('[data-slot="avatar-image"]').first();
    await expect(avatar).toBeVisible({ timeout: 10000 });
  });
});
