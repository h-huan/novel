import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
export default defineConfig({
  resolve: { alias: { 'node:sqlite': resolve(__dirname, 'src/acceptance/node-sqlite.native.ts') } },
  test: { environment: 'node', include: ['src/acceptance/*.acceptance.spec.ts', 'src/state/*.acceptance.spec.ts', 'src/modules/chapter/aggregate-summary.acceptance.spec.ts', 'src/modules/outline/*.acceptance.spec.ts', 'src/chain/*.acceptance.spec.ts'] },
});
