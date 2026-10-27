import { fileURLToPath } from 'node:url';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// 固定端口职责：管理端 5173，服务端 API 3100。
const backendPort = 3100;

// Electron 插件
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

export default defineConfig({
  plugins: [
    react(),
    electron({
      entry: {
        main: 'src/main/main.ts',
        preload: 'src/main/preload.ts',
      },
      vite: {
        build: {
          outDir: 'dist-electron',
          rollupOptions: {
            external: ['electron'],
          },
        },
      },
      // 只编译 Electron 主进程与 preload；开发者需单独启动 Electron。
      // 显式覆盖插件默认 onstart 行为，防止 Vite 自动拉起/重启 Electron。
      onstart: () => {},
    }),
    renderer(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // 代理到固定的服务端 API 端口。
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
        main: 'index.html',
        launcher: 'launcher.html',
      },
    },
  },
});
