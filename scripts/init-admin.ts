#!/usr/bin/env npx tsx
/**
 * PassVault admin initialisation script.
 *
 * Creates the admin user in DynamoDB with a one-time password.
 * Run once after the first `cdk deploy`.
 *
 * Usage:
 *   ENVIRONMENT=dev npx tsx scripts/init-admin.ts
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

const BCRYPT_ROUNDS = 12;
const OTP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
const OTP_LENGTH = 16;
const SALT_BYTES = 32;

// ---- DynamoDB client ------------------------------------------------------

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// ---- Helpers --------------------------------------------------------------

function generateOtp(): string {
  const bytes = randomBytes(OTP_LENGTH);
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += OTP_CHARS[bytes[i] % OTP_CHARS.length];
  }
  return otp;
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
  const adminUsername = config.adminUsername;

  console.log(`\nPassVault Admin Init`);
  console.log(`  Environment : ${ENV}`);
  console.log(`  Region      : ${REGION}`);
  console.log(`  Table       : ${TABLE}`);
  console.log(`  Admin user  : ${adminUsername}\n`);

  // Check if admin already exists
  const exists = await usernameExists(adminUsername);
  if (exists) {
    console.error(`✗ Admin user "${adminUsername}" already exists in ${TABLE}.`);
    console.error(`  If you need to reset the admin, delete the item from DynamoDB first.`);
    process.exit(1);
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
    oneTimePasswordHash: passwordHash,
    totpSecret: null,
    totpEnabled: false,
    encryptionSalt,
    createdAt: now,
    lastLoginAt: null,
    createdBy: null,
  };

  await dynamo.send(
    new PutCommand({
      TableName: TABLE,
      Item: adminUser,
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  );

  console.log(`✓ Admin user created successfully.\n`);
  console.log(`  Username          : ${adminUsername}`);
  console.log(`  One-time password : ${otp}\n`);
  console.log(`Use these credentials to log in at /admin/login.`);
  console.log(`You will be prompted to set a new password on first login.\n`);
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
