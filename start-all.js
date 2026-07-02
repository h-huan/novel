#!/usr/bin/env node
/**
 * start-all.js — 一键启动后端 + 前端
 * 自动清理端口，自动发现端口，自动代理
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SERVER_DIR = path.join(ROOT, 'server');
const DESKTOP_DIR = path.join(ROOT, 'desktop');

// ============================================================
// 1. 清理端口
// ============================================================
function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port} `, {
      shell: true,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const pids = new Set();
    out.split('\n').forEach(line => {
      const m = line.trim().match(/(\d+)$/);
      if (m) pids.add(m[1]);
    });
    pids.forEach(pid => {
      try {
        execSync(`taskkill /F /PID ${pid}`, { shell: true, stdio: 'ignore' });
        console.log(`  ✔ Killed PID ${pid} on port ${port}`);
      } catch {}
    });
  } catch {}
}

console.log('[1/3] Cleaning ports...');
[3100, 3101, 3102, 3103, 3104, 3105, 3106, 3107, 3108, 3109, 3110].forEach(killPort);
[5173, 5174, 5175, 5176, 5177].forEach(killPort);
console.log('  Ports cleaned.\n');

// ============================================================
// 2. 启动后端
// ============================================================
console.log('[2/3] Starting backend...');
const backendEnv = { ...process.env, NODE_ENV: 'development' };

// 先编译
console.log('  Building backend...');
try {
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit', env: backendEnv, timeout: 120_000 });
  console.log('  Build succeeded.');
} catch (e) {
  console.error('  ❌ Backend build failed!');
  process.exit(1);
}

// 启动后端
const backend = spawn('node', ['dist/src/main.js'], {
  cwd: SERVER_DIR,
  env: backendEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  shell: true,
});

let backendPort = null;
backend.stdout.on('data', chunk => {
  const line = chunk.toString();
  const m = line.match(/$$PORT$$\s*(\d+)/);
  if (m) {
    backendPort = m[1];
    fs.writeFileSync(path.join(SERVER_DIR, '.port'), backendPort, 'utf8');
    console.log(`  ✔ Backend running on http://localhost:${backendPort}`);
  }
  process.stdout.write(`  [BE] ${line.trim()}\n`);
});
backend.stderr.on('data', chunk => {
  process.stderr.write(`  [BE] ${chunk.toString().trim()}\n`);
});

backend.unref();

// 等待后端启动
function waitForBackend(maxWait = 15_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (backendPort) {
        clearInterval(timer);
        resolve(backendPort);
        return;
      }
      if (Date.now() - start > maxWait) {
        clearInterval(timer);
        // 尝试读 .port 文件
        try {
          const p = fs.readFileSync(path.join(SERVER_DIR, '.port'), 'utf8').trim();
          if (p) { resolve(p); return; }
        } catch {}
        reject(new Error('Backend startup timeout'));
      }
    }, 500);
  });
}

// ============================================================
// 3. 启动前端
// ============================================================
(async () => {
  try {
    await waitForBackend();
  } catch {
    console.error('  ❌ Backend failed to start in time!');
    process.exit(1);
  }

  console.log('\n[3/3] Starting frontend...');
  const frontend = spawn('npx', ['vite', '--host', '0.0.0.0'], {
    cwd: DESKTOP_DIR,
    env: { ...process.env, VITE_BACKEND_PORT: backendPort },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: true,
  });

  let frontendPort = null;
  frontend.stdout.on('data', chunk => {
    const line = chunk.toString();
    const m = line.match(/Local:\s+http:\/\/localhost:(\d+)/);
    if (m) {
      frontendPort = m[1];
      console.log(`  ✔ Frontend running on http://localhost:${frontendPort}`);
      console.log(`\n🎉 All ready! Open http://localhost:${frontendPort} in your browser.\n`);
    }
    process.stdout.write(`  [FE] ${line.trim()}\n`);
  });
  frontend.stderr.on('data', chunk => {
    process.stderr.write(`  [FE] ${chunk.toString().trim()}\n`);
  });

  frontend.unref();

  // 保持主进程运行
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    process.exit(0);
  });
})();
