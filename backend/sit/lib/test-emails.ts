export function testUserEmail(tag: string): string {
  const plus = process.env.PASSVAULT_PLUS_ADDRESS;
  if (plus && /^[^@\s]+@[^@\s]+$/.test(plus)) {
    const atIdx = plus.indexOf('@');
    const local = plus.slice(0, atIdx);
    const domain = plus.slice(atIdx + 1);
    return `${local}+${tag}@${domain}`;
  }
  // On beta/prod, PASSVAULT_PLUS_ADDRESS must be set — falling back to
  // @passvault-test.local would cause SES hard bounces and damage sender
  // reputation. Fail loudly instead of silently creating bad addresses.
  const env = process.env.SIT_ENV ?? process.env.ENVIRONMENT ?? '';
  if (env === 'beta' || env === 'prod') {
    throw new Error(
      `PASSVAULT_PLUS_ADDRESS is required on ${env} to avoid SES hard bounces. ` +
      `Set it to your verified plus-address (e.g. ops@example.com).`,
    );
  }
  return `${tag}@passvault-test.local`;
}
