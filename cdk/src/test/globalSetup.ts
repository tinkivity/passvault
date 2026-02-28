/**
 * Creates minimal stub Lambda bundles so CDK can compute asset hashes during
 * test synthesis. Only writes files that don't already exist, so a real backend
 * build is preferred and won't be overwritten.
 */
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// cdk/src/test/ → passvault/backend/dist/
const DIST_BASE = resolve(__dirname, '../../../backend/dist');
const HANDLERS = ['challenge', 'auth', 'admin', 'vault', 'health'];

export function setup(): void {
  for (const name of HANDLERS) {
    const dir = `${DIST_BASE}/${name}`;
    const file = `${dir}/${name}.js`;
    if (!existsSync(file)) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, `exports.handler = async () => ({ statusCode: 200 });\n`);
    }
  }
}
