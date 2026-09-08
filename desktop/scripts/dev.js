const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const cliArgs = process.argv.slice(2);
if (!cliArgs.includes('--host')) cliArgs.unshift('--host', '0.0.0.0');

const viteEntry = path.join(path.dirname(require.resolve('vite')), 'bin', 'vite.js');

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

const utf8Env = {
  ...process.env,
  LANG: 'zh_CN.UTF-8',
  LC_ALL: 'zh_CN.UTF-8',
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
  NO_COLOR: '1',
  FORCE_COLOR: '0',
};

const vite = spawn(process.execPath, [viteEntry, ...cliArgs], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  windowsHide: true,
  env: utf8Env,
});

let stopping = false;
function stopVite() {
  if (stopping || !vite.pid || vite.exitCode !== null) return;
  stopping = true;
  if (process.platform === 'win32') {
    spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/pid', String(vite.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });
  } else {
    vite.kill('SIGTERM');
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, stopVite);
}

process.once('exit', stopVite);

vite.once('error', error => {
  console.error(`Vite 启动失败：${error.message}`);
  process.exitCode = 1;
});

vite.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
