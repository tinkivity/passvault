const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{};\':"|,.<>/?';

const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

/**
 * Generate a cryptographically random password of the given length.
 * Guarantees at least one character from each class.
 */
export function generateSecurePassword(length = 20): string {
  if (length < 4) throw new Error('Password length must be at least 4');

  const required = [
    UPPERCASE[randomIndex(UPPERCASE.length)],
    LOWERCASE[randomIndex(LOWERCASE.length)],
    DIGITS[randomIndex(DIGITS.length)],
    SYMBOLS[randomIndex(SYMBOLS.length)],
  ];

  const rest: string[] = [];
  for (let i = required.length; i < length; i++) {
    rest.push(ALL_CHARS[randomIndex(ALL_CHARS.length)]);
  }

  const combined = [...required, ...rest];
  // Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join('');
}

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}
