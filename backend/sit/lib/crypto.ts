import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { ARGON2_PARAMS, AES_PARAMS } from '@passvault/shared';

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return (await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: ARGON2_PARAMS.memory,
    timeCost: ARGON2_PARAMS.iterations,
    parallelism: ARGON2_PARAMS.parallelism,
    hashLength: ARGON2_PARAMS.hashLength,
    salt,
    raw: true,
  })) as Buffer;
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(AES_PARAMS.ivLength);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertextPart = cipher.update(plaintext, 'utf8');
  cipher.final();
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertextPart, tag]).toString('base64');
}

export function decrypt(ciphertext: string, key: Buffer): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, AES_PARAMS.ivLength);
  const tagStart = buf.length - (AES_PARAMS.tagLength / 8);
  const tag = buf.subarray(tagStart);
  const data = buf.subarray(AES_PARAMS.ivLength, tagStart);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = decipher.update(data);
  decipher.final();
  return decrypted.toString('utf8');
}
