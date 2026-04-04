#!/usr/bin/env npx tsx
/**
 * PassVault dev seed script.
 *
 * Populates a dev stack with ready-to-use test accounts and sample vault content.
 * Users are created with status "active" and a known password — no OTP / change-password
 * flow required. Runs without a live backend; writes directly to DynamoDB and S3.
 *
 * SAFETY: refuses to run against beta or prod.
 *
 * Usage (standalone):
 *   ENVIRONMENT=dev FILES_BUCKET=passvault-files-dev-xxxx npx tsx scripts/seed-dev.ts
 *
 * Usage (via setup.sh):
 *   Called automatically on first dev startup — FILES_BUCKET is injected from CFN outputs.
 *
 * Idempotent: users that already exist are skipped.
 *
 * Vault format: v2 split format — each vault produces two S3 files:
 *   vault-{vaultId}-index.enc  (encrypted VaultIndexFile)
 *   vault-{vaultId}-items.enc  (encrypted VaultItemsFile)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import bcrypt from 'bcryptjs';
import { createCipheriv, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import argon2 from 'argon2';
import { getEnvironmentConfig } from '@passvault/shared';
import type {
  VaultItem,
  VaultIndexFile,
  VaultItemsFile,
  VaultIndexEntry,
} from '@passvault/shared';

// ── Config ─────────────────────────────────────────────────────────────────────

const ENV = process.env.ENVIRONMENT ?? 'dev';
if (ENV !== 'dev') {
  console.error(`\n✗ seed-dev.ts may only run against the dev environment.`);
  console.error(`  ENVIRONMENT is set to "${ENV}". Aborting.\n`);
  process.exit(1);
}

const config = getEnvironmentConfig(ENV);
const REGION = config.region;

const USERS_TABLE   = process.env.DYNAMODB_TABLE    ?? `passvault-users-${ENV}`;
const VAULTS_TABLE  = process.env.VAULTS_TABLE_NAME ?? `passvault-vaults-${ENV}`;
const FILES_BUCKET  = process.env.FILES_BUCKET;

if (!FILES_BUCKET) {
  console.error(`\n✗ FILES_BUCKET env var is required.`);
  console.error(`  Pass the S3 bucket name from your CDK stack output, e.g.:`);
  console.error(`  FILES_BUCKET=passvault-files-dev-xxxx npx tsx scripts/seed-dev.ts\n`);
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;
const SALT_BYTES    = 32;
const ARGON2_PARAMS = { memoryCost: 65536, timeCost: 3, parallelism: 4, hashLength: 32 } as const;

// ── AWS clients ────────────────────────────────────────────────────────────────

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3     = new S3Client({ region: REGION });

// ── Helpers ────────────────────────────────────────────────────────────────────

async function usernameExists(username: string): Promise<boolean> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': username },
      Limit: 1,
    }),
  );
  return (result.Count ?? 0) > 0;
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return (await argon2.hash(password, {
    type: argon2.argon2id,
    ...ARGON2_PARAMS,
    salt,
    raw: true,
  })) as Buffer;
}

function encryptPayload(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertextPart = cipher.update(plaintext, 'utf8');
  cipher.final();
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertextPart, tag]).toString('base64');
}

function makeItem(fields: Record<string, unknown>): VaultItem {
  const now = new Date().toISOString();
  return { id: uuidv4(), createdAt: now, updatedAt: now, warningCodes: [], ...fields } as unknown as VaultItem;
}

function buildSplitVault(items: VaultItem[]): { indexFile: VaultIndexFile; itemsFile: VaultItemsFile } {
  const entries: VaultIndexEntry[] = items.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    warningCodes: item.warningCodes,
    ...(item.comment ? { comment: item.comment } : {}),
  }));

  const itemsRecord: Record<string, VaultItem> = {};
  for (const item of items) {
    itemsRecord[item.id] = item;
  }

  return {
    indexFile: { version: 2, entries },
    itemsFile: { version: 2, items: itemsRecord },
  };
}

// ── Shared weak passwords (for warning code testing) ──────────────────────────

/** Intentionally weak — triggers too_simple_password + breached_password */
const WEAK_PASSWORD = 'password123';

