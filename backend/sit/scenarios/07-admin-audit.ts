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

    it('admin_actions includes audit_config_changed', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=admin_actions`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      const configChanged = res.data.data.events.filter(e => e.action === 'audit_config_changed');
      expect(configChanged.length).toBeGreaterThan(0);
    });

    it('vault_operations: vault_opened recorded when index is fetched', async () => {
      // Wait for config cache to expire on vault Lambda (5s TTL + margin)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Fetch the vault index (this triggers vault_opened)
      const indexPath = API_PATHS.VAULT_INDEX.replace('{vaultId}', ctx.vaultId);
      const indexRes = await request<{ success: boolean }>('GET', indexPath, {
        token: ctx.proUserToken,
        powDifficulty: pow(HIGH),
      });
      expect(indexRes.status).toBe(200);

      // Wait for fire-and-forget write
      await new Promise(resolve => setTimeout(resolve, 2000));

      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=vault_operations`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      const actions = res.data.data.events.map(e => e.action);
      expect(actions).toContain('vault_opened');
    });

    it('vault_operations: vault_saved recorded after PUT', async () => {
      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=vault_operations`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      const actions = res.data.data.events.map(e => e.action);
      expect(actions).toContain('vault_saved');
    });

    it('vault_operations: vault_created recorded', async () => {
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

    it('vault_operations: vault_renamed recorded', async () => {
      // Trigger a rename
      const renamePath = `/api/vaults/${ctx.vaultId}`;
      const renameRes = await request<{ success: boolean }>('PATCH', renamePath, {
        body: { displayName: 'SIT Audit Final Name' },
        token: ctx.proUserToken,
        powDifficulty: pow(HIGH),
      });
      expect(renameRes.status).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=vault_operations`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      const actions = res.data.data.events.map(e => e.action);
      expect(actions).toContain('vault_renamed');
    });

    it('vault_operations: vault_downloaded recorded', async () => {
      // Trigger a download
      const downloadPath = API_PATHS.VAULT_DOWNLOAD.replace('{vaultId}', ctx.vaultId);
      const downloadRes = await request<{ success: boolean }>('GET', downloadPath, {
        token: ctx.proUserToken,
        powDifficulty: pow(HIGH),
      });
      expect(downloadRes.status).toBe(200);

      await new Promise(resolve => setTimeout(resolve, 2000));

      const res = await request<{ success: boolean; data: { events: AuditEvent[] } }>(
        'GET', `${API_PATHS.ADMIN_AUDIT_EVENTS}?category=vault_operations`, {
          token: ctx.adminToken,
          powDifficulty: pow(HIGH),
        },
      );

      expect(res.status).toBe(200);
      const actions = res.data.data.events.map(e => e.action);
      expect(actions).toContain('vault_downloaded');
    });
  });
}
