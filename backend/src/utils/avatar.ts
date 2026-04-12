import { Jimp } from 'jimp';
import { LIMITS, ERRORS } from '@passvault/shared';

const VALID_MIME_TYPES = new Set(['image/png', 'image/jpeg']);

/**
 * Validate avatar upload request fields.
 * Returns an error string or null if valid.
 */
export function validateAvatarUpload(mimeType: string, base64Length: number): string | null {
  if (!VALID_MIME_TYPES.has(mimeType)) {
    return ERRORS.AVATAR_INVALID_TYPE;
  }
  // base64 inflates ~33%, so the raw bytes are roughly base64Length * 0.75
  const estimatedBytes = Math.floor(base64Length * 0.75);
  if (estimatedBytes > LIMITS.AVATAR_MAX_UPLOAD_BYTES) {
    return ERRORS.AVATAR_TOO_LARGE;
  }
  return null;
}

/**
 * Decode, resize to 256x256 (cover + center crop), and re-encode as JPEG q80.
 * Returns the resized image as a base64 string (no data-URI prefix).
 */
export async function processAvatar(base64Input: string, _mimeType: string): Promise<string> {
  const buffer = Buffer.from(base64Input, 'base64');
  const image = await Jimp.read(buffer);

  image.cover({ w: LIMITS.AVATAR_DIMENSION, h: LIMITS.AVATAR_DIMENSION });

  const outputBuffer = await image.getBuffer('image/jpeg', { quality: LIMITS.AVATAR_QUALITY });
  return Buffer.from(outputBuffer).toString('base64');
}
