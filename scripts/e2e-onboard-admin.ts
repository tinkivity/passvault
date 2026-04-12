#!/usr/bin/env npx tsx
/**
 * Onboard an E2E admin user via API (login with OTP + change password).
 * Handles PoW challenge/solve for beta/prod where powEnabled=true.
 *
 * Env vars:
 *   E2E_API_BASE_URL  — API base URL (e.g. https://beta.pv.example.com)
 *   E2E_EMAIL         — Admin username (email)
 *   E2E_OTP           — One-time password from sit-create-admin.ts
 *   E2E_PASSWORD      — New password to set
 *
 * Outputs JSON on success: { "token": "...", "userId": "..." }
 * Exits with code 1 on failure.
 */

import { createHash } from 'crypto';

const API_BASE = process.env.E2E_API_BASE_URL ?? '';
const EMAIL = process.env.E2E_EMAIL ?? '';
const OTP = process.env.E2E_OTP ?? '';
const NEW_PASSWORD = process.env.E2E_PASSWORD ?? '';

if (!API_BASE || !EMAIL || !OTP || !NEW_PASSWORD) {
  console.error('Missing required env vars: E2E_API_BASE_URL, E2E_EMAIL, E2E_OTP, E2E_PASSWORD');
  process.exit(1);
}

// ── PoW solver ────────────────────────────────────────────────────────────────

function hashMeetsDifficulty(hash: string, difficulty: number): boolean {
  const fullNibbles = Math.floor(difficulty / 4);
  for (let i = 0; i < fullNibbles; i++) {
    if (hash[i] !== '0') return false;
  }
  const remainingBits = difficulty % 4;
  if (remainingBits > 0) {
    const nibble = parseInt(hash[fullNibbles], 16);
    const mask = (0xF << (4 - remainingBits)) & 0xF;
    if (nibble & mask) return false;
  }
  return true;
}

function solvePoW(nonce: string, timestamp: number, difficulty: number): string {
  let counter = 0;
  while (true) {
    const solution = counter.toString(16).padStart(16, '0');
    const hash = createHash('sha256')
      .update(nonce + solution + timestamp.toString())
      .digest('hex');
    if (hashMeetsDifficulty(hash, difficulty)) return solution;
    counter++;
  }
}

async function getPowHeaders(difficulty: number): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/api/challenge`);
    const json = await res.json() as { success: boolean; data?: { nonce: string; timestamp: number; difficulty: number } };
    if (!json.success || !json.data) return {};
    const { nonce, timestamp } = json.data;
    const solution = solvePoW(nonce, timestamp, difficulty);
    return {
      'X-Pow-Solution': solution,
      'X-Pow-Nonce': nonce,
      'X-Pow-Timestamp': timestamp.toString(),
    };
  } catch {
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Login with OTP (retry for GSI propagation)
  let token = '';
  let lastBody: unknown = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const powHeaders = await getPowHeaders(18); // MEDIUM
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...powHeaders },
      body: JSON.stringify({ username: EMAIL, password: OTP }),
    });
    const body = await loginRes.json() as { success?: boolean; data?: { token?: string; userId?: string } };
    lastBody = body;
    if (body.success && body.data?.token) {
      token = body.data.token;
      break;
    }
    if (attempt < 5) {
      process.stderr.write(`  Login attempt ${attempt} returned no token; retrying in 2s (likely GSI propagation)...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!token) {
    process.stderr.write(`  ERROR: Failed to login E2E admin with OTP after 5 attempts.\n`);
    process.stderr.write(`  Response: ${JSON.stringify(lastBody)}\n`);
    process.exit(1);
  }

  // Change password
  const cpPowHeaders = await getPowHeaders(18); // MEDIUM
  const cpRes = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...cpPowHeaders,
    },
    body: JSON.stringify({ newPassword: NEW_PASSWORD }),
  });
  const cpBody = await cpRes.json() as { success?: boolean };
  if (!cpBody.success) {
    process.stderr.write(`  ERROR: Failed to change E2E admin password.\n`);
    process.stderr.write(`  Response: ${JSON.stringify(cpBody)}\n`);
    process.exit(1);
  }

  // Output token for the script to capture
  process.stdout.write(JSON.stringify({ token, success: true }));
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