/** Used on multiple items — triggers duplicate_password */
const DUPLICATE_PASSWORD = 'SharedPass2024!$';

// ── Seed data ──────────────────────────────────────────────────────────────────

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  plan: 'free' | 'pro';
  expiresAt: string | null;
  vaults: Array<{ displayName: string; items: VaultItem[] }>;
}

// ── Alice's vault items (20 items) ────────────────────────────────────────────

const alicePersonalItems: VaultItem[] = [
  // 6 logins
  makeItem({
    name: 'GitHub',
    category: 'login',
    username: 'alice@example.com',
    password: 'AliceGithub99!',
    url: 'https://github.com',
    comment: 'Personal GitHub account',
  }),
  makeItem({
    name: 'Google Account',
    category: 'login',
    username: 'alice@example.com',
    password: 'AliceGoogle77#',
    url: 'https://accounts.google.com',
    comment: 'Primary Google account',
  }),
  makeItem({
    name: 'Netflix',
    category: 'login',
    username: 'alice@example.com',
    password: DUPLICATE_PASSWORD,
    url: 'https://www.netflix.com',
    comment: 'Family plan',
    warningCodes: ['duplicate_password'],
  }),
  makeItem({
    name: 'Amazon',
    category: 'login',
    username: 'alice@example.com',
    password: DUPLICATE_PASSWORD,
    url: 'https://www.amazon.com',
    comment: 'Prime membership',
    warningCodes: ['duplicate_password'],
  }),
  makeItem({
    name: 'LinkedIn',
    category: 'login',
    username: 'alice@example.com',
    password: 'AliceLinkedIn#42',
    url: 'https://www.linkedin.com',
  }),
  makeItem({
    name: 'Slack',
    category: 'login',
    username: 'alice@example.com',
    password: WEAK_PASSWORD,
    url: 'https://slack.com',
    comment: 'Needs a stronger password',
    warningCodes: ['too_simple_password', 'breached_password'],
  }),

  // 3 emails
  makeItem({
    name: 'Personal Gmail',
    category: 'email',
    emailAddress: 'alice.johnson@gmail.com',
    password: 'AliceGmail2024!@',
    imapHost: 'imap.gmail.com',
    imapPort: '993',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    comment: 'Main personal email',
  }),
  makeItem({
    name: 'Work Outlook',
    category: 'email',
    emailAddress: 'alice.johnson@acme.com',
    password: 'AliceWork!2024#',
    imapHost: 'outlook.office365.com',
    imapPort: '993',
    smtpHost: 'smtp.office365.com',
    smtpPort: '587',
    comment: 'ACME Corp work email',
  }),
  makeItem({
    name: 'ProtonMail',
    category: 'email',
    emailAddress: 'alice_secure@proton.me',
    password: 'ProtonAlice!99$',
    comment: 'Private encrypted email',
  }),

  // 2 credit cards
  makeItem({
    name: 'Visa Debit',
    category: 'credit_card',
    cardholderName: 'Alice Johnson',
    cardNumber: '4111111111111111',
    expiryMonth: '09',
    expiryYear: '2027',
    cvv: '737',
    comment: 'Main debit card - Chase',
  }),
  makeItem({
    name: 'Mastercard Gold',
    category: 'credit_card',
    cardholderName: 'Alice Johnson',
    cardNumber: '5500000000000004',
    expiryMonth: '03',
    expiryYear: '2028',
    cvv: '412',
    pin: '9274',
    comment: 'Travel rewards card',
  }),

  // 2 identities
  makeItem({
    name: 'Passport',
    category: 'identity',
    firstName: 'Alice',
    lastName: 'Johnson',
    dateOfBirth: '1992-06-15',
    nationality: 'US',
    passportNumber: 'X12345678',
    comment: 'Expires 2032-06-14',
  }),
  makeItem({
    name: "Driver's License",
    category: 'identity',
    firstName: 'Alice',
    lastName: 'Johnson',
    dateOfBirth: '1992-06-15',
    idNumber: 'D1234567',
    address: '123 Elm St, Springfield, IL 62704',
    comment: 'Illinois DL - renew 2027',
  }),

  // 3 wifi
  makeItem({
    name: 'Home WiFi',
    category: 'wifi',
    ssid: 'JohnsonHome_5G',
    password: 'WifiPass!99xK',
    securityType: 'WPA3',
    comment: 'Netgear router, admin panel at 192.168.1.1',
  }),
  makeItem({
    name: 'Office WiFi',
    category: 'wifi',
    ssid: 'ACME-Corporate',
    password: 'AcmeWifi#2024!',
    securityType: 'WPA2-Enterprise',
    comment: 'Rotates quarterly',
  }),
  makeItem({
    name: 'Coffee Shop WiFi',
    category: 'wifi',
    ssid: 'BeanBrew-Guest',
    password: 'coffeelover',
    securityType: 'WPA2',
    comment: 'Local cafe on 5th Ave',
  }),

  // 2 private keys
  makeItem({
    name: 'SSH Ed25519 Key',
    category: 'private_key',
    privateKey: [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz',
      'c2gtZWQyNTUxOQAAACBVbGxvY2F0ZWQgZXhhbXBsZSBrZXkgZGF0YSBoZXJlIQ',
      'AAAEDExampleKeyDataNotRealButRealisticLookingBase64Encoded',
      'AAAAC2FsaWNlQGRldg==',
      '-----END OPENSSH PRIVATE KEY-----',
    ].join('\n'),
    publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFVsbG9jYXRlZCBleGFtcGxlIGtleSBkYXRhIGhlcmUh alice@dev',
    keyType: 'ed25519',
    passphrase: 'AliceSSH!Phrase42',
    comment: 'GitHub + server access',
  }),
  makeItem({
    name: 'PGP Key',
    category: 'private_key',
    privateKey: [
      '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      '',
      'lQOYBGZ0example0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn',
      'opqrstuvwxyz0123456789+/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef',
      'ExamplePGPKeyDataTruncatedForSeedPurposes==',
      '-----END PGP PRIVATE KEY BLOCK-----',
    ].join('\n'),
    publicKey: [
      '-----BEGIN PGP PUBLIC KEY BLOCK-----',
      '',
      'mDMEZnR0example0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn',
      'ExamplePublicKeyTruncated==',
      '-----END PGP PUBLIC KEY BLOCK-----',
    ].join('\n'),
    keyType: 'rsa4096',
    passphrase: 'AlicePGP!Secure99',
    comment: 'Email signing and encryption',
  }),

  // 2 notes
  makeItem({
    name: 'Dev Environment Setup',
    category: 'note',
    format: 'markdown',
    text: [
      '## Development Environment',
      '',
      '### SSH Config',
      '- Key: `~/.ssh/id_ed25519`',
      '- Config: `~/.ssh/config`',
      '',
      '### AWS',
      '- Profile: `default`',
      '- Region: `eu-central-1`',
      '- MFA ARN: `arn:aws:iam::123456789012:mfa/alice`',
      '',
      '### Docker',
      '- Registry: `ghcr.io/alice-dev`',
      '- Login: `echo $CR_PAT | docker login ghcr.io -u alice --password-stdin`',
      '',
      '### Useful commands',
      '```bash',
      'aws sso login --profile dev',
      'kubectl config use-context dev-cluster',
      '```',
    ].join('\n'),
    comment: 'Keep updated when setup changes',
  }),
  makeItem({
    name: 'Recovery Codes',
    category: 'note',
    format: 'raw',
    text: [
      'GitHub 2FA Recovery Codes:',
      '  a1b2c-3d4e5',
      '  f6g7h-8i9j0',
      '  k1l2m-3n4o5',
      '  p6q7r-8s9t0',
      '',
      'Google Recovery Codes:',
      '  1234-5678-9012',
      '  3456-7890-1234',
      '  5678-9012-3456',
      '  7890-1234-5678',
    ].join('\n'),
    comment: 'Print and store in safe',
  }),
];

