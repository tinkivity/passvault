import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERRORS, LIMITS } from '@passvault/shared';

const mockImage = vi.hoisted(() => ({
  cover: vi.fn().mockReturnThis(),
  getBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-jpeg-output')),
}));

vi.mock('jimp', () => ({
  Jimp: {
    read: vi.fn().mockResolvedValue(mockImage),
  },
}));

import { validateAvatarUpload, processAvatar } from './avatar.js';

describe('validateAvatarUpload', () => {
  it('accepts image/png', () => {
    expect(validateAvatarUpload('image/png', 1000)).toBeNull();
  });

  it('accepts image/jpeg', () => {
    expect(validateAvatarUpload('image/jpeg', 1000)).toBeNull();
  });

  it('rejects image/gif', () => {
    expect(validateAvatarUpload('image/gif', 1000)).toBe(ERRORS.AVATAR_INVALID_TYPE);
  });

  it('rejects image/webp', () => {
    expect(validateAvatarUpload('image/webp', 1000)).toBe(ERRORS.AVATAR_INVALID_TYPE);
  });

  it('rejects text/plain', () => {
    expect(validateAvatarUpload('text/plain', 1000)).toBe(ERRORS.AVATAR_INVALID_TYPE);
  });

  it('rejects oversized base64 length', () => {
    // base64 length that decodes to > 1MB
    const oversizedLength = Math.ceil(LIMITS.AVATAR_MAX_UPLOAD_BYTES / 0.75) + 100;
    expect(validateAvatarUpload('image/jpeg', oversizedLength)).toBe(ERRORS.AVATAR_TOO_LARGE);
  });

  it('accepts base64 at the limit', () => {
    // base64 length that decodes to exactly 1MB
    const atLimit = Math.floor(LIMITS.AVATAR_MAX_UPLOAD_BYTES / 0.75);
    expect(validateAvatarUpload('image/jpeg', atLimit)).toBeNull();
  });
});

describe('processAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes valid JPEG base64 and returns base64 string', async () => {
    const result = await processAvatar('dGVzdA==', 'image/jpeg');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(mockImage.cover).toHaveBeenCalledWith({ w: LIMITS.AVATAR_DIMENSION, h: LIMITS.AVATAR_DIMENSION });
    expect(mockImage.getBuffer).toHaveBeenCalledWith('image/jpeg', { quality: LIMITS.AVATAR_QUALITY });
  });

  it('processes valid PNG base64', async () => {
    const result = await processAvatar('dGVzdA==', 'image/png');
    expect(typeof result).toBe('string');
  });
});
