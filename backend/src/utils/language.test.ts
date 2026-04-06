import { describe, it, expect } from 'vitest';
import { resolveLanguage } from './language.js';

describe('resolveLanguage', () => {
  it('returns explicit preference when set', () => {
    expect(resolveLanguage('de')).toBe('de');
    expect(resolveLanguage('fr')).toBe('fr');
    expect(resolveLanguage('ru')).toBe('ru');
    expect(resolveLanguage('en')).toBe('en');
  });

  it('falls back to en for unsupported explicit language', () => {
    expect(resolveLanguage('ja' as 'en')).toBe('en');
  });

  it('parses Accept-Language when preference is auto', () => {
    expect(resolveLanguage('auto', 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('de');
    expect(resolveLanguage('auto', 'fr-FR,fr;q=0.9,en;q=0.5')).toBe('fr');
    expect(resolveLanguage('auto', 'ru-RU,ru;q=0.9')).toBe('ru');
  });

  it('parses Accept-Language when preference is undefined', () => {
    expect(resolveLanguage(undefined, 'de-DE,de;q=0.9')).toBe('de');
  });

  it('returns en when Accept-Language has no supported language', () => {
    expect(resolveLanguage('auto', 'ja-JP,zh-CN;q=0.9')).toBe('en');
  });

  it('returns en when no preference and no header', () => {
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage('auto')).toBe('en');
  });

  it('handles Accept-Language with quality factors correctly', () => {
    // en has lower q than de, so de should be selected
    expect(resolveLanguage('auto', 'en;q=0.5,de;q=0.9')).toBe('de');
  });

  it('handles wildcard and malformed entries gracefully', () => {
    expect(resolveLanguage('auto', '*;q=0.1')).toBe('en');
    expect(resolveLanguage('auto', '')).toBe('en');
  });
});
