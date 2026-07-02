const { spawn } = require('child_process');
const server = spawn('node', ['dist/src/main.js'], { cwd: __dirname, stdio: 'inherit' });
server.on('close', code => process.exit(code));
