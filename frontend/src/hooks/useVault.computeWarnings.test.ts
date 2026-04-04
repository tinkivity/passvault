import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeWarnings } from './useVault.js';
import type { VaultItem } from '@passvault/shared';

// Mock HIBP to avoid real network calls — return empty map (no breaches) by default
vi.mock('../services/hibp.js', () => ({
  checkBreachedPasswords: vi.fn().mockResolvedValue(new Map()),
}));

import { checkBreachedPasswords } from '../services/hibp.js';
const mockCheckBreached = vi.mocked(checkBreachedPasswords);

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

function makeWifi(id: string, password: string): VaultItem {
  return {
    id,
    name: `Wifi ${id}`,
    category: 'wifi',
    ssid: 'test',
    password,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    warningCodes: [],
  } as unknown as VaultItem;
}

function makePrivateKey(id: string, passphrase?: string): VaultItem {
  return {
    id,
    name: `Key ${id}`,
    category: 'private_key',
    privateKey: 'ssh-rsa AAAA...',
    passphrase,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    warningCodes: [],
  } as unknown as VaultItem;
}

beforeEach(() => {
  mockCheckBreached.mockResolvedValue(new Map());
});

describe('computeWarnings — duplicate_password', () => {
  it('flags both items when two logins share the same password', async () => {
    const items = [makeLogin('a', 'SharedPass1!'), makeLogin('b', 'SharedPass1!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).toContain('duplicate_password');
    expect(result.find(i => i.id === 'b')!.warningCodes).toContain('duplicate_password');
  });

  it('does not flag items with unique passwords', async () => {
    const items = [makeLogin('a', 'UniquePass1!'), makeLogin('b', 'DifferentPass2!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('duplicate_password');
    expect(result.find(i => i.id === 'b')!.warningCodes).not.toContain('duplicate_password');
  });

  it('flags only the items that share a password, not others', async () => {
    const items = [
      makeLogin('a', 'SharedPass1!'),
      makeLogin('b', 'SharedPass1!'),
      makeLogin('c', 'UniquePass3!'),
    ];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'c')!.warningCodes).not.toContain('duplicate_password');
  });

  it('notes are not checked for duplicate passwords', async () => {
    const items = [makeNote('n1'), makeNote('n2')];
    const result = await computeWarnings(items);
    expect(result.every(i => !i.warningCodes.includes('duplicate_password'))).toBe(true);
  });
});

describe('computeWarnings — too_simple_password', () => {
  it('flags a login with a weak password', async () => {
    const items = [makeLogin('a', 'weak')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).toContain('too_simple_password');
  });

  it('does not flag a login with a strong password', async () => {
    const items = [makeLogin('a', 'StrongPass123!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('too_simple_password');
  });

  it('can have both duplicate_password and too_simple_password on the same item', async () => {
    const items = [makeLogin('a', 'weak'), makeLogin('b', 'weak')];
    const result = await computeWarnings(items);
    const item = result.find(i => i.id === 'a')!;
    expect(item.warningCodes).toContain('duplicate_password');
    expect(item.warningCodes).toContain('too_simple_password');
  });

  it('clears warnings from previous run (does not accumulate codes)', async () => {
    const items = [makeLogin('a', 'StrongPass123!')];
    items[0] = { ...items[0], warningCodes: ['too_simple_password'] as never };
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('too_simple_password');
  });
});

describe('computeWarnings — breached_password', () => {
  it('flags a login whose password is breached', async () => {
    mockCheckBreached.mockResolvedValue(new Map([['Breached1!', true]]));
    const items = [makeLogin('a', 'Breached1!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).toContain('breached_password');
  });

  it('does not flag a login whose password is not breached', async () => {
    mockCheckBreached.mockResolvedValue(new Map([['SafePass1!', false]]));
    const items = [makeLogin('a', 'SafePass1!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('breached_password');
  });

  it('flags wifi items with breached passwords', async () => {
    mockCheckBreached.mockResolvedValue(new Map([['WifiPass1!', true]]));
    const items = [makeWifi('w1', 'WifiPass1!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'w1')!.warningCodes).toContain('breached_password');
  });

  it('flags private_key passphrase but not privateKey itself', async () => {
    mockCheckBreached.mockResolvedValue(new Map([['MyPassphrase1!', true]]));
    const items = [makePrivateKey('pk1', 'MyPassphrase1!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'pk1')!.warningCodes).toContain('breached_password');
    // privateKey value should NOT have been checked
    expect(mockCheckBreached).toHaveBeenCalledWith(['MyPassphrase1!']);
  });

  it('does not flag private_key items without passphrase', async () => {
    const items = [makePrivateKey('pk1')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'pk1')!.warningCodes).not.toContain('breached_password');
  });

  it('does not flag notes for breach', async () => {
    const items = [makeNote('n1')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'n1')!.warningCodes).not.toContain('breached_password');
  });

  it('gracefully handles empty map from failed breach check', async () => {
    mockCheckBreached.mockResolvedValue(new Map());
    const items = [makeLogin('a', 'AnyPass1!')];
    const result = await computeWarnings(items);
    expect(result.find(i => i.id === 'a')!.warningCodes).not.toContain('breached_password');
  });
});
