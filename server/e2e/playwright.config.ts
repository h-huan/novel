import { defineConfig } from '@playwright/test';
import path from 'node:path';

const port = process.env.E2E_PORT || '3100';
const runtimeDataDir = path.resolve(__dirname, `.runtime-data-${port}-${process.pid}`);

// E2E fixtures write directly only to the same isolated SQLite directory used
// by the spawned server. Keep the guard in helpers.ts strict: production/local
// data directories must never be accepted as test fixtures.
process.env.DATA_DIR = runtimeDataDir;

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
    env: {
      NODE_ENV: 'test',
      PORT: port,
      SERVER_PORT: port,
      HOST: '127.0.0.1',
      DATA_DIR: runtimeDataDir,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${port}/api/v1`,
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/flows/*.spec.ts', '**/specialized/*.spec.ts'],
    },
  ],
});
