import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve(__dirname, '..'), plugins: [react()], server: { host: '127.0.0.1', port: 35173, strictPort: true } });
