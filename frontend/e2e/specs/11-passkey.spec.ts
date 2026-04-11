import { test, expect, type Page } from '../fixtures/passkey.fixture.js';
import {
  createTestUser,
  deleteTestUser,
  completeFirstLogin,
  type CreatedTestUser,
} from '../helpers/users.js';
import { installVirtualAuthenticator } from '../helpers/webauthn.js';

/**
 * Passkey / WebAuthn e2e tests driven by a Chrome virtual authenticator
 * (via CDP). See frontend/e2e/helpers/webauthn.ts for the mechanism.
 *
 * These tests exercise the real @simplewebauthn/browser library against
 * the real backend — the virtual authenticator intercepts only the
 * hardware layer below the library, so nothing is mocked above CTAP2.
 *
 * CDP is Chromium-only. The suite is skipped on Firefox and WebKit.
 *
 * Dev-environment gotchas:
 *   - VITE_PASSKEY_REQUIRED=false in dev → admin passkey management is
 *     hidden in SecurityDialog (see SecurityDialog.tsx:265), and admin
 *     two-step login is not reachable (auth.ts gates it on
 *     config.features.passkeyRequired). Groups 6 and 7 are therefore
 *     test.fixme until we run them against a beta-configured backend.
 *   - A regular user WITH a passkey cannot use password login — the
 *     backend rejects it at auth.ts:70-71 with INVALID_PASSKEY. Group 3
 *     verifies this.
 */

test.skip(({ browserName }) => browserName !== 'chromium', 'CDP virtual authenticators are Chromium-only');

const ONBOARD_PASSWORD = 'PasskeyE2E42!Secret';

// ────────────────────────────────────────────────────────────────────────────
// Shared UI helpers — kept local to this spec for now; promote to
// helpers/users.ts if a second spec needs them.
// ────────────────────────────────────────────────────────────────────────────

async function loginViaForm(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
}

async function loginViaPasskey(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await expect(page.locator('#username')).toBeVisible({ timeout: 15000 });
  await page.locator('#username').fill(username);
  // The dedicated passkey button triggers navigator.credentials.get; the
  // virtual authenticator signs automatically with isUserVerified=true.
  await page.getByRole('button', { name: /Sign in with passkey/i }).click();
}

async function logoutFromSidebar(page: Page): Promise<void> {
  // For regular users there's no header logout button — it's only in the
  // admin shell. Open the NavUser dropdown from the sidebar footer instead.
  // The footer wraps a single button (the NavUser trigger). Targeting the
  // footer is reliable because DropdownMenuTrigger's `render` prop composition
  // in NavUser.tsx:47 overrides the inner SidebarMenuButton's data-slot, so
  // [data-slot="sidebar-menu-button"] does NOT match the NavUser trigger.
  await page.locator('[data-slot="sidebar-footer"]').getByRole('button').first().click();
  await page.getByRole('menuitem', { name: /Log out|Abmelden/i }).click({ timeout: 10000 });
  await page.waitForURL('**/login', { timeout: 15000 });
}

/**
 * Drive the user-onboarding flow through the PASSKEY path (not the password
 * path). Uses the same OnboardingPage as completeFirstLogin but clicks
 * "Set up passkey" instead of "Set a password instead".
 */
async function completeFirstLoginWithPasskey(
  page: Page,
  username: string,
  oneTimePassword: string,
  passkeyName: string,
): Promise<void> {
  await loginViaForm(page, username, oneTimePassword);
  await page.waitForURL('**/onboarding', { timeout: 15000 });
  await page.locator('#passkey-name').fill(passkeyName);
  await page.getByRole('button', { name: /Set up passkey/i }).click();
  // OnboardingPage navigates to /ui on success.
  await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
}

/**
 * Open the Security dialog from the user's nav dropdown.
 * See `logoutFromSidebar` for why we scope to sidebar-footer, not
 * sidebar-menu-button.
 */
async function openSecurityDialog(page: Page): Promise<void> {
  await page.locator('[data-slot="sidebar-footer"]').getByRole('button').first().click();
  await page.getByRole('menuitem', { name: /Security/i }).click({ timeout: 10000 });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
}

async function registerPasskeyInSecurityDialog(page: Page, passkeyName: string): Promise<void> {
  await page.locator('#sec-passkey-name').fill(passkeyName);
  await page.getByRole('button', { name: /Register passkey/i }).click();
  // Wait until the new credential appears in the list (by name).
  await expect(page.getByRole('dialog').getByText(passkeyName)).toBeVisible({ timeout: 15000 });
}

