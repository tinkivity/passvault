import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sha1, checkBreachedPasswords } from './hibp.js';

// ---- sha1 ----------------------------------------------------------------

describe('sha1', () => {
  it('returns uppercase hex SHA-1 of a string', async () => {
    // SHA-1 of "password" is well-known
    const hash = await sha1('password');
    expect(hash).toBe('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  });

  it('returns different hashes for different inputs', async () => {
    const a = await sha1('alpha');
    const b = await sha1('bravo');
    expect(a).not.toBe(b);
  });
});

// ---- checkBreachedPasswords -----------------------------------------------

describe('checkBreachedPasswords', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns empty map for empty input', async () => {
    const result = await checkBreachedPasswords([]);
    expect(result.size).toBe(0);
  });

  it('detects a breached password', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    // prefix = 5BAA6, suffix = 1E4C9B93F3F0682250B6CF8331B7EE68FD8
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\n' +
        '0000000000000000000000000000000000000:1\r\n',
      ),
    });

    const result = await checkBreachedPasswords(['password']);
    expect(result.get('password')).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/range/5BAA6');
  });

  it('returns false for a non-breached password', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(
        '0000000000000000000000000000000000000:1\r\n' +
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:2\r\n',
      ),
    });

    const result = await checkBreachedPasswords(['MyVeryUniqueP@ss!']);
    expect(result.get('MyVeryUniqueP@ss!')).toBe(false);
  });

  it('deduplicates passwords and minimises fetch calls', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('0000000000000000000000000000000000000:1\r\n'),
    });

    const result = await checkBreachedPasswords(['abc', 'abc', 'abc']);
    // Only one unique password → one unique prefix → one fetch
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result.get('abc')).toBe(false);
  });

  it('returns empty map on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await checkBreachedPasswords(['password']);
    expect(result.size).toBe(0);

    warnSpy.mockRestore();
  });

  it('treats non-ok responses as non-breached', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve(''),
    });

    const result = await checkBreachedPasswords(['password']);
    expect(result.get('password')).toBe(false);
  });
});
