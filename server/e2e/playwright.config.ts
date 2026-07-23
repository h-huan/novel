import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3100/api/v1',
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/flows/*.spec.ts', '**/specialized/*.spec.ts'],
    },
  ],
});
