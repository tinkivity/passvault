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
    it('audit config has all categories enabled (set in scenario 02)', async () => {
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

    it('authentication events have usernames resolved', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=authentication`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      expect(res.data.data.events.length).toBeGreaterThan(0);

      // Events should have username field populated (an email address, not undefined)
      const withUsername = res.data.data.events.filter(e => e.username && e.username.includes('@'));
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
      const userCreated = res.data.data.events.filter(e => e.action === 'user_created');
      expect(userCreated.length).toBeGreaterThan(0);
      expect(userCreated[0].performedBy).toBeDefined();
      expect(userCreated[0].performedByUsername).toBeDefined();
    });

    it('vault_operations events exist from earlier scenarios', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=vault_operations`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      const actions = res.data.data.events.map(e => e.action);
      expect(actions).toContain('vault_created');
    });
  });
}
