// Constants for the pre-baked known-vault fixture used by 12-vault-import-gz.
// The fixture files (known-vault.json + known-vault.vault.gz) are produced
// by `generate-known-vault.ts` and committed alongside this module so e2e
// runs don't have to re-derive an Argon2id key on every CI run.
//
// To regenerate (e.g. after a crypto-params change in shared/), run:
//   npx tsx frontend/e2e/fixtures/generate-known-vault.ts

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));

export const KNOWN_VAULT_PASSWORD = 'E2eImportTest99!';
export const KNOWN_VAULT_JSON_PATH = join(here, 'known-vault.json');
export const KNOWN_VAULT_GZ_PATH = join(here, 'known-vault.vault.gz');

// Inside the fixture: two index entries (one login, one note) so the import
// dialog's "items found" preview surfaces a non-zero count and at least one
// category breakdown line.
export const KNOWN_VAULT_ITEM_COUNT = 2;
