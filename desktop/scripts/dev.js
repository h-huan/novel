const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const cliArgs = process.argv.slice(2);
if (!cliArgs.includes('--host')) cliArgs.unshift('--host', '0.0.0.0');

const viteEntry = path.join(path.dirname(require.resolve('vite')), 'bin', 'vite.js');
const healthUrl = 'http://127.0.0.1:3100/api/v1/health';
// The developer terminal owns its console encoding. Changing the shared Windows
// code page from a child process can break sibling tools and cannot repair
// an already configured terminal decoder.

const utf8Env = {
  ...process.env,
  LANG: 'zh_CN.UTF-8',
  LC_ALL: 'zh_CN.UTF-8',
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
};

let vite = null;
let stopping = false;

function killProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
  } else {
    child.kill('SIGTERM');
  }
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  killProcessTree(vite);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopChildren();
    process.exitCode = 0;
  });
}
process.once('exit', stopChildren);

async function backendHealthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

// Desktop development deliberately reuses, but does not own, port 3100.
// The root restart.ps1 starts a clean-built single-process backend before
// launching this frontend. Never invoke Nest --watch from here: it conflicts
// with the clean-build runtime and can leave stale port/database owners.
async function requireBackend() {
  if (await backendHealthy()) {
    console.log('[dev] backend healthy at http://127.0.0.1:3100 (external; not managed by desktop)');
    return;
  }
  throw new Error('Backend 3100 not healthy. Start it from the repo root with: powershell -File .\\restart.ps1 -Only back; then run desktop npm run dev. No auto-start/watch attempted.');
}

async function main() {
  await requireBackend();
  vite = spawn(process.execPath, [viteEntry, ...cliArgs], {
    cwd: desktopRoot,
    stdio: 'inherit',
    windowsHide: true,
    env: utf8Env,
  });
  vite.once('error', error => {
    console.error(`Vite 启动失败：${error.message}`);
    stopChildren();
    process.exitCode = 1;
  });
  vite.once('exit', (code, signal) => {
    stopChildren();
    if (signal) process.exitCode = 1;
    else process.exitCode = code ?? 1;
  });
}

main().catch(error => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  stopChildren();
  process.exitCode = 1;
});
