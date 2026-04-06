/**
 * Generate _meta.json manifest for email templates.
 *
 * Reads all .html files in cdk/assets/email-templates/{lang}/{type}.html,
 * computes SHA-256 hashes, and writes _meta.json alongside the templates.
 *
 * Usage: npx tsx scripts/generate-template-manifest.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { EMAIL_TEMPLATE_CONFIG } from '@passvault/shared';

const TEMPLATES_DIR = resolve(__dirname, '../cdk/assets/email-templates');
const OUTPUT_PATH = resolve(TEMPLATES_DIR, '_meta.json');

function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function main(): void {
  const hashes: Record<string, string> = {};

  // Iterate over language directories
  const entries = readdirSync(TEMPLATES_DIR, { withFileTypes: true });
  for (const langDir of entries) {
    if (!langDir.isDirectory()) continue;
    const langPath = join(TEMPLATES_DIR, langDir.name);
    const files = readdirSync(langPath);

    for (const file of files) {
      if (!file.endsWith('.html')) continue;
      const filePath = join(langPath, file);
      if (!statSync(filePath).isFile()) continue;

      const content = readFileSync(filePath, 'utf-8');
      const key = `${langDir.name}/${file}`;
      hashes[key] = computeHash(content);
    }
  }

  const manifest = {
    version: EMAIL_TEMPLATE_CONFIG.TEMPLATE_VERSION,
    hashes,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  const count = Object.keys(hashes).length;
  console.log(`Wrote ${OUTPUT_PATH} with ${count} template hashes (version ${manifest.version})`);
}

main();
