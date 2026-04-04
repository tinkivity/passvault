import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { SitContext } from '../lib/context.js';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

interface AuditEvent {
  eventId: string;
  category: string;
  action: string;
  userId: string;
  username?: string;
  performedBy?: string;
  performedByUsername?: string;
  timestamp: string;
  details?: Record<string, string>;
}

export function adminAuditScenarios(ctx: SitContext) {
  describe('07 — Admin Audit', () => {
    it('gets audit config -> authentication enabled by default', async () => {
      const res = await request<{ success: boolean; data: { authentication: boolean } }>('GET', API_PATHS.ADMIN_AUDIT_CONFIG, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.authentication).toBe(true);
    });

    it('enables all audit categories', async () => {
      const res = await request<{ success: boolean }>('PUT', API_PATHS.ADMIN_AUDIT_CONFIG, {
        body: { authentication: true, admin_actions: true, vault_operations: true, system: true },
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
    });

    it('verifies all categories enabled', async () => {
      const res = await request<{ success: boolean; data: Record<string, boolean> }>('GET', API_PATHS.ADMIN_AUDIT_CONFIG, {
        token: ctx.adminToken,
        powDifficulty: pow(HIGH),
      });

      expect(res.status).toBe(200);
      expect(res.data.data.authentication).toBe(true);
      expect(res.data.data.admin_actions).toBe(true);
      expect(res.data.data.vault_operations).toBe(true);
      expect(res.data.data.system).toBe(true);
    });

    it('authentication events have usernames resolved (not just IDs)', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=authentication`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.data.events.length).toBeGreaterThan(0);

      // At least one event should have a resolved username (not just a UUID)
      const withUsername = res.data.data.events.filter(e => e.username && !e.username.includes('-'));
      expect(withUsername.length).toBeGreaterThan(0);
    });

    it('admin_actions events have performedBy populated', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=admin_actions`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      // We created users in scenario 02 — those events should have performedBy
      const adminActions = res.data.data.events.filter(e => e.action === 'user_created');
      if (adminActions.length > 0) {
        // performedBy should be the admin's userId and performedByUsername should be resolved
        expect(adminActions[0].performedBy).toBeDefined();
        expect(adminActions[0].performedByUsername).toBeDefined();
      }
    });

    it('vault_operations events exist after vault CRUD in earlier scenarios', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=vault_operations`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      // Scenario 04 created and deleted vaults — those should be logged
      const actions = res.data.data.events.map(e => e.action);
      expect(actions).toContain('vault_created');
    });
  });
}
