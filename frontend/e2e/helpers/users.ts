import type { APIRequestContext } from '@playwright/test';

/**
 * Admin-side user management helpers for e2e tests.
 *
 * These wrap the admin HTTP API. In dev, PoW is disabled
 * (config.features.powEnabled=false) so no challenge/solution is needed.
 *
 * Never invoke directly against prod — these endpoints require a valid
 * admin token and mutate real records.
 */

export interface CreatedTestUser {
  userId: string;
  username: string;
  oneTimePassword: string;
}

// Mirror of the fields the admin list endpoint actually returns — note that
// lockedUntil is NOT exposed via GET /api/admin/users, so lock state has to
// be checked through `status === 'locked'` rather than a timestamp.
export interface UserStateSummary {
  userId: string;
  username: string;
  status: string;
  expiresAt?: string | null;
  plan?: string;
  role?: string;
}

export async function createTestUser(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  opts: { plan?: 'free' | 'pro'; usernamePrefix?: string } = {},
): Promise<CreatedTestUser> {
  const prefix = opts.usernamePrefix ?? 'e2e-lifecycle';
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@passvault-test.local`;
  const res = await request.post(`${apiBase}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      username,
      plan: opts.plan ?? 'free',
      firstName: 'E2E',
      lastName: 'Test',
    },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`createTestUser failed: ${res.status()} ${JSON.stringify(body)}`);
  }
  return {
    userId: body.data.userId,
    username,
    oneTimePassword: body.data.oneTimePassword,
  };
}

export async function deleteTestUser(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  userId: string,
): Promise<void> {
  await request.delete(`${apiBase}/api/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

export async function getUserState(
  request: APIRequestContext,
  apiBase: string,
  token: string,
  userId: string,
): Promise<UserStateSummary | null> {
  // There is no single-user GET endpoint in the admin API — fetch the list
  // and filter. Acceptable for test dev volumes (< 100 users).
  const res = await request.get(`${apiBase}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`getUserState list failed: ${res.status()} ${JSON.stringify(body)}`);
  }
  const match = (body.data.users as UserStateSummary[]).find(u => u.userId === userId);
  return match ?? null;
}