// ────────────────────────────────────────────────────────────────────────────
// Group 1: User onboards with passkey, then logs back in with passkey
//
// Consolidated into a single test on purpose. The `passkeyAuthenticator`
// fixture is test-scoped — each test would otherwise get a fresh authenticator
// with zero credentials, wiping the passkey registered in any previous test.
// Keeping registration + relog-in together preserves the credential for the
// whole ceremony.
// ────────────────────────────────────────────────────────────────────────────
test.describe('Passkey — user onboarding and login (happy path)', () => {
  let user: CreatedTestUser;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    user = await createTestUser(request, apiBase, adminAuth.token, {
      plan: 'pro',
      usernamePrefix: 'e2e-passkey-happy',
    });
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (user?.userId) await deleteTestUser(request, apiBase, adminAuth.token, user.userId);
  });

  test('registers a passkey on /onboarding, then logs back in via passkey after logout', async ({
    page, passkeyAuthenticator,
  }) => {
    // Part A — onboarding with passkey registration
    expect(await passkeyAuthenticator.getCredentials()).toHaveLength(0);
    await completeFirstLoginWithPasskey(page, user.username, user.oneTimePassword, 'E2E Test Key');
    const creds = await passkeyAuthenticator.getCredentials();
    expect(creds).toHaveLength(1);
    expect(creds[0].isResidentCredential).toBe(true);

    // Part B — log out and log back in via passkey (reuses the same credential)
    await logoutFromSidebar(page);
    await loginViaPasskey(page, user.username);
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
    await expect(page.getByText('PassVault').first()).toBeVisible({ timeout: 20000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 3: Password login blocked after passkey is registered
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Passkey — password login blocked after registration', () => {
  let user: CreatedTestUser;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    user = await createTestUser(request, apiBase, adminAuth.token, {
      plan: 'pro',
      usernamePrefix: 'e2e-passkey-block',
    });
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (user?.userId) await deleteTestUser(request, apiBase, adminAuth.token, user.userId);
  });

  test('INVALID_PASSKEY error on password login once passkey is set', async ({
    page, passkeyAuthenticator,
  }) => {
    // Onboard via password so the user has BOTH a password and (soon) a passkey.
    await completeFirstLogin(page, user.username, user.oneTimePassword, ONBOARD_PASSWORD);

    // Log in with password (first time), open Security dialog, register passkey.
    await loginViaForm(page, user.username, ONBOARD_PASSWORD);
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    await openSecurityDialog(page);
    await registerPasskeyInSecurityDialog(page, 'E2E Registered');

    const creds = await passkeyAuthenticator.getCredentials();
    expect(creds).toHaveLength(1);

    // Close the Security dialog before interacting with the sidebar —
    // the dialog's overlay blocks clicks on the sidebar-footer button,
    // so logoutFromSidebar would time out waiting for actionability.
    await page.getByRole('dialog').getByRole('button', { name: /^Close$/i }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Log out and try password login — backend should reject at
    // auth.ts:70-71 with INVALID_PASSKEY.
    await logoutFromSidebar(page);
    await loginViaForm(page, user.username, ONBOARD_PASSWORD);

    // Stay on /login and surface an error (role=alert or similar).
    await page.waitForFunction(
      () => {
        const alert = document.querySelector('[role="alert"]');
        const btn = document.querySelector('button[type="submit"]');
        return alert !== null || (btn !== null && !btn.hasAttribute('disabled'));
      },
      { timeout: 20000 },
    );
    expect(page.url()).toContain('/login');

    // Now succeed via passkey on the same page.
    await page.locator('#username').fill(user.username);
    await page.getByRole('button', { name: /Sign in with passkey/i }).click();
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 4: Multi-passkey management in Security dialog (regular user)
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Passkey — multi-passkey management in Security dialog', () => {
  let user: CreatedTestUser;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    user = await createTestUser(request, apiBase, adminAuth.token, {
      plan: 'pro',
      usernamePrefix: 'e2e-passkey-multi',
    });
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (user?.userId) await deleteTestUser(request, apiBase, adminAuth.token, user.userId);
  });

  test('register two passkeys, revoke one, the other remains', async ({
    page, passkeyAuthenticator,
  }) => {
    await completeFirstLogin(page, user.username, user.oneTimePassword, ONBOARD_PASSWORD);
    await loginViaForm(page, user.username, ONBOARD_PASSWORD);
    await page.waitForURL(/\/ui(\/|$)/, { timeout: 20000 });

    await openSecurityDialog(page);
    await registerPasskeyInSecurityDialog(page, 'Laptop');

    // Second registration needs a SECOND virtual authenticator. The frontend's
    // registerPasskey() passes existingCredentialIds to excludeCredentials
    // (passkey.ts:54), which the single fixture-provided authenticator sees in
    // its own credential store — Chrome then rejects with InvalidStateError
    // ("The authenticator was previously registered"). Installing a second
    // authenticator gives Chrome's WebAuthn an option that doesn't own the
    // excluded credential, so the new credential is created there.
    const secondAuthenticator = await installVirtualAuthenticator(page);
    try {
      await registerPasskeyInSecurityDialog(page, 'Phone');

      // Both passkeys visible in the dialog list.
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Laptop')).toBeVisible();
      await expect(dialog.getByText('Phone')).toBeVisible();

      // Credentials are split across the two virtual authenticators.
      const totalCreds =
        (await passkeyAuthenticator.getCredentials()).length +
        (await secondAuthenticator.getCredentials()).length;
      expect(totalCreds).toBe(2);

      // Revoke "Laptop" — SecurityDialog uses a Trash2 icon button per row
      // with no confirm dialog. Scope to the <li> containing "Laptop".
      const laptopRow = dialog.locator('li').filter({ hasText: 'Laptop' });
      await laptopRow.getByRole('button').last().click();

      // After revoke, Laptop is gone and Phone remains.
      await expect(dialog.getByText('Laptop')).toHaveCount(0, { timeout: 10000 });
      await expect(dialog.getByText('Phone')).toBeVisible();
    } finally {
      await secondAuthenticator.remove();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 5: Failure modes
// ────────────────────────────────────────────────────────────────────────────
test.describe.serial('Passkey — failure modes', () => {
  let user: CreatedTestUser;

  test.beforeAll(async ({ request, adminAuth, apiBase }) => {
    user = await createTestUser(request, apiBase, adminAuth.token, {
      plan: 'pro',
      usernamePrefix: 'e2e-passkey-fail',
    });
  });

  test.afterAll(async ({ request, adminAuth, apiBase }) => {
    if (user?.userId) await deleteTestUser(request, apiBase, adminAuth.token, user.userId);
  });

  test('cleared credentials → passkey login surfaces an error', async ({
    page, passkeyAuthenticator,
  }) => {
    await completeFirstLoginWithPasskey(page, user.username, user.oneTimePassword, 'Temp Key');
    expect((await passkeyAuthenticator.getCredentials()).length).toBe(1);

    await logoutFromSidebar(page);

    // Wipe the credential store mid-flow. The backend still believes the
    // user has a credential in DynamoDB, so when the authenticator fails to
    // sign, the frontend's credentials.get() rejects and the login errors.
    await passkeyAuthenticator.clearCredentials();
    expect((await passkeyAuthenticator.getCredentials()).length).toBe(0);

    await loginViaPasskey(page, user.username);

    // Stay on /login; some error gets surfaced. We don't pin the exact
    // message because it can come from either the browser
    // (NotAllowedError) or the backend (assertion verification failed).
    await page.waitForFunction(
      () => {
        const alert = document.querySelector('[role="alert"]');
        const btn = document.querySelector('button[type="submit"]');
        return alert !== null || (btn !== null && !btn.hasAttribute('disabled'));
      },
      { timeout: 20000 },
    );
    expect(page.url()).toContain('/login');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 6: Admin two-step login (BETA/PROD only — not reachable in dev)
// ────────────────────────────────────────────────────────────────────────────
test.describe('Passkey — admin two-step login', () => {
  test.fixme('admin password login → passkey verification → dashboard', async () => {
    // The admin two-step login is gated on config.features.passkeyRequired
    // (backend auth.ts:189-194). Dev has this false, so after admin password
    // login the response never includes requirePasskeyVerification=true and
    // the second step is unreachable via the UI. Gate this test behind an
    // E2E_PASSKEY_REQUIRED=true env var and run it in a beta-pointed CI job.
    //
    // Flow when enabled:
    //   1. adminFixture creates the admin with a registered passkey
    //   2. page.goto('/login'), fill admin username + password, submit
    //   3. UI transitions to adminPasskeyStep (see LoginPage.tsx:84-112)
    //   4. Click "Verify with passkey" — virtual authenticator signs
    //   5. Backend admin/passkey/verify returns passkeyToken
    //   6. Frontend calls admin/login with { passkeyToken, password }
    //   7. Land on /ui/admin/dashboard with role=admin
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Group 7: Admin passkey management in Security dialog (BETA/PROD only)
// ────────────────────────────────────────────────────────────────────────────
test.describe('Passkey — admin passkey management', () => {
  test.fixme('admin registers and revokes passkeys from Security dialog', async () => {
    // SecurityDialog hides the passkey section for admins when
    // !config.passkeyRequired (frontend SecurityDialog.tsx:265). In dev the
    // admin cannot manage passkeys via the UI at all.
    //
    // Flow when enabled:
    //   1. Use adminPage fixture (already logged in as admin)
    //   2. Open Security dialog from NavUser dropdown
    //   3. Enter "Laptop" in #sec-passkey-name, click Register passkey
    //      — admin variant of the endpoint at /api/admin/passkeys/register
    //   4. Assert Laptop appears in list
    //   5. Revoke via Trash2 icon on the row
    //   6. Assert list is empty (or still has any pre-existing passkeys)
  });
});
