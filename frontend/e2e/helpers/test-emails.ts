export function testUserEmail(tag: string): string {
  const plus = process.env.PASSVAULT_PLUS_ADDRESS;
  if (plus && /^[^@\s]+@[^@\s]+$/.test(plus)) {
    const atIdx = plus.indexOf('@');
    const local = plus.slice(0, atIdx);
    const domain = plus.slice(atIdx + 1);
    return `${local}+${tag}@${domain}`;
  }
  return `${tag}@passvault-test.local`;
}
