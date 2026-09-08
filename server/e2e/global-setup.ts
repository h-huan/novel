import path from 'path';
import type { FullConfig } from '@playwright/test';

export default async function globalSetup(_config: FullConfig) {
  const port = Number(process.env.E2E_PORT || '3100');
  process.env.SERVER_PORT = String(port);
  process.env.HOST = '127.0.0.1';
  process.env.NODE_ENV = 'test';
  process.env.DATA_DIR = path.join(__dirname, `.runtime-data-${port}`);
  const { bootstrap } = await import('../dist/src/main');
  const app = await bootstrap({ port, host: '127.0.0.1' });
  return async () => {
    await app.close();
  };
}
