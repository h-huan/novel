import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

// ============================================================
// 自动发现后端端口：优先读 server/.port 文件，
// 如果文件不存在则 fallback 到 3100
// ============================================================
function getBackendPort(): string {
  try {
    const portFile = path.resolve(__dirname, '..', 'server', '.port');
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, 'utf8').trim();
      if (/^\d+$/.test(port)) {
        console.log(`[Vite] Read backend port from .port file: ${port}`);
        return port;
      }
    }
  } catch {
    // ignore
  }
  const envPort = loadEnv('development', process.cwd(), 'VITE_').VITE_BACKEND_PORT;
  if (envPort) return envPort;
  console.log('[Vite] No .port file found, using default port 3100');
  return '3100';
}

const backendPort = getBackendPort();

export default defineConfig({
  plugins: [
    react(),
    // 注意：不包含 vite-plugin-electron，纯 web 模式
  ],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        launcher: path.resolve(__dirname, 'launcher.html'),
      },
    },
  },
});
