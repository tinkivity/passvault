#!/usr/bin/env npx tsx
/**
 * PassVault API smoke tests — run against any deployed stack.
 *
 * Usage:
 *   ENVIRONMENT=beta npx tsx scripts/smoke-test.ts
 *   ENVIRONMENT=beta npx tsx scripts/smoke-test.ts --password <admin-password>
 *   AWS_PROFILE=my-profile ENVIRONMENT=prod npx tsx scripts/smoke-test.ts --base-url https://pv.example.com --password <pass>
 *
 * Options:
 *   --password <pw>    Admin password — enables auth and users tests
 *   --base-url <url>   Override the API base URL (skips CloudFormation lookup)
 *   --profile  <name>  AWS named profile (sets AWS_PROFILE)
 *   --region   <reg>   AWS region (default: eu-central-1)
 *   --stack    <name>  CloudFormation stack name (overrides ENVIRONMENT default)
 *
 * Exit code: 0 = all tests passed, 1 = one or more tests failed.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { getEnvironmentConfig } from '@passvault/shared';
import { API_PATHS, POW_HEADERS, POW_CONFIG, ERRORS } from '@passvault/shared';
import type { ChallengeResponse, LoginResponse, ListUsersResponse } from '@passvault/shared';

// ── ANSI helpers ────────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const green  = (s: string) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red    = (s: string) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const yellow = (s: string) => isTTY ? `\x1b[33m${s}\x1b[0m` : s;
const dim    = (s: string) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;
const bold   = (s: string) => isTTY ? `\x1b[1m${s}\x1b[0m` : s;

// ── Argument parsing ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const ENV       = process.env.ENVIRONMENT ?? 'dev';
const PROFILE   = getArg('--profile');
const REGION    = getArg('--region') ?? 'eu-central-1';
const STACK_ARG = getArg('--stack');
const BASE_URL  = getArg('--base-url');
const PASSWORD  = getArg('--password');

if (PROFILE) process.env.AWS_PROFILE = PROFILE;

const config = getEnvironmentConfig(ENV);
const STACK  = STACK_ARG ?? config.stackName;

// ── API URL resolution ───────────────────────────────────────────────────────

function cfnOutput(key: string): string {
  const out = execSync(
    `aws cloudformation describe-stacks \
      --stack-name "${STACK}" \
      --region "${REGION}" \
      --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" \
      --output text`,
    { stdio: ['pipe', 'pipe', 'pipe'] },
  ).toString().trim();
  if (!out || out === 'None') throw new Error(`CloudFormation output "${key}" not found in stack ${STACK}`);
  return out.replace(/\/$/, '');  // strip trailing slash
}

function resolveApiUrl(): string {
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');

  console.log(dim(`  Fetching ApiUrl from CloudFormation stack ${STACK} (${REGION})...`));
  try {
    return cfnOutput('ApiUrl');
  } catch (err) {
    console.error(red(`  Error reading stack outputs: ${(err as Error).message}`));
    console.error(dim(`  Tip: pass --base-url <url> to skip CloudFormation lookup`));
    process.exit(1);
  }
}

// ── PoW solver (Node.js implementation, matches pow-worker.ts) ───────────────

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

// ── HTTP client ──────────────────────────────────────────────────────────────

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  /** PoW difficulty to solve to. If omitted, no PoW is sent. */
  powDifficulty?: number;
}

async function apiRequest<T>(baseUrl: string, path: string, opts: RequestOptions = {}): Promise<{
  status: number;
  ok: boolean;
  data: T | null;
  error: string | null;
  raw: unknown;
}> {
  const { method = 'GET', body, token, powDifficulty } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (powDifficulty !== undefined) {
    const cr = await apiRequest<ChallengeResponse>(baseUrl, API_PATHS.CHALLENGE, {});
    if (!cr.ok || !cr.data) throw new Error('Failed to fetch PoW challenge');
    const { nonce, timestamp } = cr.data;
    // Solve to the endpoint's required difficulty (same as frontend: override challenge difficulty)
    const solution = solvePoW(nonce, timestamp, powDifficulty);
    headers[POW_HEADERS.SOLUTION]  = solution;
    headers[POW_HEADERS.NONCE]     = nonce;
    headers[POW_HEADERS.TIMESTAMP] = timestamp.toString();
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let raw: unknown = null;
  try { raw = await res.json(); } catch { /* non-JSON response */ }

  const json = raw as { success?: boolean; data?: T; error?: string } | null;

  return {
    status: res.status,
    ok: res.ok && json?.success === true,
    data: json?.data ?? null,
    error: json?.error ?? null,
    raw,
  };
}

// ── Test runner ──────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  note: string;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<{ pass: boolean; note?: string } | void>,
): Promise<{ pass: boolean; note: string }> {
  try {
    const result = await fn();
    const pass = result == null ? true : result.pass;
    const note = result == null ? '' : (result.note ?? '');
    results.push({ name, passed: pass, skipped: false, note });
    console.log(`  ${pass ? green('✓') : red('✗')} ${name}${note ? dim('  ' + note) : ''}`);
    return { pass, note };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, skipped: false, note: msg });
    console.log(`  ${red('✗')} ${name}  ${dim(msg)}`);
    return { pass: false, note: msg };
  }
}

