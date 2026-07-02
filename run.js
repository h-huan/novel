const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const PORT_FILE = path.join(__dirname, 'server', '.port');

// Kill old
try { execSync('node kill-by-port.js 3100 3101', { cwd: __dirname, stdio: 'pipe' }); } catch {}
try { fs.unlinkSync(PORT_FILE); } catch {}

// Start backend
const backend = spawn('node', ['dist/src/main.js'], {
  cwd: path.join(__dirname, 'server'),
  stdio: ['ignore', process.stdout, process.stderr],
});

console.log('Backend starting on port 3100...');
