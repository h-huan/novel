import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'quality-cockpit.spec.ts',
  outputDir: '../test-results/quality-ui',
  use: { baseURL: 'http://127.0.0.1:35173', browserName: 'chromium', channel: 'msedge', viewport: { width: 1280, height: 900 } },
  webServer: { cwd: resolve(__dirname, '..'), command: 'npx vite --config e2e/quality.vite.config.mts', url: 'http://127.0.0.1:35173', reuseExistingServer: false },
});
