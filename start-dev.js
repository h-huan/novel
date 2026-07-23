const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER_DIR = path.join(ROOT, 'server');
const DESKTOP_DIR = path.join(ROOT, 'desktop');
const PORT_FILE = path.join(SERVER_DIR, '.port');

function killPorts(ports) {
  for (const port of ports) {
    let output;
    try { output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', shell: 'cmd.exe', timeout: 3000 }); } catch { continue; }
    const pids = new Set();
    for (const line of output.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const m = line.trim().match(/(\d+)$/);
      if (m) pids.add(m[1]);
    }
    // Vite 会派生 Electron；必须关闭整个进程树，否则旧 Electron 持有单实例锁，
    // 新实例会立即退出并连带关闭刚启动的后端。
    for (const pid of pids) try { execSync(`taskkill /T /F /PID ${pid}`, { shell: true, timeout: 5000 }); } catch {}
  }
}

function listeningPids(port) {
  let output;
  try { output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', shell: 'cmd.exe', timeout: 3000 }); } catch { return []; }
  const pids = new Set();
  for (const line of output.split('\n')) {
    if (!line.includes('LISTENING')) continue;
    const match = line.trim().match(/(\d+)$/);
    if (match) pids.add(match[1]);
  }
  return [...pids];
}

function waitForPortsReleased(ports, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const occupied = ports.filter(port => listeningPids(port).length > 0);
    if (occupied.length === 0) return;
    // Windows may keep a just-killed Node/Electron process alive briefly.
    // Wait for the actual listener to disappear instead of racing a fixed delay.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  const occupied = ports.filter(port => listeningPids(port).length > 0);
  throw new Error(`旧服务未在限定时间内释放端口: ${occupied.join(', ')}`);
}

console.log('[1/3] Killing old frontend and backend processes...');
const managedPorts = [
  3100, 3101, 3102, 3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110,
  5173, 5174, 5175, 5176, 5177,
];
killPorts(managedPorts);
try { fs.unlinkSync(PORT_FILE); } catch {}

// 等待 Windows 真正释放端口和 Electron 单实例锁，避免盲等后发生 EADDRINUSE。
waitForPortsReleased(managedPorts);

console.log('[2/3] Compiling & starting backend...');
try {
  execSync('npm run build', {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    timeout: 120000,
    shell: true,
  });
} catch (error) {
  console.error('Backend build failed. Frontend was not started.');
  process.exit(1);
}

let shuttingDown = false;

const backend = spawn(process.execPath, ['dist/src/main.js'], { cwd: SERVER_DIR, stdio: 'pipe', shell: false });
backend.stdout.on('data', d => process.stdout.write(`[api] ${d}`));
backend.stderr.on('data', d => process.stderr.write(d));
backend.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`Backend exited unexpectedly (code ${code ?? 'unknown'}).`);
    process.exit(code || 1);
  }
});

async function waitForBackend(timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(PORT_FILE)) {
      const port = fs.readFileSync(PORT_FILE, 'utf8').trim();
      if (/^\d+$/.test(port)) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
            signal: AbortSignal.timeout(2000),
          });
          if (response.ok) return port;
        } catch {}
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Backend health check timed out');
}

function stopBackend() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!backend.killed) backend.kill('SIGTERM');
}

process.once('SIGINT', () => { stopBackend(); process.exit(0); });
process.once('SIGTERM', () => { stopBackend(); process.exit(0); });
process.once('exit', stopBackend);

(async () => {
  try {
    const port = await waitForBackend();
    console.log(`\n[3/3] Backend healthy on ${port}; starting desktop...`);
    const viteEntry = path.join(DESKTOP_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
    const frontend = spawn(process.execPath, [viteEntry, '--host', '0.0.0.0'], {
      cwd: DESKTOP_DIR,
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, VITE_BACKEND_PORT: port },
    });
    frontend.on('exit', (code) => {
      stopBackend();
      process.exit(code || 0);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    stopBackend();
    process.exit(1);
  }
})();
