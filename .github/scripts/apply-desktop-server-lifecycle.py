from pathlib import Path

p = Path('desktop/src/main/main.ts')
text = p.read_text(encoding='utf-8-sig')

if 'function managedServerSpec(port: number)' in text:
    raise SystemExit(0)

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 occurrence, found {count}')
    text = text.replace(old, new, 1)

replace_once(
    "import path from 'path';\nimport fs from 'fs';",
    "import path from 'path';\nimport fs from 'fs';\nimport { spawn, type ChildProcess } from 'node:child_process';",
    'child_process import',
)
replace_once(
    "let lastServerStatus: { running: boolean; port: number; error?: string } = { running: false, port: SERVER_PORT };\nlet serverCheckPromise: Promise<boolean> | null = null;",
    "let lastServerStatus: { running: boolean; port: number; error?: string } = { running: false, port: SERVER_PORT };\nlet serverCheckPromise: Promise<boolean> | null = null;\nlet managedServerProcess: ChildProcess | null = null;\nlet managedServerOutput: string[] = [];",
    'server globals',
)

start_marker = '// ---------- NestJS 服务连接（服务端固定 3100） ----------'
end_marker = '// ---------- IPC 处理器 ----------'
start = text.index(start_marker)
end = text.index(end_marker)
server_block = r'''// ---------- NestJS 服务连接（服务端固定 3100） ----------

const SERVER_START_TIMEOUT_MS = 30_000;
const SERVER_HEALTH_INTERVAL_MS = 250;
const SERVER_OUTPUT_TAIL = 40;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rememberServerOutput(chunk: unknown): void {
  const lines = String(chunk ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return;
  managedServerOutput.push(...lines);
  if (managedServerOutput.length > SERVER_OUTPUT_TAIL) {
    managedServerOutput = managedServerOutput.slice(-SERVER_OUTPUT_TAIL);
  }
}

function broadcastServerStatus(status: { running: boolean; port: number; error?: string }): void {
  lastServerStatus = status;
  mainWindow?.webContents.send('server-status', status);
  launcherWindow?.webContents.send('server-status', status);
}

async function tryConnectPort(port: number): Promise<boolean> {
  try {
    const healthUrl = `http://127.0.0.1:${port}/api/v1/health`;
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = await res.json() as { status?: string };
    return body.status === 'ok';
  } catch { /* 服务未起或端口不可达 */ }
  return false;
}

async function connectToServer(port: number = SERVER_PORT): Promise<boolean> {
  if (!(await tryConnectPort(port))) return false;
  const status = { running: true, port };
  broadcastServerStatus(status);
  console.log(`[server] backend ready at http://127.0.0.1:${port}`);
  return true;
}

function reportServerUnavailable(port: number, detail?: string): void {
  const msg = detail || `服务端启动失败或端口 ${port} 不可用。`;
  broadcastServerStatus({ running: false, port, error: msg });
  console.warn(`[server] backend unavailable on port ${port}: ${msg}`);
}

function stopManagedServer(): void {
  const child = managedServerProcess;
  managedServerProcess = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (child.connected) {
      child.send?.({ type: 'shutdown' }, () => {
        try { child.disconnect?.(); } catch { /* already disconnected */ }
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try { child.kill('SIGTERM'); } catch { /* already stopped */ }
  }
}

function managedServerSpec(port: number): { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } | null {
  if (!app.isPackaged) return null;
  const serverRoot = path.join(process.resourcesPath, 'server');
  const nodeExecutable = path.join(serverRoot, process.platform === 'win32' ? 'node.exe' : 'node');
  const entry = path.join(serverRoot, 'src', 'main.js');
  if (!fs.existsSync(nodeExecutable)) throw new Error(`内置服务端 Node 运行时不存在：${nodeExecutable}`);
  if (!fs.existsSync(entry)) throw new Error(`内置服务端入口不存在：${entry}`);
  const dataDir = path.join(app.getPath('userData'), 'server-data');
  fs.mkdirSync(dataDir, { recursive: true });
  return {
    executable: nodeExecutable,
    args: [entry],
    cwd: serverRoot,
    env: {
      ...process.env,
      PORT: String(port),
      SERVER_PORT: String(port),
      DATA_DIR: dataDir,
      NOVEL_MANAGED_SERVER: '1',
      NODE_ENV: 'production',
    },
  };
}

async function startManagedServer(port: number): Promise<boolean> {
  const spec = managedServerSpec(port);
  if (!spec) {
    reportServerUnavailable(port, '开发模式后端未启动；请从 desktop 目录运行 npm run dev，由启动器自动拉起服务端。');
    return false;
  }

  managedServerOutput = [];
  const child = spawn(spec.executable, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
    shell: false,
  });
  managedServerProcess = child;
  child.stdout?.on('data', chunk => {
    rememberServerOutput(chunk);
    process.stdout.write(`[server] ${String(chunk)}`);
  });
  child.stderr?.on('data', chunk => {
    rememberServerOutput(chunk);
    process.stderr.write(`[server] ${String(chunk)}`);
  });
  child.once('error', error => rememberServerOutput(`spawn error: ${error.message}`));
  child.once('exit', (code, signal) => {
    if (managedServerProcess === child) managedServerProcess = null;
    if (!isQuitting && code !== 0) {
      reportServerUnavailable(port, `受管服务端异常退出（code=${code ?? 'null'}, signal=${signal ?? 'none'}）`);
    }
  });

  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await connectToServer(port)) return true;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await delay(SERVER_HEALTH_INTERVAL_MS);
  }

  const tail = managedServerOutput.slice(-8).join(' | ');
  stopManagedServer();
  reportServerUnavailable(port, `内置服务端未在 ${SERVER_START_TIMEOUT_MS / 1000} 秒内就绪${tail ? `：${tail}` : ''}`);
  return false;
}

function ensureServerRunning(port = SERVER_PORT): Promise<boolean> {
  if (!serverCheckPromise) {
    serverCheckPromise = (async () => {
      // 已有健康服务可能是开发者单独启动的后端；直接复用且不接管生命周期。
      if (await connectToServer(port)) return true;
      if (managedServerProcess && managedServerProcess.exitCode === null) {
        const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (await connectToServer(port)) return true;
          if (!managedServerProcess || managedServerProcess.exitCode !== null) break;
          await delay(SERVER_HEALTH_INTERVAL_MS);
        }
      }
      return startManagedServer(port);
    })().finally(() => { serverCheckPromise = null; });
  }
  return serverCheckPromise;
}

'''
text = text[:start] + server_block + text[end:]

