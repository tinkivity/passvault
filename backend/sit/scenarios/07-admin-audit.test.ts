import { describe, it, expect } from 'vitest';
import { request, pow } from '../lib/client.js';
import { ctx } from '../lib/context.js';
import { API_PATHS, POW_CONFIG } from '@passvault/shared';
import type { ListLoginEventsResponse, AdminStats } from '@passvault/shared';

const HIGH = POW_CONFIG.DIFFICULTY.HIGH;

describe('07 — Admin Audit', () => {
  it('gets admin stats -> includes login data', async () => {
    const res = await request<{ success: boolean; data: AdminStats }>('GET', API_PATHS.ADMIN_STATS, {
      token: ctx.adminToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(typeof res.data.data.totalUsers).toBe('number');
    expect(typeof res.data.data.loginsLast7Days).toBe('number');
    expect(typeof res.data.data.totalVaultSizeBytes).toBe('number');
  });

  it('gets login events -> contains events from this test run', async () => {
    const res = await request<{ success: boolean; data: ListLoginEventsResponse }>('GET', API_PATHS.ADMIN_LOGIN_EVENTS, {
      token: ctx.adminToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.events)).toBe(true);
    // There should be login events from the scenarios we ran above
    expect(res.data.data.events.length).toBeGreaterThan(0);
  });

  it('login events include SIT admin logins', async () => {
    const res = await request<{ success: boolean; data: ListLoginEventsResponse }>('GET', API_PATHS.ADMIN_LOGIN_EVENTS, {
      token: ctx.adminToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    const adminEvents = res.data.data.events.filter(e => e.username === ctx.adminEmail);
    expect(adminEvents.length).toBeGreaterThan(0);
  });

  it('login events include SIT pro user logins', async () => {
    const res = await request<{ success: boolean; data: ListLoginEventsResponse }>('GET', API_PATHS.ADMIN_LOGIN_EVENTS, {
      token: ctx.adminToken,
      powDifficulty: pow(HIGH),
    });

    expect(res.status).toBe(200);
    const proEvents = res.data.data.events.filter(e => e.username === ctx.proUserEmail);
    expect(proEvents.length).toBeGreaterThan(0);
  });
});
