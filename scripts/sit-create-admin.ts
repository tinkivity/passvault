#!/usr/bin/env npx tsx
/**
 * SIT admin creation helper.
 *
 * Creates a temporary admin user in DynamoDB for system integration tests.
 * Prints ONLY the one-time password to stdout (for capture by sitest.sh).
 *
 * Required env vars:
 *   ENVIRONMENT    — dev or beta
 *   ADMIN_EMAIL    — email for the SIT admin
 *   DYNAMODB_TABLE — users table name
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getEnvironmentConfig } from '@passvault/shared';

const ENV = process.env.ENVIRONMENT ?? 'dev';
const config = getEnvironmentConfig(ENV);
const TABLE = process.env.DYNAMODB_TABLE ?? `passvault-users-${ENV}`;
const REGION = config.region;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  process.stderr.write('Error: ADMIN_EMAIL is required.\n');
  process.exit(1);
}

const BCRYPT_ROUNDS = 12;
const SALT_BYTES = 32;

const OTP_UPPER   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const OTP_LOWER   = 'abcdefghijklmnopqrstuvwxyz';
const OTP_DIGITS  = '0123456789';
const OTP_SPECIAL = '!@#$%^&*';
const OTP_CHARS   = OTP_UPPER + OTP_LOWER + OTP_DIGITS + OTP_SPECIAL;
const OTP_LENGTH  = 16;

function randomChar(alphabet: string): string {
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let b: number;
  do { b = randomBytes(1)[0]; } while (b >= max);
  return alphabet[b % alphabet.length];
}

function generateOtp(): string {
  const required = [
    randomChar(OTP_UPPER),
    randomChar(OTP_LOWER),
    randomChar(OTP_DIGITS),
    randomChar(OTP_SPECIAL),
  ];

  for (let i = required.length; i < OTP_LENGTH; i++) {
    required.push(randomChar(OTP_CHARS));
  }

  for (let i = required.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [required[i], required[j]] = [required[j], required[i]];
  }

  return required.join('');
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function main() {
  const otp = generateOtp();
  const passwordHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const encryptionSalt = randomBytes(SALT_BYTES).toString('base64');
  const userId = uuidv4();
  const now = new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        userId,
        username: ADMIN_EMAIL,
        passwordHash,
        role: 'admin',
        status: 'pending_first_login',
        plan: 'administrator',
        oneTimePasswordHash: passwordHash,
        encryptionSalt,
        createdAt: now,
        lastLoginAt: null,
        createdBy: 'sit-runner',
        failedLoginAttempts: 0,
        lockedUntil: null,
        otpExpiresAt: null,
        expiresAt: null,
      },
    }),
  );

  // Print ONLY the OTP — sitest.sh captures this
  process.stdout.write(otp);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
