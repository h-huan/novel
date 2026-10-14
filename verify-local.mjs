#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(root, 'verification', 'latest.json');
const previousReportTime = fs.existsSync(reportPath) ? fs.statSync(reportPath).mtimeMs : -1;

const core = spawnSync(
  process.execPath,
  [path.join(root, 'verify-local-core.mjs'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: process.env },
);

let guardStatus = 0;
// A crashed core must never re-run the guard or archive a prior latest.json.
const hasFreshReport = fs.existsSync(reportPath) && fs.statSync(reportPath).mtimeMs > previousReportTime;
if (hasFreshReport) {
  const guard = spawnSync(
    process.execPath,
    [path.join(root, 'verify-local-guard.mjs'), reportPath],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  guardStatus = typeof guard.status === 'number' ? guard.status : 1;
}

// Keep the default latest-only workflow; opt in to per-run evidence when
// diagnosing intermittent real-model failures across several manual runs.
if (process.argv.includes('--archive') && hasFreshReport) {
  try {
    const snapshot = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const stamp = String(snapshot.generatedAt || new Date().toISOString()).replace(/[^0-9A-Za-z_-]/g, '-');
    const runDir = path.join(root, 'verification', 'runs');
    fs.mkdirSync(runDir, { recursive: true });
    const prefix = stamp + '-' + process.pid;
    fs.copyFileSync(reportPath, path.join(runDir, prefix + '.json'));
    const md = path.join(root, 'verification', 'latest.md');
    if (fs.existsSync(md)) fs.copyFileSync(md, path.join(runDir, prefix + '.md'));
    console.log('[verify] archived: verification/runs/' + prefix);
  } catch (error) {
    console.error('[verify] archive failed: ' + (error instanceof Error ? error.message : String(error)));
    guardStatus = 1;
  }
}

const coreStatus = typeof core.status === 'number' ? core.status : 1;
if (!hasFreshReport) {
  console.error('[verify] core did not write a fresh report; previous latest files are preserved but are stale.');
  guardStatus = 1;
}
process.exitCode = coreStatus !== 0 ? coreStatus : guardStatus;
