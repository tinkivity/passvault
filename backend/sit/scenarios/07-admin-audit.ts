import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

export function adminAuditScenarios(ctx: SitContext) {
  describe('07 — Admin Audit', () => {
    it('gets audit config -> authentication enabled', async () => {
      const res = await request<{ success: boolean; data: { authentication: boolean } }>('GET', API_PATHS.ADMIN_AUDIT_CONFIG, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.authentication).toBe(true);
    });

    it('gets audit events (authentication) -> contains events', async () => {
      const res = await request<{ success: boolean; data: { events: unknown[] } }>('GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=authentication`, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.events.length).toBeGreaterThan(0);
    });

    it('enables admin_actions -> success', async () => {
      const res = await request<{ success: boolean }>('PUT', API_PATHS.ADMIN_AUDIT_CONFIG, {
        body: { authentication: true, admin_actions: true, vault_operations: false, system: false },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
    });

    it('verifies config updated -> admin_actions: true', async () => {
      const res = await request<{ success: boolean; data: { admin_actions: boolean } }>('GET', API_PATHS.ADMIN_AUDIT_CONFIG, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.admin_actions).toBe(true);
    });
  });
}
