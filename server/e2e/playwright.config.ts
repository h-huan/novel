import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3100/api/v1',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: ['**/flows/*.spec.ts', '**/specialized/*.spec.ts'],
    },
  ],
});
