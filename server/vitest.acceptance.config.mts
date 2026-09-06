import { fileURLToPath } from 'node:url';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
export default defineConfig({
  resolve: { alias: { 'node:sqlite': resolve(configDirectory, 'src/acceptance/node-sqlite.native.ts') } },
  test: { environment: 'node', include: ['src/acceptance/*.acceptance.spec.ts', 'src/state/*.acceptance.spec.ts', 'src/modules/chapter/aggregate-summary.acceptance.spec.ts', 'src/modules/outline/*.acceptance.spec.ts', 'src/chain/*.acceptance.spec.ts'] },
});
