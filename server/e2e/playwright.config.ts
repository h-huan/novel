import { defineConfig } from '@playwright/test';
import path from 'node:path';

const port = process.env.E2E_PORT || '3100';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  webServer: {
    command: 'node --no-warnings dist/src/main.js',
    cwd: path.resolve(__dirname, '..'),
    url: `http://127.0.0.1:${port}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60000,
    env: { NODE_ENV: 'test', PORT: port, SERVER_PORT: port, HOST: '127.0.0.1',
      DATA_DIR: path.resolve(__dirname, `.runtime-data-${port}-${process.pid}`) },
  },
  use: {
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT || 3100}/api/v1`,
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/flows/*.spec.ts', '**/specialized/*.spec.ts'],
    },
  ],
});
