import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
export default defineConfig({
  resolve: { alias: { 'node:sqlite': resolve(__dirname, 'src/__mocks__/node-sqlite.ts') } },
  test: { environment: 'node', include: ['src/acceptance/*.acceptance.spec.ts', 'src/modules/chapter/aggregate-summary.acceptance.spec.ts'] },
});
