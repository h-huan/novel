#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(root, 'verification', 'latest.json');
const previousReport = fs.existsSync(reportPath) ? fs.statSync(reportPath) : null;

const core = spawnSync(
  process.execPath,
  [path.join(root, 'verify-local-core.mjs'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: process.env },
);

const reportUpdated = fs.existsSync(reportPath) && (!previousReport || (() => {
  const current = fs.statSync(reportPath);
  return current.mtimeMs > previousReport.mtimeMs || current.size !== previousReport.size;
})());
let guardStatus = 0;
if (reportUpdated) {
  const guard = spawnSync(
    process.execPath,
    [path.join(root, 'verify-local-guard.mjs'), reportPath],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  guardStatus = typeof guard.status === 'number' ? guard.status : 1;
}

const coreStatus = typeof core.status === 'number' ? core.status : 1;
if (!reportUpdated) console.error('[verify] 本次未生成新的 verification/latest.json；旧报告不能代表本次测试，请检查核心诊断进程的错误输出。');
process.exitCode = coreStatus !== 0 ? coreStatus : (reportUpdated ? guardStatus : 1);