// ── Bob's personal vault items (12 items) ─────────────────────────────────────

const bobPersonalItems: VaultItem[] = [
  // 4 logins
  makeItem({
    name: 'AWS Console',
    category: 'login',
    username: 'bob@example.com',
    password: 'BobAws2024!Secure',
    url: 'https://console.aws.amazon.com',
    comment: 'Personal AWS account',
  }),
  makeItem({
    name: 'GitHub',
    category: 'login',
    username: 'bobsmith-dev',
    password: 'BobGitHub!Secure42',
    url: 'https://github.com',
    comment: 'Open source contributions',
  }),
  makeItem({
    name: 'Steam',
    category: 'login',
    username: 'bobgamer42',
    password: DUPLICATE_PASSWORD,
    url: 'https://store.steampowered.com',
    comment: 'Gaming account',
    warningCodes: ['duplicate_password'],
  }),
  makeItem({
    name: 'Online Banking',
    category: 'login',
    username: 'bob.smith',
    password: WEAK_PASSWORD,
    url: 'https://banking.example.com',
    comment: 'CHANGE THIS PASSWORD IMMEDIATELY',
    warningCodes: ['too_simple_password', 'breached_password'],
  }),

  // 2 emails
  makeItem({
    name: 'Personal Gmail',
    category: 'email',
    emailAddress: 'bob.smith42@gmail.com',
    password: 'BobGmail!2024$x',
    imapHost: 'imap.gmail.com',
    imapPort: '993',
    smtpHost: 'smtp.gmail.com',
    smtpPort: '587',
    comment: 'Primary personal email',
  }),
  makeItem({
    name: 'ProtonMail',
    category: 'email',
    emailAddress: 'bobsmith@proton.me',
    password: 'BobProton!Sec99',
    comment: 'Privacy-focused email',
  }),

  // 1 credit card
  makeItem({
    name: 'Visa Platinum',
    category: 'credit_card',
    cardholderName: 'Robert Smith',
    cardNumber: '4242424242424242',
    expiryMonth: '11',
    expiryYear: '2027',
    cvv: '314',
    pin: '5531',
    comment: 'Chase Sapphire',
  }),

  // 1 identity
  makeItem({
    name: 'Passport',
    category: 'identity',
    firstName: 'Robert',
    lastName: 'Smith',
    dateOfBirth: '1988-03-22',
    nationality: 'US',
    passportNumber: 'Y98765432',
    comment: 'Expires 2031-03-21',
  }),

  // 2 wifi
  makeItem({
    name: 'Home WiFi',
    category: 'wifi',
    ssid: 'SmithHome_5G',
    password: 'BobWifi#Secure22',
    securityType: 'WPA3',
    comment: 'TP-Link AX6000 router',
  }),
  makeItem({
    name: "Parents' WiFi",
    category: 'wifi',
    ssid: 'SmithFamily',
    password: 'FamilyWifi2020!',
    securityType: 'WPA2',
    comment: 'Updated Jan 2024',
  }),

  // 1 private key
  makeItem({
    name: 'SSH Key',
    category: 'private_key',
    privateKey: [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz',
      'c2gtZWQyNTUxOQAAACBCb2JFeGFtcGxlS2V5RGF0YUhlcmVOb3RSZWFsISEhIQ',
      'AAAEDBobExamplePrivateKeyNotRealButRealisticBase64DataHere',
      'AAAACWJvYkBkZXY=',
      '-----END OPENSSH PRIVATE KEY-----',
    ].join('\n'),
    publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEJvYkV4YW1wbGVLZXlEYXRhSGVyZU5vdFJlYWwhISEh bob@dev',
    keyType: 'ed25519',
    comment: 'Personal servers',
  }),

  // 1 note
  makeItem({
    name: 'Personal Notes',
    category: 'note',
    format: 'raw',
    text: [
      'Renewal dates:',
      '  Domain bobsmith.dev: 2026-11-01',
      '  VPS (Hetzner):      2026-08-15',
      '  SSL wildcard:       2026-05-20',
      '',
      'Backup schedule:',
      '  Weekly full:   Sunday 02:00 UTC',
      '  Daily incr:    04:00 UTC',
      '  Retention:     90 days',
    ].join('\n'),
    comment: 'Review monthly',
  }),
];

