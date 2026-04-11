#!/usr/bin/env npx tsx
/**
 * PassVault JWT secret rotation tool.
 *
 * Rotates the JWT secret stored at /passvault/{env}/jwt-secret and re-encrypts
 * every vault `displayName` so new-key ciphertext replaces old-key ciphertext
 * in one sweep. Idempotent via a local progress file.
 *
 * See cdk/DEPLOYMENT.md "JWT Secret Rotation" for the full runbook.
 *
 * Usage (OLD_JWT and NEW_JWT MUST be passed via env vars, NOT argv, so the
 * secret material does not leak through `ps`):
 *
 *   set +o history  # optional: keep the secrets out of shell history
 *   OLD_JWT=$(aws ssm get-parameter --name /passvault/dev/jwt-secret \
 *     --with-decryption --query Parameter.Value --output text)
 *   NEW_JWT=$(openssl rand -hex 32)
 *   ENVIRONMENT=dev OLD_JWT="$OLD_JWT" NEW_JWT="$NEW_JWT" \
 *     npx tsx scripts/rotate-jwt-secret.ts
 *   unset OLD_JWT NEW_JWT
 *   set -o history
 *
 * Requires AWS credentials with:
 *   - ssm:GetParameter / PutParameter on /passvault/{env}/jwt-secret
 *   - dynamodb:Scan / UpdateItem on passvault-vaults-{env}
 */

import { SSMClient, PutParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hkdfSync } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getEnvironmentConfig } from '@passvault/shared';
import {
  encryptDisplayNameWithKey,
  decryptDisplayNameWithKey,
} from '../backend/src/utils/crypto.js';

// ---- Config ---------------------------------------------------------------

const ENV = process.env.ENVIRONMENT ?? 'dev';
const config = getEnvironmentConfig(ENV);
const REGION = config.region;
const TABLE = process.env.VAULTS_TABLE_NAME ?? `passvault-vaults-${ENV}`;
const SSM_PARAM = process.env.JWT_SECRET_PARAM ?? `/passvault/${ENV}/jwt-secret`;
const PROGRESS_FILE = `.rotation-progress-${ENV}.json`;

const OLD_JWT = process.env.OLD_JWT;
const NEW_JWT = process.env.NEW_JWT;
const DRY_RUN = process.argv.includes('--dry-run');

if (!OLD_JWT || !NEW_JWT) {
  console.error('Error: OLD_JWT and NEW_JWT environment variables are required.');
  console.error('See the header of this file for the full runbook.');
  process.exit(2);
}

// ---- Key derivation (must match backend/src/utils/crypto.ts) --------------

function deriveKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), 'passvault-vault-displayname-v1', 32),
  );
}

// ---- Progress file (idempotency) ------------------------------------------

interface Progress {
  startedAt: string;
  completedVaultIds: string[];
  ssmUpdated: boolean;
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) as Progress;
  }
  return { startedAt: new Date().toISOString(), completedVaultIds: [], ssmUpdated: false };
}

function saveProgress(p: Progress): void {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---- DynamoDB -------------------------------------------------------------

interface VaultRow {
  vaultId: string;
  userId: string;
  displayName: string;
  encryptionSalt: string;
  createdAt: string;
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const ssm = new SSMClient({ region: REGION });

async function scanAllVaults(): Promise<VaultRow[]> {
  const rows: VaultRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }));
    rows.push(...((res.Items ?? []) as VaultRow[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return rows;
}

async function updateDisplayName(vaultId: string, ciphertext: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { vaultId },
    UpdateExpression: 'SET displayName = :dn',
    ExpressionAttributeValues: { ':dn': ciphertext },
    ConditionExpression: 'attribute_exists(vaultId)',
  }));
}

// ---- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  console.error(`[rotate-jwt-secret] env=${ENV} table=${TABLE} ssm=${SSM_PARAM} dryRun=${DRY_RUN}`);

  const oldKey = deriveKey(OLD_JWT!);
  const newKey = deriveKey(NEW_JWT!);

  const progress = loadProgress();
  const completed = new Set(progress.completedVaultIds);

  // Phase 1: decrypt every row under OLD_JWT. If anything fails here, abort
  // BEFORE touching SSM so the rotation can be retried cleanly.
  console.error('Phase 1: scanning and decrypting with OLD_JWT…');
  const rows = await scanAllVaults();
  const plans: Array<{ vaultId: string; plaintext: string }> = [];
  for (const row of rows) {
    if (completed.has(row.vaultId)) continue;
    try {
      plans.push({ vaultId: row.vaultId, plaintext: decryptDisplayNameWithKey(row.displayName, oldKey) });
    } catch (err) {
      console.error(`FATAL: cannot decrypt vaultId=${row.vaultId} under OLD_JWT: ${(err as Error).message}`);
      console.error('Aborting before SSM update. Nothing has changed yet.');
      process.exit(1);
    }
  }
  console.error(`  decrypted ${plans.length} rows (${completed.size} already done in a previous run)`);

  if (DRY_RUN) {
    console.error('DRY RUN: stopping before SSM update and DynamoDB writes.');
    return;
  }

  // Phase 2: overwrite SSM with NEW_JWT. From this point on, new Lambda cold
  // starts will use NEW_JWT; any unrewritten row becomes temporarily undecryptable.
  if (!progress.ssmUpdated) {
    console.error('Phase 2: writing NEW_JWT to SSM…');
    await ssm.send(new PutParameterCommand({
      Name: SSM_PARAM,
      Value: NEW_JWT!,
      Type: 'SecureString',
      Overwrite: true,
    }));
    progress.ssmUpdated = true;
    saveProgress(progress);
  } else {
    console.error('Phase 2: SSM already updated (resuming from progress file)');
  }

  // Phase 3: re-encrypt each row under NEW_JWT and write back.
  console.error('Phase 3: re-encrypting rows under NEW_JWT…');
  for (const plan of plans) {
    const ciphertext = encryptDisplayNameWithKey(plan.plaintext, newKey);
    await updateDisplayName(plan.vaultId, ciphertext);
    progress.completedVaultIds.push(plan.vaultId);
    saveProgress(progress);
    console.error(`  rewrote ${plan.vaultId}`);
  }

  // Phase 4: canary — re-scan one row and confirm it decrypts under NEW_JWT.
  if (plans.length > 0) {
    console.error('Phase 4: canary verification…');
    const canaryId = plans[0].vaultId;
    const canary = rows.find(r => r.vaultId === canaryId);
    const fresh = await scanAllVaults();
    const updated = fresh.find(r => r.vaultId === canaryId);
    if (!updated) throw new Error(`canary vault ${canaryId} disappeared`);
    const decrypted = decryptDisplayNameWithKey(updated.displayName, newKey);
    if (decrypted !== plans[0].plaintext) {
      throw new Error(`canary decrypt mismatch: expected "${plans[0].plaintext}", got "${decrypted}"`);
    }
    console.error(`  canary ok: ${canaryId} -> "${decrypted}"`);
    void canary;
  }

  console.error('Done. Remember to force Lambda cold starts and smoke-test the UI.');
  console.error(`Progress file retained at ${PROGRESS_FILE}; delete it once you have verified success.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
