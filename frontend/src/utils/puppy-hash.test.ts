import { describe, it, expect } from 'vitest';
import { puppyIndex, puppySrc } from './puppy-hash.js';

describe('puppyIndex', () => {
  it('returns a number between 0 and 19 for any userId', () => {
    const testIds = [
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '00000000-0000-0000-0000-000000000000',
      '',
      'x',
    ];
    for (const id of testIds) {
      const idx = puppyIndex(id);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(20);
    }
  });

  it('is deterministic (same userId returns same index)', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const first = puppyIndex(id);
    const second = puppyIndex(id);
    const third = puppyIndex(id);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('distributes across all 20 values (with 100 random UUIDs)', () => {
    const seen = new Set<number>();
    // Use a deterministic set of "random" IDs
    for (let i = 0; i < 100; i++) {
      const fakeId = `user-${i}-${i * 17}-${i * 31}`;
      seen.add(puppyIndex(fakeId));
    }
    // With 100 inputs and 20 buckets, we should hit at least 15
    expect(seen.size).toBeGreaterThanOrEqual(15);
  });
});

describe('puppySrc', () => {
  it('returns /puppies/NN.jpg format (zero-padded)', () => {
    const src = puppySrc('some-user-id');
    expect(src).toMatch(/^\/puppies\/\d{2}\.jpg$/);
  });

  it('returns values in range /puppies/00.jpg to /puppies/19.jpg', () => {
    for (let i = 0; i < 50; i++) {
      const src = puppySrc(`user-${i}`);
      const num = parseInt(src.replace('/puppies/', '').replace('.jpg', ''), 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThan(20);
    }
  });
});
