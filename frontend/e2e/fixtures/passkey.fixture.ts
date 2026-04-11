import { test as authTest, expect, type Page } from './auth.fixture.js';
import { installVirtualAuthenticator, type VirtualAuthenticator } from '../helpers/webauthn.js';

/**
 * Extended test fixture that provides a Chrome virtual authenticator on
 * `page` before any passkey ceremony fires.
 *
 * Usage:
 *
 *   import { test, expect } from '../fixtures/passkey.fixture.js';
 *
 *   test('register passkey', async ({ page, passkeyAuthenticator }) => {
 *     // ... page navigation and clicks ...
 *     // Inspect what the authenticator holds:
 *     const creds = await passkeyAuthenticator.getCredentials();
 *     expect(creds.length).toBe(1);
 *   });
 *
 * The fixture installs the authenticator on Playwright's base `page` fixture,
 * which is also the same Page object underlying `adminPage`. Tests that use
 * `adminPage` therefore get the authenticator too — no duplicate setup needed.
 *
 * IMPORTANT: tag passkey specs chromium-only; CDP is not supported on Firefox
 * or WebKit. Do this at the top of the spec:
 *
 *   test.skip(({ browserName }) => browserName !== 'chromium', 'CDP is Chromium-only');
 */
export const test = authTest.extend<{ passkeyAuthenticator: VirtualAuthenticator }>({
  passkeyAuthenticator: async ({ page }, use) => {
    const authenticator = await installVirtualAuthenticator(page);
    await use(authenticator);
    await authenticator.remove();
  },
});

export { expect };
export type { Page };