replace_once(
    "  ipcMain.handle('stop-server', async (): Promise<IpcResult> => ({\n    success: false,\n    error: '服务端独立运行，管理端不负责关闭服务端。',\n  }));",
    "  ipcMain.handle('stop-server', async (): Promise<IpcResult> => {\n    if (!managedServerProcess) {\n      return { success: false, error: '当前服务端不是由桌面应用启动，不能由桌面应用关闭。' };\n    }\n    stopManagedServer();\n    broadcastServerStatus({ running: false, port: SERVER_PORT });\n    return { success: true, data: { port: SERVER_PORT, status: 'stopped' } };\n  });",
    'stop-server IPC',
)
replace_once(
    "  app.whenReady().then(() => {\n    registerIpcHandlers();\n    createWindow();\n    createTray();\n    registerShortcuts();\n    setupAutoUpdater();\n    void ensureServerRunning();\n\n    app.on('activate', restoreApplicationWindow);\n  });",
    "  app.whenReady().then(async () => {\n    registerIpcHandlers();\n    createTray();\n    registerShortcuts();\n    setupAutoUpdater();\n\n    // 窗口创建前先完成服务端启动/复用判定，避免渲染层一启动就请求一个尚不存在的 3100。\n    await ensureServerRunning();\n    createWindow();\n\n    app.on('activate', restoreApplicationWindow);\n  });",
    'app ready lifecycle',
)
replace_once(
    "// 退出前只清理管理端自身资源；独立服务端不受影响。\napp.on('before-quit', () => {\n  isQuitting = true;",
    "// 退出时只关闭由桌面应用自己启动的受管服务端；外部复用的 3100 不受影响。\napp.on('before-quit', () => {\n  isQuitting = true;\n  stopManagedServer();",
    'before-quit lifecycle',
)

for required in [
    "spawn(spec.executable",
    "NOVEL_MANAGED_SERVER: '1'",
    "await ensureServerRunning();\n    createWindow();",
    "process.resourcesPath, 'server'",
]:
    if required not in text:
        raise SystemExit(f'missing lifecycle contract marker: {required}')

p.write_text(text, encoding='utf-8')
