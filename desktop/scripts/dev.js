const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const desktopRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(desktopRoot, '..');
const serverRoot = path.join(repositoryRoot, 'server');
const cliArgs = process.argv.slice(2);
if (!cliArgs.includes('--host')) cliArgs.unshift('--host', '0.0.0.0');

const viteEntry = path.join(path.dirname(require.resolve('vite')), 'bin', 'vite.js');
const nestEntry = path.join(serverRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
const healthUrl = 'http://127.0.0.1:3100/api/v1/health';
const START_TIMEOUT_MS = 30_000;

// Windows 控制台默认代码页可能仍是 GBK。直接调用 chcp.com 修改当前共享
// 控制台，不经过 cmd.exe，也不会创建可见窗口。
if (process.platform === 'win32') {
  const chcp = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'chcp.com');
  spawnSync(chcp, ['65001'], {
    stdio: 'ignore',
    windowsHide: true,
    shell: false,
  });
}

const buildCommitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  windowsHide: true,
  shell: false,
});
const localBuildCommit = buildCommitResult.status === 0
  ? String(buildCommitResult.stdout || '').trim()
  : '';

const utf8Env = {
  ...process.env,
  LANG: 'zh_CN.UTF-8',
  LC_ALL: 'zh_CN.UTF-8',
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
};

let backend = null;
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
  killProcessTree(backend);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopChildren();
    process.exitCode = 0;
  });
}
process.once('exit', stopChildren);

async function backendHealth() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return null;
    const body = await response.json();
    if (body?.status !== 'ok') return null;
    return { buildCommit: String(body?.build?.commit || '').trim() };
  } catch {
    return null;
  }
}

// A ready port is not proof that the code currently on disk is running.
// Never silently reuse a stale or unidentified process for production tests.
function assertBackendMatchesCurrentCheckout(health) {
  if (!localBuildCommit) throw new Error('无法核验当前 Git HEAD，不能宣称后端运行的是最新代码');
  if (health.buildCommit !== localBuildCommit) {
    throw new Error('端口3100已有后端，但运行提交为 ' + (health.buildCommit || 'unknown')
      + '，当前工作分支为 ' + localBuildCommit
      + '。请先关闭旧后端并重新启动；拒绝把旧进程当作新版验收');
  }
}

async function waitForBackend(child) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const health = await backendHealth();
    if (health) {
      assertBackendMatchesCurrentCheckout(health);
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`服务端启动进程提前退出（code=${child.exitCode ?? 'null'}, signal=${child.signalCode ?? 'none'}）`);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`服务端未在 ${START_TIMEOUT_MS / 1000} 秒内通过健康检查：${healthUrl}`);
}

async function ensureBackend() {
  const existing = await backendHealth();
  if (existing) {
    assertBackendMatchesCurrentCheckout(existing);
    console.log('[dev] reuse verified backend at http://127.0.0.1:3100');
    return;
  }
  if (!localBuildCommit) throw new Error('无法核验当前 Git HEAD，拒绝以未知构建身份启动后端');
  if (!fs.existsSync(nestEntry)) {
    throw new Error(`Nest CLI 不存在：${nestEntry}；请先在 server 目录执行 npm ci。`);
  }
  console.log('[dev] starting backend on http://127.0.0.1:3100');
  backend = spawn(process.execPath, [nestEntry, 'start', '--watch'], {
    cwd: serverRoot,
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
    env: {
      ...utf8Env,
      NOVEL_BUILD_COMMIT: localBuildCommit,
      GIT_COMMIT_SHA: localBuildCommit,
      GITHUB_SHA: localBuildCommit,
      PORT: '3100',
      SERVER_PORT: '3100',
    },
  });
  backend.once('error', error => {
    console.error(`[dev] backend start failed: ${error.message}`);
  });
  await waitForBackend(backend);
  console.log('[dev] backend ready');
}

async function main() {
  await ensureBackend();
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
  backend?.once('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[dev] backend exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    stopChildren();
    process.exitCode = 1;
  });
}

main().catch(error => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  stopChildren();
  process.exitCode = 1;
});
