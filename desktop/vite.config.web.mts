import { fileURLToPath } from 'node:url';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// 固定端口职责：管理端 5173，服务端 API 3100。
const backendPort = 3100;

export default defineConfig({
  plugins: [
    react(),
    // 注意：不包含 vite-plugin-electron，纯 web 模式
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${backendPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(configDirectory, 'src/renderer'),
    },
  },
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(configDirectory, 'index.html'),
        launcher: path.resolve(configDirectory, 'launcher.html'),
      },
    },
  },
});
