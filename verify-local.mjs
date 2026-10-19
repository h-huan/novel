#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(root, 'verification', 'latest.json');
const markdownPath = path.join(root, 'verification', 'latest.md');

// latest.* is intentionally replaceable. Remove the previous run's files first:
// otherwise a crash before core writes its output would run the guard against
// stale evidence and leave a misleading "latest" artifact behind.
for (const file of [reportPath, markdownPath]) {
  if (fs.existsSync(file)) fs.rmSync(file);
}
const startedAt = Date.now();
console.log('[verify] 诊断开始；默认只读取本地服务，不调用模型；--full 才运行仓库测试与正文范围检查。');

const core = spawnSync(
  process.execPath,
  [path.join(root, 'verify-local-core.mjs'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: process.env },
);

let guardStatus = 0;
if (fs.existsSync(reportPath)) {
  const guard = spawnSync(
    process.execPath,
    [path.join(root, 'verify-local-guard.mjs'), reportPath],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  guardStatus = typeof guard.status === 'number' ? guard.status : 1;
}

const coreStatus = typeof core.status === 'number' ? core.status : 1;
if (!fs.existsSync(reportPath) || !fs.existsSync(markdownPath)) {
  console.error('[verify] 本轮报告缺失：核心诊断发生异常，不能将之前的 latest 作为当前验收结果。');
  process.exitCode = 1;
} else {
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const createdAt = Date.parse(String(report.generatedAt || ''));
    if (!Number.isFinite(createdAt) || createdAt < startedAt - 2000) {
      throw new Error('报告缺少有效的本轮生成时间');
    }
    console.log(`[verify] ${report.verdict?.status?.toUpperCase() || 'UNKNOWN'} · scope=${report.options?.creationDataOnly ? 'creation_data_only' : 'full'} · elapsed=${Date.now() - startedAt}ms`);
    console.log(`[verify] report: ${reportPath}`);
    console.log(`[verify] markdown: ${markdownPath}`);
    process.exitCode = coreStatus !== 0 ? coreStatus : guardStatus;
  } catch (error) {
    console.error('[verify] 报告校验失败：' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
