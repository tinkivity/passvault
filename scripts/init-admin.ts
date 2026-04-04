#!/usr/bin/env npx tsx
/**
 * PassVault admin initialisation script.
 *
 * Creates the admin user in DynamoDB with a one-time password.
 * Run once after the first `cdk deploy`.
 *
 * Usage:
 *   ENVIRONMENT=dev ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts
 *
 * The admin email is also available from the CloudFormation AdminEmail output:
 *   aws cloudformation describe-stacks --stack-name PassVault-Dev \
 *     --query "Stacks[0].Outputs[?OutputKey=='AdminEmail'].OutputValue | [0]" \
 *     --output text
 *
 * Requires AWS credentials in the environment (profile, EC2 role, etc.)
 * and the DynamoDB table to already exist.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getEnvironmentConfig } from '@passvault/shared';

// ---- Config ---------------------------------------------------------------

const ENV = process.env.ENVIRONMENT ?? 'dev';
const config = getEnvironmentConfig(ENV);
const TABLE = process.env.DYNAMODB_TABLE ?? `passvault-users-${ENV}`;
const REGION = config.region;
const FORCE = process.argv.includes('--force');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.error('Error: ADMIN_EMAIL environment variable is required.');
  console.error('  ENVIRONMENT=dev ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts');
  console.error('  ENVIRONMENT=dev ADMIN_EMAIL=you@example.com npx tsx scripts/init-admin.ts --force');
  console.error('  (The email is also in the CloudFormation AdminEmail output)');
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;
const OTP_UPPER   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const OTP_LOWER   = 'abcdefghijklmnopqrstuvwxyz';
const OTP_DIGITS  = '0123456789';
const OTP_SPECIAL = '!@#$%^&*';
const OTP_CHARS   = OTP_UPPER + OTP_LOWER + OTP_DIGITS + OTP_SPECIAL;
const OTP_LENGTH  = 16;
const SALT_BYTES  = 32;

// ---- DynamoDB client ------------------------------------------------------

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// ---- Helpers --------------------------------------------------------------

function randomChar(alphabet: string): string {
  // Rejection-sampling to avoid modulo bias
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let b: number;
  do { b = randomBytes(1)[0]; } while (b >= max);
  return alphabet[b % alphabet.length];
}

function generateOtp(): string {
  // Guarantee at least one character from each required class
  const required = [
    randomChar(OTP_UPPER),
    randomChar(OTP_LOWER),
    randomChar(OTP_DIGITS),
    randomChar(OTP_SPECIAL),
  ];

  // Fill remaining slots from the full pool
  for (let i = required.length; i < OTP_LENGTH; i++) {
    required.push(randomChar(OTP_CHARS));
  }

  // Fisher-Yates shuffle using cryptographic randomness
  for (let i = required.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join('');
}

async function usernameExists(username: string): Promise<boolean> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'username-index',
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': username },
      Limit: 1,
    }),
  );
  return (result.Count ?? 0) > 0;
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const adminUsername = ADMIN_EMAIL!;

  console.log(`\nPassVault Admin Init`);
  console.log(`  Environment : ${ENV}`);
  console.log(`  Region      : ${REGION}`);
  console.log(`  Table       : ${TABLE}`);
  console.log(`  Admin user  : ${adminUsername}`);
  console.log(`  Force mode  : ${FORCE ? 'YES' : 'no'}\n`);

  // Check if admin already exists (skip in force mode)
  if (!FORCE) {
    const exists = await usernameExists(adminUsername);
    if (exists) {
      console.error(`✗ Admin user "${adminUsername}" already exists in ${TABLE}.`);
      console.error(`  Use --force to create a new admin entry regardless (emergency recovery).`);
      process.exit(1);
    }
  }

  // Generate OTP and hash it
  const otp = generateOtp();
  const passwordHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const encryptionSalt = randomBytes(SALT_BYTES).toString('base64');
  const userId = uuidv4();
  const now = new Date().toISOString();

  const adminUser = {
    userId,
    username: adminUsername,
    passwordHash,
    role: 'admin',
    status: 'pending_first_login',
    plan: 'administrator',
    oneTimePasswordHash: passwordHash,
    encryptionSalt,
    createdAt: now,
    lastLoginAt: null,
    createdBy: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    otpExpiresAt: null,
    expiresAt: null,
  };

  await dynamo.send(
    new PutCommand({
      TableName: TABLE,
      Item: adminUser,
      ...(!FORCE && { ConditionExpression: 'attribute_not_exists(userId)' }),
    }),
  );

  console.log(`✓ Admin user created successfully.\n`);
  console.log(`  Username          : ${adminUsername}`);
  console.log(`  One-time password : ${otp}\n`);
  console.log(`Use these credentials to log in at /login.`);
  console.log(`You will be prompted to set a new password on first login.\n`);
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
