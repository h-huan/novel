import path from 'path';
import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  process.env.SERVER_PORT = '3100';
  process.env.HOST = '127.0.0.1';
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = path.join(__dirname, '.runtime-data');
  const { bootstrap } = await import('../dist/src/main');
  const app = await bootstrap({ port: 3100, host: '127.0.0.1', writePortFile: false });
  return async () => {
    await app.close();
  };
}
