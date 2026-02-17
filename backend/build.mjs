import { build } from 'esbuild';
import { rmSync, mkdirSync } from 'fs';

const handlers = ['auth', 'admin', 'vault', 'challenge', 'health'];

// Clean dist
rmSync('dist', { recursive: true, force: true });

for (const handler of handlers) {
  mkdirSync(`dist/${handler}`, { recursive: true });

  await build({
    entryPoints: [`src/handlers/${handler}.ts`],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: `dist/${handler}/${handler}.js`,
    format: 'cjs',
    sourcemap: true,
    minify: false,
    external: ['@aws-sdk/*'],
  });
}

console.log('Build complete: ', handlers.map(h => `dist/${h}/${h}.js`).join(', '));
