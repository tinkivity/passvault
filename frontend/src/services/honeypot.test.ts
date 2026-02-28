import { describe, it, expect } from 'vitest';
import { createHoneypot, getHoneypotFields, getElapsedMs } from './honeypot';

describe('createHoneypot', () => {
  it('creates all four honeypot fields with empty values', () => {
    const state = createHoneypot();
    expect(state.fields).toEqual({
      email_confirm: '',
      phone: '',
      website: '',
      fax: '',
    });
  });

  it('sets startTime to approximately now', () => {
    const before = Date.now();
    const state = createHoneypot();
    const after = Date.now();
    expect(state.startTime).toBeGreaterThanOrEqual(before);
    expect(state.startTime).toBeLessThanOrEqual(after);
  });
});

describe('getHoneypotFields', () => {
  it('returns the honeypot fields', () => {
    const state = createHoneypot();
    const fields = getHoneypotFields(state);
    expect(fields).toEqual({ email_confirm: '', phone: '', website: '', fax: '' });
  });

  it('returns a shallow copy, not the original reference', () => {
    const state = createHoneypot();
    const fields = getHoneypotFields(state);
    expect(fields).not.toBe(state.fields);
  });
});

describe('getElapsedMs', () => {
  it('returns elapsed milliseconds since startTime', () => {
    const state = { fields: {}, startTime: Date.now() - 500 };
    const elapsed = getElapsedMs(state as ReturnType<typeof createHoneypot>);
    expect(elapsed).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(1000);
  });

  it('returns near-zero elapsed for a freshly created honeypot', () => {
    const state = createHoneypot();
    const elapsed = getElapsedMs(state);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(50);
  });
});
