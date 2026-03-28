import { describe, it, expect } from 'vitest';
import { computeWarnings } from './useVault.js';
import type { VaultItem } from '@passvault/shared';

function makeLogin(id: string, password: string): VaultItem {
  return {
    id,
    name: `Login ${id}`,
    category: 'login',
    username: 'user',
    password,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    warningCodes: [],
  } as unknown as VaultItem;
}

function makeNote(id: string): VaultItem {
  return {
    id,
    name: `Note ${id}`,
    category: 'note',
    format: 'raw',
    text: 'some text',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    warningCodes: [],
  } as unknown as VaultItem;
}

describe('computeWarnings — duplicate_password', () => {
  it('flags both items when two logins share the same password', () => {
    const items = [makeLogin('a', 'SharedPass1!'), makeLogin('b', 'SharedPass1!')];
    const result = computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).toContain('duplicate_password');
    expect(result.find(i => i.id === 'b')!.warningCodes).toContain('duplicate_password');
  });

  it('does not flag items with unique passwords', () => {
    const items = [makeLogin('a', 'UniquePass1!'), makeLogin('b', 'DifferentPass2!')];
    const result = computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('duplicate_password');
    expect(result.find(i => i.id === 'b')!.warningCodes).not.toContain('duplicate_password');
  });

  it('flags only the items that share a password, not others', () => {
    const items = [
      makeLogin('a', 'SharedPass1!'),
      makeLogin('b', 'SharedPass1!'),
      makeLogin('c', 'UniquePass3!'),
    ];
    const result = computeWarnings(items);
    expect(result.find(i => i.id === 'c')!.warningCodes).not.toContain('duplicate_password');
  });

  it('notes are not checked for duplicate passwords', () => {
    const items = [makeNote('n1'), makeNote('n2')];
    const result = computeWarnings(items);
    expect(result.every(i => !i.warningCodes.includes('duplicate_password'))).toBe(true);
  });
});

describe('computeWarnings — too_simple_password', () => {
  it('flags a login with a weak password', () => {
    const items = [makeLogin('a', 'weak')];
    const result = computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).toContain('too_simple_password');
  });

  it('does not flag a login with a strong password', () => {
    const items = [makeLogin('a', 'StrongPass123!')];
    const result = computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('too_simple_password');
  });

  it('can have both duplicate_password and too_simple_password on the same item', () => {
    const items = [makeLogin('a', 'weak'), makeLogin('b', 'weak')];
    const result = computeWarnings(items);
    const item = result.find(i => i.id === 'a')!;
    expect(item.warningCodes).toContain('duplicate_password');
    expect(item.warningCodes).toContain('too_simple_password');
  });

  it('clears warnings from previous run (does not accumulate codes)', () => {
    const items = [makeLogin('a', 'StrongPass123!')];
    items[0] = { ...items[0], warningCodes: ['too_simple_password'] as never };
    const result = computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('too_simple_password');
  });
});
