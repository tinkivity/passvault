import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { EMAIL_TEMPLATE_CONFIG } from '@passvault/shared';
import type { EmailTemplateType } from '@passvault/shared';

const s3 = new S3Client({});
const BUCKET = process.env.TEMPLATES_BUCKET ?? '';
const CACHE_TTL = EMAIL_TEMPLATE_CONFIG.CACHE_TTL_MS;
const DEFAULT_LANG = EMAIL_TEMPLATE_CONFIG.DEFAULT_LANGUAGE;

// ── In-memory cache ──────────────────────────────────────────────────────────
interface CacheEntry {
  html: string;
  loadedAt: number;
}
const cache = new Map<string, CacheEntry>();

function cacheKey(type: string, language: string): string {
  return `${language}/${type}`;
}

// ── Template loading ─────────────────────────────────────────────────────────
async function loadTemplateFromS3(type: string, language: string): Promise<string | undefined> {
  const key = `templates/${language}/${type}.html`;
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return await res.Body?.transformToString('utf-8');
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return undefined;
    throw err;
  }
}

/**
 * Load a template with language fallback and caching.
 * Tries the requested language first, then falls back to English.
 */
export async function loadTemplate(
  type: EmailTemplateType,
  language: string,
): Promise<string> {
  // Check cache
  const key = cacheKey(type, language);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
    return cached.html;
  }

  // Try requested language
  let html = await loadTemplateFromS3(type, language);

  // Fallback to default language
  if (!html && language !== DEFAULT_LANG) {
    html = await loadTemplateFromS3(type, DEFAULT_LANG);
  }

  if (!html) {
    throw new Error(`Email template not found: ${type} (${language})`);
  }

  cache.set(key, { html, loadedAt: Date.now() });
  return html;
}

// ── Variable interpolation ───────────────────────────────────────────────────
/**
 * Replace {{variable}} placeholders and process conditional blocks.
 * Conditional blocks: {{#var}}...{{/var}} — kept if var is non-empty, stripped otherwise.
 * Works across both HTML and HTML-comment-wrapped markers (<!-- {{#var}} -->).
 */
export function renderTemplate(html: string, variables: Record<string, string>): string {
  // Process conditional blocks first
  let result = html.replace(
    /(?:<!--\s*)?\{\{#(\w+)\}\}(?:\s*-->)?([\s\S]*?)(?:<!--\s*)?\{\{\/\1\}\}(?:\s*-->)?/g,
    (_, varName: string, content: string) => variables[varName] ? content : '',
  );
  // Then replace simple variables
  result = result.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => variables[varName] ?? '');
  return result;
}

// ── Plain text extraction ────────────────────────────────────────────────────
/**
 * Extract the plain-text version from between marker comments,
 * or strip HTML tags as a fallback.
 */
export function extractPlainText(html: string): string {
  // Try structured markers first
  const markerMatch = html.match(
    /<!--\s*PLAIN_TEXT_START\s*-->([\s\S]*?)<!--\s*PLAIN_TEXT_END\s*-->/,
  );
  if (markerMatch) {
    return markerMatch[1].trim();
  }

  // Fallback: strip HTML tags and decode basic entities
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── User greeting resolution ─────────────────────────────────────────────────

/**
 * Resolve a display-friendly greeting name from user fields.
 * Priority: displayName → firstName (+lastName) → username (email).
 */
export function resolveGreeting(user: {
  username: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (user.displayName) return user.displayName;
  if (user.firstName) return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
  return user.username;
}

// ── Locale-aware time formatting ─────────────────────────────────────────────

const LANG_TIMEZONE: Record<string, string> = {
  en: 'America/New_York',
  de: 'Europe/Berlin',
  fr: 'Europe/Paris',
  ru: 'Europe/Moscow',
};

const LANG_LOCALE: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  ru: 'ru-RU',
};

/**
 * Format a Date as a human-readable absolute time with explicit timezone name.
 * Example (en): "Apr 12, 2026, 3:45 PM EDT"
 * Example (de): "12. Apr. 2026, 15:45 MEZ"
 */
export function formatAbsoluteTime(date: Date, language: string): string {
  const tz = LANG_TIMEZONE[language] ?? LANG_TIMEZONE.en;
  const locale = LANG_LOCALE[language] ?? LANG_LOCALE.en;
  return date.toLocaleString(locale, {
    timeZone: tz,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// ── High-level API ───────────────────────────────────────────────────────────
/**
 * Load, render, and return both HTML and plain-text versions of an email.
 * Automatically injects {{appName}}, {{appUrl}}, and {{year}}.
 */
export async function renderEmail(
  type: EmailTemplateType,
  language: string,
  variables: Record<string, string>,
): Promise<{ subject: string; html: string; plainText: string }> {
  const template = await loadTemplate(type, language);

  const appUrl = process.env.FRONTEND_URL ?? '';
  const allVars: Record<string, string> = {
    appName: 'PassVault',
    appUrl,
    logoUrl: appUrl ? `${appUrl}/logo.png` : '',
    recoveryGuideUrl: 'https://github.com/tinkivity/passvault/blob/main/docs/RECOVERY.md',
    year: new Date().getFullYear().toString(),
    ...variables,
  };

  const html = renderTemplate(template, allVars);
  const plainText = renderTemplate(extractPlainText(template), allVars);

  // Extract the translated subject from the <title> tag (already rendered with variables)
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const subject = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : 'PassVault';

  return { subject, html, plainText };
}

/** Decode basic HTML entities that may appear in <title> (e.g. German &uuml;). */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&uuml;/g, 'ü')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&szlig;/g, 'ß')
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&agrave;/g, 'à')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Clear the template cache (useful for testing or after admin uploads).
 */
export function clearTemplateCache(): void {
  cache.clear();
}
