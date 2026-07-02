/**
 * kill-by-port.js — Windows 下通过端口号杀进程
 * 用法: node kill-by-port.js 5173 3100 3109
 */

const { execSync, spawnSync } = require('child_process');

function killByPort(port) {
  let output;
  try {
    // findstr 不支持 \s，直接匹配 ":port" 然后在 JS 里过滤
    output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: 'utf8',
      shell: 'cmd.exe',
      timeout: 10000,
    });
  } catch {
    return; // 端口未被占用
  }

  const pids = new Set();
  for (const line of output.split('\n')) {
    if (!line.includes('LISTENING')) continue;
    // 格式:  TCP    127.0.0.1:3100    0.0.0.0:0    LISTENING    1234
    const m = line.trim().match(/(\d+)$/);
    if (m) pids.add(m[1]);
  }

  if (pids.size === 0) return;

  for (const pid of pids) {
    try {
      const r = spawnSync('taskkill', ['/F', '/PID', pid], {
        shell: true,
        encoding: 'utf8',
        timeout: 10000,
      });
      if (r.status === 0 || r.stderr.includes('not found') || r.stderr.includes('找不到')) {
        console.log(`  Port ${port}: killed PID ${pid}`);
      } else {
        console.log(`  Port ${port}: PID ${pid} (${r.stderr.trim() || 'already gone'})`);
      }
    } catch (e) {
      console.log(`  Port ${port}: PID ${pid} (${e.message})`);
    }
  }
}

const ports = process.argv.slice(2).map(Number).filter(Boolean);
if (ports.length === 0) {
  console.log('Usage: node kill-by-port.js <port1> [port2] ...');
  process.exit(1);
}

console.log(`Cleaning ports: ${ports.join(', ')}`);
for (const port of ports) killByPort(port);
console.log('Done.\n');
