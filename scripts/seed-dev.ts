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
 * Usage (via deploy-ui.sh):
 *   Called automatically on first dev startup — FILES_BUCKET is injected from CFN outputs.
 *
 * Idempotent: users that already exist are skipped.
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
import type { VaultFile } from '@passvault/shared';

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

async function encryptVault(vaultFile: VaultFile, password: string, salt: Buffer): Promise<string> {
  const key = (await argon2.hash(password, {
    type: argon2.argon2id,
    ...ARGON2_PARAMS,
    salt,
    raw: true,
  })) as Buffer;

  const plaintext = JSON.stringify(vaultFile);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertextPart = cipher.update(plaintext, 'utf8');
  cipher.final();
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, ciphertextPart, tag]).toString('base64');
}

function makeItem(fields: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  return { id: uuidv4(), createdAt: now, updatedAt: now, warningCodes: [], ...fields };
}

// ── Seed data ──────────────────────────────────────────────────────────────────

interface SeedUser {
  email: string;
  password: string;
  plan: 'free' | 'pro';
  vaults: Array<{ displayName: string; items: Record<string, unknown>[] }>;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'alice@example.com',
    password: 'AliceTest1!',
    plan: 'free',
    vaults: [
      {
        displayName: 'Personal Vault',
        items: [
          makeItem({
            name: 'GitHub',
            category: 'login',
            username: 'alice@example.com',
            password: 'AliceGithub99!',
            url: 'https://github.com',
          }),
          makeItem({
            name: 'Google Account',
            category: 'login',
            username: 'alice@example.com',
            password: 'AliceGoogle77#',
            url: 'https://accounts.google.com',
          }),
          makeItem({
            name: 'Visa Debit',
            category: 'credit_card',
            cardholderName: 'Alice Example',
            cardNumber: '4111111111111111',
            expiryMonth: '09',
            expiryYear: '2027',
            cvv: '737',
          }),
          makeItem({
            name: 'Home WiFi',
            category: 'wifi',
            ssid: 'HomeNetwork_5G',
            password: 'WifiPass!99',
            securityType: 'WPA3',
          }),
          makeItem({
            name: 'Dev notes',
            category: 'note',
            format: 'markdown',
            text: '## Setup notes\n\n- SSH key in `~/.ssh/id_ed25519`\n- AWS profile: `default`\n- Region: `eu-central-1`',
          }),
        ],
      },
    ],
  },
  {
    email: 'bob@example.com',
    password: 'BobTest1!',
    plan: 'pro',
    vaults: [
      {
        displayName: 'Personal Vault',
        items: [
          makeItem({
            name: 'AWS Console',
            category: 'login',
            username: 'bob@example.com',
            password: 'BobAws2024!',
            url: 'https://console.aws.amazon.com',
          }),
          makeItem({
            name: 'GitHub SSH key',
            category: 'private_key',
            privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\n(sample — not a real key)\n-----END OPENSSH PRIVATE KEY-----',
            publicKey: 'ssh-ed25519 AAAA... bob@example.com',
            keyType: 'ed25519',
          }),
          makeItem({
            name: 'Personal notes',
            category: 'note',
            format: 'raw',
            text: 'Renewal dates:\n  Domain: 2026-11-01\n  VPS:    2026-08-15',
          }),
        ],
      },
      {
        displayName: 'Work Vault',
        items: [
          makeItem({
            name: 'Jira',
            category: 'login',
            username: 'bob.smith@acme.com',
            password: 'WorkJira2024!',
            url: 'https://acme.atlassian.net',
          }),
          makeItem({
            name: 'Office 365',
            category: 'email',
            emailAddress: 'bob.smith@acme.com',
            password: 'WorkEmail24!',
            imapHost: 'outlook.office365.com',
            imapPort: '993',
            smtpHost: 'smtp.office365.com',
            smtpPort: '587',
          }),
        ],
      },
    ],
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────

interface CreatedUser { email: string; password: string; plan: string; vaultCount: number; status: 'created' | 'skipped' }

async function seedUser(user: SeedUser): Promise<CreatedUser> {
  if (await usernameExists(user.email)) {
    return { email: user.email, password: user.password, plan: user.plan, vaultCount: user.vaults.length, status: 'skipped' };
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
        passwordHash,
        role: 'user',
        status: 'active',
        plan: user.plan,
        oneTimePasswordHash: null,
        otpExpiresAt: null,
        registrationToken: null,
        registrationTokenExpiresAt: null,
        passkeyCredentialId: null,
        passkeyPublicKey: null,
        passkeyCounter: 0,
        passkeyTransports: null,
        passkeyAaguid: null,
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

  const saltBuf = Buffer.from(encryptionSalt, 'base64');

  // Create each vault record + S3 file
  for (const vault of user.vaults) {
    const vaultId = uuidv4();

    await dynamo.send(
      new PutCommand({
        TableName: VAULTS_TABLE,
        Item: { vaultId, userId, displayName: vault.displayName, createdAt: now },
        ConditionExpression: 'attribute_not_exists(vaultId)',
      }),
    );

    const vaultFile: VaultFile = { version: 1, items: vault.items as VaultFile['items'] };
    const encryptedContent = await encryptVault(vaultFile, user.password, saltBuf);

    await s3.send(
      new PutObjectCommand({
        Bucket: FILES_BUCKET,
        Key: `vault-${vaultId}.enc`,
        Body: encryptedContent,
        ContentType: 'text/plain',
      }),
    );
  }

  return { email: user.email, password: user.password, plan: user.plan, vaultCount: user.vaults.length, status: 'created' };
}

async function main() {
  console.log(`\nPassVault Dev Seed`);
  console.log(`  Environment  : ${ENV}`);
  console.log(`  Region       : ${REGION}`);
  console.log(`  Users table  : ${USERS_TABLE}`);
  console.log(`  Vaults table : ${VAULTS_TABLE}`);
  console.log(`  Files bucket : ${FILES_BUCKET}`);
  console.log(`\n  Seeding ${SEED_USERS.length} users (Argon2 key derivation — ~3s per user)...\n`);

  const results: CreatedUser[] = [];
  for (const user of SEED_USERS) {
    process.stdout.write(`  ${user.email} ... `);
    const result = await seedUser(user);
    results.push(result);
    console.log(result.status === 'created' ? `✓ created (${result.vaultCount} vault${result.vaultCount !== 1 ? 's' : ''})` : `skipped (already exists)`);
  }

  const created = results.filter(r => r.status === 'created');
  if (created.length === 0) {
    console.log(`\n  All seed users already exist.`);
  }

  console.log(`\n┌──────────────────────────────────────────────────────────────┐`);
  console.log(`│  Dev seed credentials                                        │`);
  console.log(`├─────────────────────────┬──────────────┬──────────┬──────────┤`);
  console.log(`│  Email                  │  Password    │  Plan    │  Vaults  │`);
  console.log(`├─────────────────────────┼──────────────┼──────────┼──────────┤`);
  for (const r of results) {
    const email    = r.email.padEnd(23);
    const password = r.password.padEnd(12);
    const plan     = r.plan.padEnd(8);
    const vaults   = String(r.vaultCount).padEnd(8);
    console.log(`│  ${email}  │  ${password}  │  ${plan}  │  ${vaults}  │`);
  }
  console.log(`└─────────────────────────┴──────────────┴──────────┴──────────┘`);
  console.log(`\n  These accounts are ready to use — no password change needed.`);
  console.log(`  Log in at /login with the credentials above.\n`);
}

main().catch(err => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
