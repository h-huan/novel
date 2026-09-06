import { fileURLToPath } from 'node:url';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 65,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(configDirectory, './src/renderer'),
      '@novel/shared': path.resolve(configDirectory, '../server/shared/src'),
    },
  },
});
