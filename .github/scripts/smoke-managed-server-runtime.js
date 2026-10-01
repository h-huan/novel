const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runtimeRoot = path.resolve('desktop/packaging-resources/server-runtime');
const nodeBin = path.join(runtimeRoot, process.platform === 'win32' ? 'node.exe' : 'node');
const entry = path.join(runtimeRoot, 'src', 'main.js');
if (!fs.existsSync(nodeBin)) throw new Error(`runtime node missing: ${nodeBin}`);
if (!fs.existsSync(entry)) throw new Error(`runtime entry missing: ${entry}`);
if (process.platform !== 'win32') fs.chmodSync(nodeBin, 0o755);

const dataDir = path.resolve('.tmp-managed-server-data');
fs.rmSync(dataDir, { recursive: true, force: true });
const child = spawn(nodeBin, [entry], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    PORT: '3199',
    SERVER_PORT: '3199',
    DATA_DIR: dataDir,
    NOVEL_MANAGED_SERVER: '1',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});

let output = '';
child.stdout.on('data', chunk => { output += String(chunk); });
child.stderr.on('data', chunk => { output += String(chunk); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const deadline = Date.now() + 30000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`managed server exited early: ${child.exitCode}\n${output}`);
    try {
      const res = await fetch('http://127.0.0.1:3199/api/v1/health', { signal: AbortSignal.timeout(1000) });
      const body = res.ok ? await res.json() : null;
      if (body?.status === 'ok') { healthy = true; break; }
    } catch {}
    await sleep(250);
  }
  if (!healthy) throw new Error(`managed server did not become healthy\n${output}`);
  child.send({ type: 'shutdown' });
  const exited = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    sleep(10000).then(() => false),
  ]);
  if (!exited) throw new Error(`managed server did not stop after IPC shutdown\n${output}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('managed server startup/health/shutdown smoke passed');
}

main().catch(error => {
  try { child.kill('SIGKILL'); } catch {}
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
