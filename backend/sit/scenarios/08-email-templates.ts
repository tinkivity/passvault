import { describe, it, expect, afterAll } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { CreateUserResponse } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';
import { testUserEmail } from '../lib/test-emails.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

let originalInvitationHtml = '';
// Track all template modifications so afterAll can restore them
const modifiedTemplates: Array<{ type: string; language: string; originalHtml: string | null }> = [];

export function emailTemplateScenarios(ctx: SitContext) {
  describe('08 — Email Template Management', () => {
    // Restore all modified templates after tests complete (even on failure)
    afterAll(async () => {
      for (const mod of modifiedTemplates) {
        try {
          if (mod.originalHtml) {
            await request('PUT', `/api/admin/email-templates/${mod.type}/${mod.language}`, {
              body: { html: mod.originalHtml },
              token: ctx.adminToken,
              powDifficulty: pow(HIGH),
            });
          }
          // Note: templates that didn't exist before (e.g. SIT-TEST-DE for invitation/de)
          // cannot be deleted via the API — they'll persist but are overwritten on next cdk deploy.
          // The _meta.json hash comparison will show them as "modified" until then.
        } catch (err) {
          console.error(`SIT cleanup: failed to restore template ${mod.type}/${mod.language}:`, err);
        }
      }
    });

    it('list templates returns seeded defaults', async () => {
      const res = await request<{ success: boolean; data: { templates: Array<{ type: string; language: string }> } }>(
        'GET', API_PATHS.ADMIN_EMAIL_TEMPLATES, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const templates = res.data.data.templates;
      expect(templates.length).toBeGreaterThan(0);

      const invitationEn = templates.find(t => t.type === 'invitation' && t.language === 'en');
      expect(invitationEn).toBeDefined();
    });

    it('download invitation/en template', async () => {
      const res = await request<{ success: boolean; data: { html: string } }>(
        'GET', '/api/admin/email-templates/invitation/en', {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.html).toContain('{{userName}}');

      originalInvitationHtml = res.data.data.html;
    });

    it('upload a custom template', async () => {
      // Track for cleanup
      modifiedTemplates.push({ type: 'invitation', language: 'en', originalHtml: originalInvitationHtml });

      const customHtml = originalInvitationHtml.replace(
        '{{userName}}',
        '{{userName}} (SIT-modified)',
      );

      const res = await request<{ success: boolean }>(
        'PUT', '/api/admin/email-templates/invitation/en', {
          body: { html: customHtml },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('verify upload persisted', async () => {
      const res = await request<{ success: boolean; data: { html: string } }>(
        'GET', '/api/admin/email-templates/invitation/en', {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.data.html).toContain('(SIT-modified)');
    });

    it('invalid language -> 400', async () => {
      const res = await request('GET', '/api/admin/email-templates/invitation/xx', {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(400);
    });

    it('upload template for new language (de)', async () => {
      // Save original DE template for cleanup (may not exist yet)
      const origRes = await request<{ success: boolean; data: { html: string } }>(
        'GET', '/api/admin/email-templates/invitation/de', {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );
      const originalDeHtml = origRes.status === 200 ? origRes.data.data.html : null;
      modifiedTemplates.push({ type: 'invitation', language: 'de', originalHtml: originalDeHtml });

      // Use a minimal test template — not a real translation, just verifying the upload mechanism
      const testDeHtml = '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>SIT Test DE</title></head><body><p>SIT-TEST-DE {{userName}}</p><!-- PLAIN_TEXT_START -->SIT-TEST-DE {{userName}}<!-- PLAIN_TEXT_END --></body></html>';

      const res = await request<{ success: boolean }>(
        'PUT', '/api/admin/email-templates/invitation/de', {
          body: { html: testDeHtml },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('list includes new language variant', async () => {
      const res = await request<{ success: boolean; data: { templates: Array<{ type: string; language: string }> } }>(
        'GET', API_PATHS.ADMIN_EMAIL_TEMPLATES, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);

      const invitationDe = res.data.data.templates.find(
        t => t.type === 'invitation' && t.language === 'de',
      );
      expect(invitationDe).toBeDefined();
    });

    it('verify de template has test content', async () => {
      const res = await request<{ success: boolean; data: { html: string } }>(
        'GET', '/api/admin/email-templates/invitation/de', {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.data.html).toContain('SIT-TEST-DE');
    });

    it('update user preferred language', async () => {
      const userPath = API_PATHS.ADMIN_USER.replace('{userId}', ctx.proUserId);

      const res = await request<{ success: boolean }>(
        'PATCH', userPath, {
          body: { preferredLanguage: 'de' },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    it('update user notification preferences', async () => {
      const userPath = API_PATHS.ADMIN_USER.replace('{userId}', ctx.proUserId);

      const res = await request<{ success: boolean }>(
        'PATCH', userPath, {
          body: { notificationPrefs: { vaultBackup: 'weekly' } },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    });

    // ---- Unsubscribe endpoint ----

    it('unsubscribe with missing token -> 400', async () => {
      const res = await request('POST', API_PATHS.AUTH_UNSUBSCRIBE, {
        body: {},
      });

      expect(res.status).toBe(400);
    });

    it('unsubscribe with invalid token -> 400', async () => {
      const res = await request<{ success: boolean; data: { message: string } }>(
        'POST', API_PATHS.AUTH_UNSUBSCRIBE, {
          body: { token: 'invalid-token-value' },
        },
      );

      expect(res.status).toBe(400);
    });

    it('unsubscribe with session JWT (wrong purpose) -> 400', async () => {
      const res = await request('POST', API_PATHS.AUTH_UNSUBSCRIBE, {
        body: { token: ctx.adminToken },
      });

      expect(res.status).toBe(400);
    });

    it('notification prefs unchanged after failed unsubscribe', async () => {
      // Verify the failed unsubscribe attempts didn't alter the user's prefs
      const userPath = API_PATHS.ADMIN_USER.replace('{userId}', ctx.proUserId);

      // First set prefs to weekly
      await request('PATCH', userPath, {
        body: { notificationPrefs: { vaultBackup: 'weekly' } },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      // Attempt invalid unsubscribe
      await request('POST', API_PATHS.AUTH_UNSUBSCRIBE, {
        body: { token: 'garbage' },
      });

      // Verify prefs are still weekly via list users
      const listRes = await request<{ success: boolean; data: { users: Array<{ userId: string; notificationPrefs?: { vaultBackup: string } | null }> } }>(
        'GET', API_PATHS.ADMIN_USERS, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(listRes.status).toBe(200);
      const user = listRes.data.data.users.find(u => u.userId === ctx.proUserId);
      expect(user?.notificationPrefs?.vaultBackup).toBe('weekly');
    });

    // ---- Version endpoint ----

    it('get template version', async () => {
      const res = await request<{ success: boolean; data: { version: string } }>(
        'GET', API_PATHS.ADMIN_EMAIL_TEMPLATES_VERSION, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.data.version).toBe('string');
      expect(res.data.data.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    // ---- Export ----

    let exportedData = '';
    let exportedFilename = '';

    it('export all templates', async () => {
      const res = await request<{ success: boolean; data: { filename: string; data: string } }>(
        'GET', `${API_PATHS.ADMIN_EMAIL_TEMPLATES_EXPORT}?modifiedOnly=false`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.filename).toBeDefined();
      expect(res.data.data.data).toBeDefined();
      expect(res.data.data.data.length).toBeGreaterThan(0);

      exportedData = res.data.data.data;
      exportedFilename = res.data.data.filename;
    });

    it('export filename contains .zip extension', async () => {
      expect(exportedFilename).toMatch(/\.zip$/);
    });

    // ---- Modified detection ----

    it('modify template and verify modified flag', async () => {
      const customHtml = originalInvitationHtml.replace(
        '{{userName}}',
        '{{userName}} (modified-flag-test)',
      );

      const putRes = await request<{ success: boolean }>(
        'PUT', '/api/admin/email-templates/invitation/en', {
          body: { html: customHtml },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(putRes.status).toBe(200);

      const listRes = await request<{ success: boolean; data: { templates: Array<{ type: string; language: string; modified?: boolean }> } }>(
        'GET', API_PATHS.ADMIN_EMAIL_TEMPLATES, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(listRes.status).toBe(200);
      const invEn = listRes.data.data.templates.find(t => t.type === 'invitation' && t.language === 'en');
      expect(invEn).toBeDefined();
      expect(invEn!.modified).toBe(true);
    });

    it('export modified only contains changed template', async () => {
      const res = await request<{ success: boolean; data: { filename: string; data: string } }>(
        'GET', `${API_PATHS.ADMIN_EMAIL_TEMPLATES_EXPORT}?modifiedOnly=true`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      // The zip should contain data (at least the modified template)
      expect(res.data.data.data.length).toBeGreaterThan(0);
    });

    // ---- Import ----

    it('import exported zip', async () => {
      // Use the full export zip from the earlier test
      const res = await request<{ success: boolean; data: { imported: number; warnings: string[]; errors: string[] } }>(
        'POST', API_PATHS.ADMIN_EMAIL_TEMPLATES_IMPORT, {
          body: { data: exportedData },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.imported).toBeGreaterThan(0);
    });

    // TODO: Testing import with unknown placeholders requires programmatically
    // creating a zip buffer. Skipping for now — covered by unit tests and
    // the pentest invalid-data scenarios above.

    it('create user with preferred language', async () => {
      const ts = Date.now();
      const email = testUserEmail(`sit-lang-${ts}`);

      const res = await request<{ success: boolean; data: CreateUserResponse }>(
        'POST', API_PATHS.ADMIN_USERS, {
          body: { username: email, plan: 'free', firstName: 'SIT', lastName: 'LangUser', preferredLanguage: 'fr' },
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(201);
      expect(res.data.data.userId).toBeDefined();

      // Track for cleanup
      ctx.createdUserIds.push(res.data.data.userId);
    });
  });
}