function skip(name: string, reason: string) {
  results.push({ name, passed: true, skipped: true, note: reason });
  console.log(`  ${yellow('○')} ${name}  ${dim('skipped: ' + reason)}`);
}

// ── Assertions ───────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertField<T extends object>(obj: T, field: keyof T, type?: string): void {
  assert(field in obj && obj[field] != null, `missing field: ${String(field)}`);
  if (type) assert(typeof obj[field] === type, `${String(field)} expected ${type}, got ${typeof obj[field]}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(bold('PassVault Smoke Tests'));
  console.log(dim(`  Environment : ${ENV}`));
  console.log(dim(`  Region      : ${REGION}`));
  console.log(dim(`  Stack       : ${STACK}`));
  console.log(dim(`  PoW enabled : ${config.features.powEnabled}`));
  console.log('');

  const baseUrl = resolveApiUrl();
  console.log(dim(`  API base    : ${baseUrl}`));
  console.log('');

  // Convenience: only pass powDifficulty when PoW is enabled for this env
  const pow = (difficulty: number) => config.features.powEnabled ? difficulty : undefined;

  // ── Public endpoint tests ──────────────────────────────────────────────────

  console.log(bold('Public endpoints'));

  await test('GET /api/health → 200 ok', async () => {
    const r = await apiRequest<{ status: string }>(baseUrl, API_PATHS.HEALTH);
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.ok, `success=false: ${r.error}`);
    assert(r.data?.status === 'ok', `data.status expected "ok", got "${r.data?.status}"`);
  });

  await test('GET /api/challenge → nonce/difficulty/timestamp/ttl', async () => {
    const r = await apiRequest<ChallengeResponse>(baseUrl, API_PATHS.CHALLENGE);
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(r.ok, `success=false: ${r.error}`);
    const d = r.data!;
    assertField(d, 'nonce', 'string');
    assertField(d, 'difficulty', 'number');
    assertField(d, 'timestamp', 'number');
    assertField(d, 'ttl', 'number');
    assert(d.difficulty >= POW_CONFIG.DIFFICULTY.LOW, `difficulty ${d.difficulty} below minimum`);
    return { pass: true, note: `difficulty=${d.difficulty} ttl=${d.ttl}s` };
  });

  // ── Wrong-credential rejection tests ──────────────────────────────────────

  console.log('');
  console.log(bold('Rejection tests'));

  await test('POST /api/admin/login with wrong password → 401', async () => {
    const r = await apiRequest(baseUrl, API_PATHS.ADMIN_LOGIN, {
      method: 'POST',
      body: { username: 'admin', password: 'wrong-password-x' },
      powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
    });
    assert(r.status === 401, `expected 401, got ${r.status}`);
    assert(r.error === ERRORS.INVALID_CREDENTIALS, `expected "${ERRORS.INVALID_CREDENTIALS}", got "${r.error}"`);
  });

  await test('POST /api/auth/login with wrong password → 401', async () => {
    const r = await apiRequest(baseUrl, API_PATHS.AUTH_LOGIN, {
      method: 'POST',
      body: { username: 'nonexistent-user', password: 'wrong-password-x' },
      powDifficulty: pow(POW_CONFIG.DIFFICULTY.MEDIUM),
    });
    assert(r.status === 401, `expected 401, got ${r.status}`);
    assert(r.error === ERRORS.INVALID_CREDENTIALS, `expected "${ERRORS.INVALID_CREDENTIALS}", got "${r.error}"`);
  });

  await test('GET /api/vaults without token → 401', async () => {
    const r = await apiRequest(baseUrl, API_PATHS.VAULTS, {
      powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
    });
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  await test('GET /api/admin/users without token → 401', async () => {
    const r = await apiRequest(baseUrl, API_PATHS.ADMIN_USERS, {
      powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
    });
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  // ── Authenticated admin tests (only if --password is supplied) ─────────────

  console.log('');
  console.log(bold('Authenticated admin tests'));

  if (!PASSWORD) {
    skip('POST /api/admin/login', 'pass --password to enable');
    skip('GET /api/admin/users', 'pass --password to enable');
    skip('POST /api/admin/login with bad token → 401', 'pass --password to enable');
  } else {
    let adminToken: string | null = null;
    let loginNote = '';

    const loginResult = await test('POST /api/admin/login → token', async () => {
      const r = await apiRequest<LoginResponse>(baseUrl, API_PATHS.ADMIN_LOGIN, {
        method: 'POST',
        body: { username: 'admin', password: PASSWORD },
        powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
      });
      assert(r.status === 200, `expected 200, got ${r.status}: ${r.error}`);
      assert(r.ok, `success=false: ${r.error}`);
      assert(typeof r.data?.token === 'string' && r.data.token.length > 0, 'missing token');
      assertField(r.data!, 'encryptionSalt', 'string');
      adminToken = r.data!.token;

      const flags: string[] = [];
      if (r.data!.requirePasswordChange) flags.push('requirePasswordChange');
      if (r.data!.requirePasskeySetup)   flags.push('requirePasskeySetup');
      loginNote = flags.length > 0 ? flags.join(', ') : 'active';
      return { pass: true, note: loginNote };
    });

    if (!loginResult.pass || !adminToken) {
      skip('GET /api/admin/users', 'login failed');
    } else if (loginNote.includes('requirePasswordChange')) {
      // Pending first-login token: still valid for GET /api/admin/users via requireAuth
      await test('GET /api/admin/users → list (pending admin)', async () => {
        const r = await apiRequest<ListUsersResponse>(baseUrl, API_PATHS.ADMIN_USERS, {
          method: 'GET',
          token: adminToken!,
          powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
        });
        // Accept 200 or 403 — pending admin may be blocked from listing users depending on impl
        assert(r.status === 200 || r.status === 403, `unexpected status ${r.status}: ${r.error}`);
        return { pass: true, note: r.status === 403 ? 'blocked (pending status)' : `${(r.data as string[])?.length ?? 0} users` };
      });
    } else {
      await test('GET /api/admin/users → list', async () => {
        const r = await apiRequest<{ users: unknown[] }>(baseUrl, API_PATHS.ADMIN_USERS, {
          method: 'GET',
          token: adminToken!,
          powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
        });
        assert(r.status === 200, `expected 200, got ${r.status}: ${r.error}`);
        assert(r.ok, `success=false: ${r.error}`);
        assert(Array.isArray((r.data as { users: unknown[] })?.users), 'data.users is not an array');
        const count = (r.data as { users: unknown[] }).users.length;
        return { pass: true, note: `${count} user${count !== 1 ? 's' : ''}` };
      });
    }

    await test('GET /api/admin/users with bad token → 401', async () => {
      const r = await apiRequest(baseUrl, API_PATHS.ADMIN_USERS, {
        method: 'GET',
        token: 'bad.token.value',
        powDifficulty: pow(POW_CONFIG.DIFFICULTY.HIGH),
      });
      assert(r.status === 401, `expected 401, got ${r.status}`);
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  const run     = results.filter(r => !r.skipped);
  const passed  = run.filter(r => r.passed).length;
  const failed  = run.filter(r => !r.passed).length;
  const skipped = results.filter(r => r.skipped).length;

  console.log('');
  console.log(bold('Results'));
  console.log(`  ${green(String(passed))} passed  ${failed > 0 ? red(String(failed)) : dim('0')} failed  ${dim(String(skipped) + ' skipped')}`);
  console.log('');

  if (failed > 0) {
    console.log(red('  Some tests failed. Check the output above for details.'));
    console.log('');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(red(`\nFatal: ${err instanceof Error ? err.message : err}\n`));
  process.exit(1);
});
