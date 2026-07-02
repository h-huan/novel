/**
 * kill-ports.js — Windows 下清理指定端口的占用进程
 * 用法: node kill-ports.js [ports...]
 */

const { execSync, spawnSync } = require('child_process');

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      shell: 'cmd.exe',
      timeout: 5000,
    });
    const lines = out.split('\n').filter(l => l.includes('LISTENING'));
    const pids = new Set();
    for (const line of lines) {
      const m = line.trim().match(/(\d+)$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try {
        spawnSync('taskkill', ['/F', '/PID', pid], { shell: true });
        console.log(`✓ Killed PID ${pid} on port ${port}`);
      } catch (e) {
        console.log(`  PID ${pid}: ${e.message}`);
      }
    }
  } catch {
    // 端口未被占用
  }
}

const ports = process.argv.slice(2).map(Number).filter(Boolean);
const targets = ports.length > 0 ? ports : Array.from({ length: 11 }, (_, i) => 3100 + i);

console.log(`Cleaning ports: ${targets.join(', ')}`);
for (const port of targets) killPort(port);
console.log('Done.');
