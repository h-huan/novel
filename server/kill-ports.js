/**
 * kill-ports.js — Windows 下清理指定端口的占用进程
 * 用法: node kill-ports.js [ports...]
 */

const { spawnSync } = require('child_process');

function killPort(port) {
  try {
    const query = spawnSync('netstat.exe', ['-ano'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
    const out = query.stdout || '';
    const lines = out.split('\n').filter(l => l.includes('LISTENING'));
    const pids = new Set();
    for (const line of lines) {
      const columns = line.trim().split(/\s+/);
      const address = columns[1] || '';
      const m = address.match(/:(\d+)$/);
      if (m?.[1] === String(port) && columns.at(-1)) pids.add(columns.at(-1));
    }
    for (const pid of pids) {
      try {
        spawnSync('taskkill.exe', ['/F', '/PID', pid], { windowsHide: true, shell: false });
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