// ── Bob's work vault items (12 items) ─────────────────────────────────────────

const bobWorkItems: VaultItem[] = [
  // 4 logins
  makeItem({
    name: 'Jira',
    category: 'login',
    username: 'bob.smith@acme.com',
    password: 'WorkJira2024!$x',
    url: 'https://acme.atlassian.net',
    comment: 'Scrum board: ACME-Platform',
  }),
  makeItem({
    name: 'Confluence',
    category: 'login',
    username: 'bob.smith@acme.com',
    password: 'WorkConfl!2024#',
    url: 'https://acme.atlassian.net/wiki',
    comment: 'Team space: Platform Engineering',
  }),
  makeItem({
    name: 'GitLab',
    category: 'login',
    username: 'bob.smith',
    password: DUPLICATE_PASSWORD,
    url: 'https://gitlab.acme.com',
    comment: 'Self-hosted GitLab',
    warningCodes: ['duplicate_password'],
  }),
  makeItem({
    name: 'Datadog',
    category: 'login',
    username: 'bob.smith@acme.com',
    password: 'DatadogBob!Sec42',
    url: 'https://app.datadoghq.eu',
    comment: 'Monitoring and APM',
  }),

  // 2 emails
  makeItem({
    name: 'Work Office365',
    category: 'email',
    emailAddress: 'bob.smith@acme.com',
    password: 'WorkEmail2024!@#',
    imapHost: 'outlook.office365.com',
    imapPort: '993',
    smtpHost: 'smtp.office365.com',
    smtpPort: '587',
    comment: 'Main work email - synced to Outlook',
  }),
  makeItem({
    name: 'Support Alias',
    category: 'email',
    emailAddress: 'platform-support@acme.com',
    password: 'SupportAlias!2024',
    comment: 'Shared mailbox - on-call rotation',
  }),

  // 1 credit card
  makeItem({
    name: 'Corporate Amex',
    category: 'credit_card',
    cardholderName: 'Robert Smith',
    cardNumber: '371449635398431',
    expiryMonth: '06',
    expiryYear: '2027',
    cvv: '1234',
    comment: 'Expense via Concur - max $5k/month',
  }),

  // 1 identity
  makeItem({
    name: 'Employee Badge',
    category: 'identity',
    firstName: 'Robert',
    lastName: 'Smith',
    idNumber: 'ACME-2847',
    comment: 'Badge PIN: see note. Building B, Floor 3',
  }),

  // 2 wifi
  makeItem({
    name: 'Office WiFi',
    category: 'wifi',
    ssid: 'ACME-Secure',
    password: 'AcmeOffice!2024#',
    securityType: 'WPA2-Enterprise',
    comment: 'Certificate-based - enroll via IT portal',
  }),
  makeItem({
    name: 'VPN Credentials',
    category: 'wifi',
    ssid: 'ACME-VPN',
    password: 'VpnBob!Remote42',
    securityType: 'WireGuard',
    comment: 'Config file in ~/wireguard/acme.conf',
  }),

  // 1 private key
  makeItem({
    name: 'Deploy Key',
    category: 'private_key',
    privateKey: [
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz',
      'c2gtZWQyNTUxOQAAACBEZXBsb3lLZXlEYXRhRXhhbXBsZU5vdFJlYWxIZXJlIQ',
      'AAAEDDeployKeyExampleNotRealBase64DataHereForSeedingPurposes',
      'AAAADWRlcGxveUBhY21l',
      '-----END OPENSSH PRIVATE KEY-----',
    ].join('\n'),
    publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIERlcGxveUtleURhdGFFeGFtcGxlTm90UmVhbEhlcmUh deploy@acme',
    keyType: 'ed25519',
    comment: 'CI/CD pipeline deploy key - read-only',
  }),

  // 1 note
  makeItem({
    name: 'Runbook - Incident Response',
    category: 'note',
    format: 'markdown',
    text: [
      '## Incident Response Runbook',
      '',
      '### Escalation',
      '1. Check Datadog alerts dashboard',
      '2. If P1: page on-call via PagerDuty',
      '3. Join war room: #incident-response Slack',
      '',
      '### Common Fixes',
      '- **High CPU**: Scale ECS service `acme-api` to 6 tasks',
      '- **DB connection pool**: Restart RDS proxy',
      '- **S3 throttling**: Enable request rate backoff',
      '',
      '### Post-incident',
      '- File PIR within 48h in Confluence',
      '- Update runbook if new failure mode discovered',
    ].join('\n'),
    comment: 'Review after each incident',
  }),
];

