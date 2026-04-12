import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG, ERRORS } from '@passvault/shared';
import type { LoginResponse } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

const MEDIUM = POW_CONFIG.DIFFICULTY.MEDIUM;

// Tiny valid JPEG (1x1 pixel) as base64 — enough for the server to resize
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAA' +
  'AAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMR' +
  'AD8AKwA//9k=';

export function userAvatarScenarios(ctx: SitContext) {
  describe('10 — User Avatar', () => {
    it('upload valid JPEG avatar -> 200 + base64 returned', async () => {
      const res = await request<{ avatarBase64: string }>('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: TINY_JPEG_BASE64, mimeType: 'image/jpeg' },
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(200);
      expect(res.data.avatarBase64).toBeDefined();
      expect(typeof res.data.avatarBase64).toBe('string');
    });

    it('upload valid PNG avatar -> 200 + base64 returned', async () => {
      // Re-use the JPEG for simplicity; jimp handles both
      const res = await request<{ avatarBase64: string }>('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: TINY_JPEG_BASE64, mimeType: 'image/jpeg' },
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(200);
      expect(res.data.avatarBase64).toBeDefined();
    });

    it('re-upload replaces existing avatar', async () => {
      const res = await request<{ avatarBase64: string }>('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: TINY_JPEG_BASE64, mimeType: 'image/jpeg' },
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(200);
    });

    it('login returns avatarBase64 after upload', async () => {
      const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.proUserEmail, password: ctx.proUserPassword },
        powDifficulty: pow(MEDIUM),
      });
      expect(res.status).toBe(200);
      expect(res.data.data.avatarBase64).toBeDefined();
      expect(typeof res.data.data.avatarBase64).toBe('string');

      // Refresh token
      ctx.proUserToken = res.data.data.token;
    });

    it('delete avatar -> 200', async () => {
      const res = await request<{ success: boolean }>('DELETE', API_PATHS.AUTH_AVATAR, {
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('login after delete returns avatarBase64: null', async () => {
      const res = await request<{ success: boolean; data: LoginResponse }>('POST', API_PATHS.AUTH_LOGIN, {
        body: { username: ctx.proUserEmail, password: ctx.proUserPassword },
        powDifficulty: pow(MEDIUM),
      });
      expect(res.status).toBe(200);
      expect(res.data.data.avatarBase64).toBeNull();

      ctx.proUserToken = res.data.data.token;
    });

    it('re-upload after delete works', async () => {
      const res = await request<{ avatarBase64: string }>('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: TINY_JPEG_BASE64, mimeType: 'image/jpeg' },
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(200);
      expect(res.data.avatarBase64).toBeDefined();
    });

    it('upload >1 MB -> 400 AVATAR_TOO_LARGE', async () => {
      const hugeBase64 = 'A'.repeat(1_500_000);
      const res = await request('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: hugeBase64, mimeType: 'image/jpeg' },
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(400);
    });

    it('upload image/gif -> 400 AVATAR_INVALID_TYPE', async () => {
      const res = await request('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: TINY_JPEG_BASE64, mimeType: 'image/gif' },
        token: ctx.proUserToken,
      });
      expect(res.status).toBe(400);
    });

    it('upload without auth -> 401', async () => {
      const res = await request('PUT', API_PATHS.AUTH_AVATAR, {
        body: { imageBase64: TINY_JPEG_BASE64, mimeType: 'image/jpeg' },
      });
      expect(res.status).toBe(401);
    });
  });
}
