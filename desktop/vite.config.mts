import { fileURLToPath } from 'node:url';
const configDirectory = fileURLToPath(new URL('.', import.meta.url));
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'node:module';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron') as string;
let electronChild: ChildProcess | null = null;
const expectedElectronExits = new Set<number>();

function stopElectronChild(): void {
  const child = electronChild;
  if (!child?.pid || child.exitCode !== null) return;
  expectedElectronExits.add(child.pid);
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore', windowsHide: true, shell: false,
    });
  } else {
    child.kill('SIGTERM');
  }
  electronChild = null;
}

function startElectronHidden(): void {
  stopElectronChild();
  const child = spawn(electronExecutable, ['.', '--no-sandbox'], {
    cwd: configDirectory,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
    env: process.env,
  });
  electronChild = child;
  child.once('exit', code => {
    const expected = child.pid ? expectedElectronExits.delete(child.pid) : false;
    if (electronChild === child) electronChild = null;
    if (!expected) process.exit(code ?? 0);
  });
}

process.once('exit', stopElectronChild);

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
      // vite-plugin-electron 默认热重启使用 shell taskkill；Windows 下会反复闪现 CMD。
      // 这里直接启动 electron.exe，并用隐藏的 taskkill.exe 管理热重启。
      onstart: () => startElectronHidden(),
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