// ── Assembled seed users ──────────────────────────────────────────────────────

const SEED_USERS: SeedUser[] = [
  {
    email: 'alice@example.com',
    password: 'AliceTest1!',
    firstName: 'Alice',
    lastName: 'Johnson',
    plan: 'free',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    vaults: [
      { displayName: 'Personal Vault', items: alicePersonalItems },
    ],
  },
  {
    email: 'bob@example.com',
    password: 'BobTest1!',
    firstName: 'Bob',
    lastName: 'Smith',
    plan: 'pro',
    expiresAt: null,
    vaults: [
      { displayName: 'Personal Vault', items: bobPersonalItems },
      { displayName: 'Work Vault', items: bobWorkItems },
    ],
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────

interface CreatedUser { email: string; name: string; password: string; plan: string; expiresAt: string | null; vaultCount: number; itemCount: number; status: 'created' | 'skipped' }

async function seedUser(user: SeedUser): Promise<CreatedUser> {
  const name = [user.firstName, user.lastName].join(' ');
  const itemCount = user.vaults.reduce((sum, v) => sum + v.items.length, 0);

  if (await usernameExists(user.email)) {
    return { email: user.email, name, password: user.password, plan: user.plan, expiresAt: user.expiresAt, vaultCount: user.vaults.length, itemCount, status: 'skipped' };
  }

  const userId         = uuidv4();
  const encryptionSalt = randomBytes(SALT_BYTES).toString('base64');
  const passwordHash   = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
  const now            = new Date().toISOString();

  // Create user record
  await dynamo.send(
    new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        userId,
        username: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        ...(user.displayName ? { displayName: user.displayName } : {}),
        passwordHash,
        role: 'user',
        status: 'active',
        plan: user.plan,
        expiresAt: user.expiresAt,
        oneTimePasswordHash: null,
        otpExpiresAt: null,
        encryptionSalt,
        createdAt: now,
        lastLoginAt: null,
        createdBy: 'seed-dev',
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  );

  // Create each vault record + S3 files (v2 split format)
  for (const vault of user.vaults) {
    const vaultId = uuidv4();
    const vaultEncryptionSalt = randomBytes(SALT_BYTES).toString('base64');
    const vaultSaltBuf = Buffer.from(vaultEncryptionSalt, 'base64');

    await dynamo.send(
      new PutCommand({
        TableName: VAULTS_TABLE,
        Item: { vaultId, userId, displayName: vault.displayName, encryptionSalt: vaultEncryptionSalt, createdAt: now },
        ConditionExpression: 'attribute_not_exists(vaultId)',
      }),
    );

    const { indexFile, itemsFile } = buildSplitVault(vault.items);
    const key = await deriveKey(user.password, vaultSaltBuf);

    const encryptedIndex = encryptPayload(JSON.stringify(indexFile), key);
    const encryptedItems = encryptPayload(JSON.stringify(itemsFile), key);

    await Promise.all([
      s3.send(
        new PutObjectCommand({
          Bucket: FILES_BUCKET,
          Key: `vault-${vaultId}-index.enc`,
          Body: encryptedIndex,
          ContentType: 'text/plain',
        }),
      ),
      s3.send(
        new PutObjectCommand({
          Bucket: FILES_BUCKET,
          Key: `vault-${vaultId}-items.enc`,
          Body: encryptedItems,
          ContentType: 'text/plain',
        }),
      ),
    ]);
  }

  return { email: user.email, name, password: user.password, plan: user.plan, expiresAt: user.expiresAt, vaultCount: user.vaults.length, itemCount, status: 'created' };
}

async function main() {
  console.log(`\nPassVault Dev Seed`);
  console.log(`  Environment  : ${ENV}`);
  console.log(`  Region       : ${REGION}`);
  console.log(`  Users table  : ${USERS_TABLE}`);
  console.log(`  Vaults table : ${VAULTS_TABLE}`);
  console.log(`  Files bucket : ${FILES_BUCKET}`);

  const totalItems = SEED_USERS.reduce((sum, u) => sum + u.vaults.reduce((vs, v) => vs + v.items.length, 0), 0);
  console.log(`\n  Seeding ${SEED_USERS.length} users, ${totalItems} vault items (Argon2 key derivation — ~3s per vault)...\n`);

  const results: CreatedUser[] = [];
  for (const user of SEED_USERS) {
    process.stdout.write(`  ${user.email} ... `);
    const result = await seedUser(user);
    results.push(result);
    console.log(
      result.status === 'created'
        ? `created (${result.vaultCount} vault${result.vaultCount !== 1 ? 's' : ''}, ${result.itemCount} items)`
        : `skipped (already exists)`,
    );
  }

  const created = results.filter(r => r.status === 'created');
  if (created.length === 0) {
    console.log(`\n  All seed users already exist.`);
  }

  console.log(`\n┌───────────────────────────────────────────────────────────────────────────────────────────────────┐`);
  console.log(`│  Dev seed credentials                                                                           │`);
  console.log(`├─────────────────────────┬──────────────┬──────────────┬──────────┬──────────────┬───────────────┤`);
  console.log(`│  Email                  │  Name        │  Password    │  Plan    │  Expires     │  Items        │`);
  console.log(`├─────────────────────────┼──────────────┼──────────────┼──────────┼──────────────┼───────────────┤`);
  for (const r of results) {
    const email    = r.email.padEnd(23);
    const name     = r.name.padEnd(12);
    const password = r.password.padEnd(12);
    const plan     = r.plan.padEnd(8);
    const expires  = (r.expiresAt ?? 'lifetime').padEnd(12);
    const items    = `${r.itemCount}`.padEnd(13);
    console.log(`│  ${email}  │  ${name}  │  ${password}  │  ${plan}  │  ${expires}  │  ${items}  │`);
  }
  console.log(`└─────────────────────────┴──────────────┴──────────────┴──────────┴──────────────┴───────────────┘`);
  console.log(`\n  Vault format: v2 split (index.enc + items.enc per vault)`);
  console.log(`  These accounts are ready to use — no password change needed.`);
  console.log(`  Log in at /login with the credentials above.\n`);
}

main().catch(err => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
