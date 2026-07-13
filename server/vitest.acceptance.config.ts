import { defineConfig } from 'vitest/config';
export default defineConfig({
  server: { deps: { external: ['node:sqlite'] } },
  test: { environment: 'node', include: ['src/acceptance/*.acceptance.spec.ts', 'src/modules/chapter/aggregate-summary.acceptance.spec.ts'] },
});
