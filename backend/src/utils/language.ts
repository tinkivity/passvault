import { EMAIL_TEMPLATE_CONFIG } from '@passvault/shared';
import type { PreferredLanguage } from '@passvault/shared';

const SUPPORTED = EMAIL_TEMPLATE_CONFIG.SUPPORTED_LANGUAGES as readonly string[];
const DEFAULT = EMAIL_TEMPLATE_CONFIG.DEFAULT_LANGUAGE;

/**
 * Resolve a concrete language code from the user's preference and/or
 * the Accept-Language header. Falls back to English.
 */
export function resolveLanguage(
  preferredLanguage: PreferredLanguage | undefined,
  acceptLanguageHeader?: string,
): string {
  // Explicit preference takes precedence
  if (preferredLanguage && preferredLanguage !== 'auto') {
    return SUPPORTED.includes(preferredLanguage) ? preferredLanguage : DEFAULT;
  }

  // Parse Accept-Language header
  if (acceptLanguageHeader) {
    const match = parseAcceptLanguage(acceptLanguageHeader);
    if (match) return match;
  }

  return DEFAULT;
}

/**
 * Parse Accept-Language header and return the best matching supported language.
 * Format: "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
 */
function parseAcceptLanguage(header: string): string | undefined {
  const entries = header
    .split(',')
    .map((part) => {
      const [langTag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
      // Extract the primary language subtag (e.g., "de" from "de-DE")
      const lang = langTag.trim().split('-')[0].toLowerCase();
      return { lang, q };
    })
    .filter(({ q }) => !isNaN(q) && q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { lang } of entries) {
    if (SUPPORTED.includes(lang)) return lang;
  }

  return undefined;
}
