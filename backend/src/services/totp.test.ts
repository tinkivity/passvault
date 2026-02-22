import { describe, it, expect } from 'vitest';
import { generateSecret, generateQrUri, generateQrDataUrl, verifyCode } from './totp.js';
import { authenticator } from 'otplib';
import { TOTP_CONFIG } from '@passvault/shared';

describe('generateSecret', () => {
  it('returns a non-empty string', () => {
    expect(generateSecret().length).toBeGreaterThan(0);
  });

  it('produces unique secrets', () => {
    const secrets = new Set(Array.from({ length: 10 }, () => generateSecret()));
    expect(secrets.size).toBe(10);
  });
});

describe('generateQrUri', () => {
  it('returns an otpauth URI containing the username and issuer', () => {
    const secret = generateSecret();
    const uri = generateQrUri('alice', secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('alice');
    expect(uri).toContain(TOTP_CONFIG.ISSUER);
  });
});

describe('generateQrDataUrl', () => {
  it('returns a base64 data URL', async () => {
    const secret = generateSecret();
    const uri = generateQrUri('bob', secret);
    const dataUrl = await generateQrDataUrl(uri);
    expect(dataUrl).toMatch(/^data:image\//);
    expect(dataUrl.length).toBeGreaterThan(100);
  });
});

describe('verifyCode', () => {
  it('returns false for an obviously wrong code', () => {
    const secret = generateSecret();
    expect(verifyCode('000000', secret)).toBe(false);
  });

  it('returns true for the current valid code', () => {
    const secret = generateSecret();
    // Generate the correct token with the same library and options
    const token = authenticator.generate(secret);
    expect(verifyCode(token, secret)).toBe(true);
  });

  it('returns false for a code from a different secret', () => {
    const secret1 = generateSecret();
    const secret2 = generateSecret();
    const token = authenticator.generate(secret1);
    expect(verifyCode(token, secret2)).toBe(false);
  });
});
