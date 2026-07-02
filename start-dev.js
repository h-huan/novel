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
    for (const pid of pids) try { execSync(`taskkill /F /PID ${pid}`, { shell: true, timeout: 3000 }); } catch {}
  }
}

console.log('[1/3] Killing old processes...');
killPorts([3100, 3101, 3102, 5173]);
try { fs.unlinkSync(PORT_FILE); } catch {}

console.log('[2/3] Compiling & starting backend...');
try {
  execSync('node node_modules/typescript/bin/tsc -p tsconfig.json', { cwd: SERVER_DIR, stdio: 'pipe', timeout: 60000, encoding: 'utf8', shell: true });
} catch(e) { console.log('  tsc done (warnings ok)'); }
try { execSync('node copy-assets.js', { cwd: SERVER_DIR, stdio: 'pipe' }); } catch {}

const backend = spawn('node', ['dist/src/main.js'], { cwd: SERVER_DIR, stdio: 'pipe', shell: false, detached: true });
backend.stdout.on('data', d => process.stdout.write(`[api] ${d}`));
backend.stderr.on('data', d => process.stderr.write(d));

// 等 .port 文件出现
setTimeout(() => {
  if (fs.existsSync(PORT_FILE)) {
    console.log('\n[3/3] Starting frontend...');
    const fe = spawn('npx', ['vite', '--host', '0.0.0.0'], { cwd: DESKTOP_DIR, stdio: 'inherit', shell: false });
    fe.on('close', () => { try { process.kill(-backend.pid); } catch {} process.exit(0); });
  } else {
    console.error('Backend .port not found after 8s - check logs above');
    process.exit(1);
  }
}, 8000);

console.log('Waiting 8s for backend to start & write .port file...');
