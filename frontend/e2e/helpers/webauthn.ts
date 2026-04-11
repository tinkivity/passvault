import type { Page, CDPSession } from '@playwright/test';

/**
 * Chrome DevTools Protocol Virtual Authenticator wrapper.
 *
 * Lets Playwright tests exercise the real passkey / WebAuthn flows without
 * a hardware authenticator or biometric prompt. CDP's `WebAuthn` domain
 * intercepts `navigator.credentials.create()` and `.get()` calls and
 * responds with CTAP2-compliant assertions from an in-memory authenticator.
 *
 * IMPORTANT: CDP is Chromium-only. Firefox and WebKit tests must be
 * skipped via `test.skip(({ browserName }) => browserName !== 'chromium')`.
 */

export interface VirtualAuthenticatorOptions {
  /** CTAP2 is required for passkeys (resident / discoverable credentials). */
  protocol?: 'ctap2' | 'u2f';
  /** 'internal' = platform authenticator; matches PassVault's @simplewebauthn config. */
  transport?: 'usb' | 'nfc' | 'ble' | 'cable' | 'internal';
  /** Required for passkeys — enables discoverable credentials. */
  hasResidentKey?: boolean;
  /** Authenticator advertises user-verification capability (PIN/biometric). */
  hasUserVerification?: boolean;
  /** Pretend the user already verified (skips any consent simulation). */
  isUserVerified?: boolean;
  /** Auto-confirm user presence so ceremonies resolve without prompts. */
  automaticPresenceSimulation?: boolean;
}

export interface VirtualCredential {
  credentialId: string;
  isResidentCredential: boolean;
  rpId: string;
  privateKey: string;
  userHandle?: string;
  signCount: number;
}

export interface VirtualAuthenticator {
  /** CDP-assigned authenticator id — used to scope all further operations. */
  readonly id: string;
  /** Read all credentials currently stored in this authenticator. */
  getCredentials(): Promise<VirtualCredential[]>;
  /** Wipe all credentials from this authenticator without removing it. */
  clearCredentials(): Promise<void>;
  /** Toggle whether the authenticator reports the user as verified. */
  setUserVerified(verified: boolean): Promise<void>;
  /** Remove the authenticator from the browser context (tears down all creds). */
  remove(): Promise<void>;
}

const DEFAULTS: Required<VirtualAuthenticatorOptions> = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

/**
 * Attach a virtual authenticator to the given page's browser context.
 * Returns an object with methods to inspect and tear down the authenticator.
 *
 * Call once per test (or once per fixture) BEFORE any navigation that could
 * trigger a WebAuthn ceremony. The authenticator persists across navigations
 * within the same BrowserContext until `remove()` is called.
 */
export async function installVirtualAuthenticator(
  page: Page,
  opts: VirtualAuthenticatorOptions = {},
): Promise<VirtualAuthenticator> {
  const options = { ...DEFAULTS, ...opts };

  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');

  const { authenticatorId } = (await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: options.protocol,
      transport: options.transport,
      hasResidentKey: options.hasResidentKey,
      hasUserVerification: options.hasUserVerification,
      isUserVerified: options.isUserVerified,
      automaticPresenceSimulation: options.automaticPresenceSimulation,
    },
  })) as { authenticatorId: string };

  return {
    id: authenticatorId,

    async getCredentials(): Promise<VirtualCredential[]> {
      const res = (await cdp.send('WebAuthn.getCredentials', {
        authenticatorId,
      })) as { credentials: VirtualCredential[] };
      return res.credentials ?? [];
    },

    async clearCredentials(): Promise<void> {
      await cdp.send('WebAuthn.clearCredentials', { authenticatorId });
    },

    async setUserVerified(verified: boolean): Promise<void> {
      await cdp.send('WebAuthn.setUserVerified', {
        authenticatorId,
        isUserVerified: verified,
      });
    },

    async remove(): Promise<void> {
      try {
        await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
      } catch {
        // Authenticator may already be gone if the context was torn down.
      }
      try {
        await cdp.detach();
      } catch {
        // CDP session may already be detached.
      }
    },
  };
}
