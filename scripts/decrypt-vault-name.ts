#!/usr/bin/env npx tsx
/**
 * PassVault admin decrypt-vault-name tool.
 *
 * Inspects the cleartext `displayName` of vault rows in `passvault-vaults-{env}`
 * by re-deriving the HKDF key from the JWT secret in SSM Parameter Store.
 * Intended for operator debugging and incident response.
 *
 * Usage:
 *   ENVIRONMENT=dev npx tsx scripts/decrypt-vault-name.ts --vault-id <uuid>
 *   ENVIRONMENT=dev npx tsx scripts/decrypt-vault-name.ts --user-id <uuid>
 *   ENVIRONMENT=dev npx tsx scripts/decrypt-vault-name.ts --all
 *
 * Requires AWS credentials (profile, EC2 role, etc.) with:
 *   - ssm:GetParameter on /passvault/{env}/jwt-secret
 *   - dynamodb:GetItem / Query / Scan on passvault-vaults-{env}
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { hkdfSync } from 'crypto';
import { getEnvironmentConfig } from '@passvault/shared';
import { decryptDisplayNameWithKey } from '../backend/src/utils/crypto.js';

// ---- Config ---------------------------------------------------------------

const ENV = process.env.ENVIRONMENT ?? 'dev';
const config = getEnvironmentConfig(ENV);
const REGION = config.region;
const TABLE = process.env.VAULTS_TABLE_NAME ?? `passvault-vaults-${ENV}`;
const SSM_PARAM = process.env.JWT_SECRET_PARAM ?? `/passvault/${ENV}/jwt-secret`;

// ---- Args -----------------------------------------------------------------

interface Args {
  vaultId?: string;
  userId?: string;
  all: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vault-id') args.vaultId = argv[++i];
    else if (a === '--user-id') args.userId = argv[++i];
    else if (a === '--all') args.all = true;
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printUsage();
      process.exit(2);
    }
  }
  const given = [args.vaultId, args.userId, args.all || undefined].filter(Boolean).length;
  if (given !== 1) {
    console.error('Error: specify exactly one of --vault-id, --user-id, or --all');
    printUsage();
    process.exit(2);
  }
  return args;
}

function printUsage(): void {
  console.error('Usage:');
  console.error('  ENVIRONMENT=<env> npx tsx scripts/decrypt-vault-name.ts --vault-id <uuid>');
  console.error('  ENVIRONMENT=<env> npx tsx scripts/decrypt-vault-name.ts --user-id <uuid>');
  console.error('  ENVIRONMENT=<env> npx tsx scripts/decrypt-vault-name.ts --all');
}

// ---- Key derivation --------------------------------------------------------

async function fetchKey(): Promise<Buffer> {
  const ssm = new SSMClient({ region: REGION });
  const res = await ssm.send(new GetParameterCommand({ Name: SSM_PARAM, WithDecryption: true }));
  if (!res.Parameter?.Value) {
    throw new Error(`JWT secret not found in SSM at ${SSM_PARAM}`);
  }
  // Must match backend/src/utils/crypto.ts: HKDF-SHA256, empty salt, info = 'passvault-vault-displayname-v1'
  const derived = hkdfSync('sha256', res.Parameter.Value, Buffer.alloc(0), 'passvault-vault-displayname-v1', 32);
  return Buffer.from(derived);
}

// ---- DynamoDB queries ------------------------------------------------------

interface VaultRow {
  vaultId: string;
  userId: string;
  displayName: string;
  createdAt: string;
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function getByVaultId(vaultId: string): Promise<VaultRow[]> {
  const res = await client.send(new GetCommand({ TableName: TABLE, Key: { vaultId } }));
  return res.Item ? [res.Item as VaultRow] : [];
}

async function getByUserId(userId: string): Promise<VaultRow[]> {
  const res = await client.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'byUser',
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return (res.Items ?? []) as VaultRow[];
}

async function getAll(): Promise<VaultRow[]> {
  const rows: VaultRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await client.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }));
    rows.push(...((res.Items ?? []) as VaultRow[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

// ---- Output ---------------------------------------------------------------

function printTable(rows: Array<VaultRow & { plaintext: string }>): void {
  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }
  const header = ['vaultId', 'userId', 'displayName', 'createdAt'];
  const table = [header, ...rows.map(r => [r.vaultId, r.userId, r.plaintext, r.createdAt])];
  const widths = header.map((_, i) => Math.max(...table.map(row => row[i].length)));
  for (const row of table) {
    console.log(row.map((c, i) => c.padEnd(widths[i])).join('  '));
  }
}

// ---- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.error(`[decrypt-vault-name] environment=${ENV} table=${TABLE} ssm=${SSM_PARAM}`);

  const key = await fetchKey();

  let rows: VaultRow[];
  if (args.vaultId) rows = await getByVaultId(args.vaultId);
  else if (args.userId) rows = await getByUserId(args.userId);
  else rows = await getAll();

  const decrypted = rows.map(r => {
    try {
      return { ...r, plaintext: decryptDisplayNameWithKey(r.displayName, key) };
    } catch (err) {
      return { ...r, plaintext: `<decrypt failed: ${(err as Error).message}>` };
    }
  });

  printTable(decrypted);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
