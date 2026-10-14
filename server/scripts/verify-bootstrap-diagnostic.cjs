/**
 * Regression for the Windows MODULE_NOT_FOUND failure in app.module.js.
 * Temporarily move only a regenerated dist artifact, never source or user data.
 * main.js must diagnose the missing file before requiring AppModule / opening DB.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const serverRoot = path.resolve(__dirname, '..');
const missing = path.join(serverRoot, 'dist', 'src', 'common', 'creation-context.middleware.js');
const parked = missing + '.startup-probe';
if (!fs.existsSync(missing)) throw new Error('Cannot run startup probe without compiled middleware');
if (fs.existsSync(parked)) throw new Error('Previous probe backup exists; refusing to overwrite it');
fs.renameSync(missing, parked);
try {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', path.join(serverRoot, 'dist', 'src', 'main.js')],
    { cwd: serverRoot, encoding: 'utf8', timeout: 12_000, windowsHide: true },
  );
  const logs = String(result.stdout || '') + String(result.stderr || '');
  if (result.error) throw result.error;
  if (result.status !== 1
      || !logs.includes('后端拒绝启动：编译产物缺失或早于对应源码')
      || !logs.includes('creation-context.middleware.js')) {
    throw new Error('Missing middleware must cause a precise preboot diagnostic. status='
      + result.status + ', output=' + logs.slice(0, 3000));
  }
  console.log('[build] 缺失中间件的预启动诊断已验证');
} finally {
  fs.renameSync(parked, missing);
}
