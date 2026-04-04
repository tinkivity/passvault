/**
 * HIBP (Have I Been Pwned) k-Anonymity password breach check.
 *
 * For each password we SHA-1 hash it, send only the first 5 hex chars
 * to the HIBP range API, and check the response locally. The full
 * password hash never leaves the client.
 */

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

async function sha1(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Check a list of passwords against the HIBP breach database using
 * k-Anonymity (only 5-char SHA-1 prefixes are sent over the network).
 *
 * Returns a Map of password -> breached (true/false) for every input.
 * On network failure returns an empty map so vault operations are not blocked.
 */
export async function checkBreachedPasswords(passwords: string[]): Promise<Map<string, boolean>> {
  const unique = [...new Set(passwords)];
  if (unique.length === 0) return new Map();

  // Group passwords by their 5-char SHA-1 prefix to minimise requests.
  const prefixGroups = new Map<string, Array<{ password: string; suffix: string }>>();

  for (const pw of unique) {
    const hash = await sha1(pw);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const group = prefixGroups.get(prefix) ?? [];
    group.push({ password: pw, suffix });
    prefixGroups.set(prefix, group);
  }

  const result = new Map<string, boolean>();

  try {
    const entries = [...prefixGroups.entries()];
    await Promise.all(
      entries.map(async ([prefix, group]) => {
        const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
          headers: { 'Add-Padding': 'true' },
        });
        if (!response.ok) {
          // Treat API errors as non-breached to avoid blocking the user.
          for (const { password } of group) {
            result.set(password, false);
          }
          return;
        }
        const text = await response.text();
        const suffixes = new Set(
          text
            .split('\n')
            .map(line => line.split(':')[0]?.trim()),
        );
        for (const { password, suffix } of group) {
          result.set(password, suffixes.has(suffix));
        }
      }),
    );
  } catch (err) {
    console.warn('HIBP breach check failed — skipping:', err);
    return new Map();
  }

  return result;
}

export { sha1 };
