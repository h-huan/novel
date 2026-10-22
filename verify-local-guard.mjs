#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = process.argv[2] || path.join(root, 'verification', 'latest.json');
const markdownPath = path.join(path.dirname(reportPath), 'latest.md');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const mode = String(report?.options?.mode || '');
const fullTests = report?.options?.fullTests === true;
const problems = new Set(Array.isArray(report?.verdict?.runtimeProblems) ? report.verdict.runtimeProblems : []);
const terminalPersistenceMismatches = [];

if (fullTests && mode !== 'single_project') {
  if (!report?.options?.shortProjectId) problems.add('short_project_missing');
  if (!report?.options?.longProjectId) problems.add('long_project_missing');
}

const problemToken = (value) => String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';

const hasProjectMap = report?.runtime?.projects && typeof report.runtime.projects === 'object'
  && Object.keys(report.runtime.projects).length > 0;
const projectEntries = hasProjectMap
  ? Object.entries(report.runtime.projects)
  : report?.runtime?.project ? [['project', { project: report.runtime.project, cockpit: report.runtime.cockpit }]] : [];

for (const [key, result] of projectEntries) {
  const status = String(result?.project?.status || '').toLowerCase();
  const diagnostics = result?.cockpit?.diagnostics || {};
  const persistenceMismatch = Array.isArray(diagnostics.persistenceMismatch)
    ? diagnostics.persistenceMismatch.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  if (status === 'creating' && diagnostics.creationStalled === true) problems.add(`${key}_creation_stalled`);

  // creation 中间态可能短暂出现未持久化，不在这里误判；一旦项目已经退出 creating，
  // “LLM/outline 成功但数据库没有对应产物”就是终态数据不一致，latest.md 不能再显示 PASS。
  if (status !== 'creating' && persistenceMismatch.length > 0) {
    terminalPersistenceMismatches.push(persistenceMismatch.join(','));
    for (const mismatch of persistenceMismatch) {
      problems.add(`${key}_persistence_mismatch_${problemToken(mismatch)}`);
    }
  }

  if (status === 'generation_failed') problems.add(`${key}_project_status_generation_failed`);
}

const runtimeProblems = [...problems];
const failedTests = Array.isArray(report?.verdict?.failedTests) ? report.verdict.failedTests : [];
report.verdict = {
  ...(report.verdict || {}),
  status: runtimeProblems.length === 0 && failedTests.length === 0 ? 'passed' : 'failed',
  rootCause: runtimeProblems[0] || report?.verdict?.rootCause || null,
  failedTests,
  runtimeProblems,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

if (fs.existsSync(markdownPath)) {
  let markdown = fs.readFileSync(markdownPath, 'utf8');
  markdown = markdown.replace(/- 最终结果：\*\*(?:PASSED|FAILED)\*\*/u, `- 最终结果：**${report.verdict.status.toUpperCase()}**`);
  for (const mismatch of terminalPersistenceMismatches) {
    markdown = markdown.replace(`创建/持久化诊断：PASS · mismatch=${mismatch}`, `创建/持久化诊断：FAIL · mismatch=${mismatch}`);
  }
  const guardSection = `\n## Verification Guard\n\n${runtimeProblems.length ? runtimeProblems.map((item) => `- ${item}`).join('\n') : '- PASS'}\n`;
  markdown = markdown.replace(/\n## Verification Guard\n[\s\S]*$/u, '');
  fs.writeFileSync(markdownPath, markdown.trimEnd() + '\n' + guardSection, 'utf8');
}

if (report.verdict.status !== 'passed') {
  console.error(`[verify-guard] FAILED: ${runtimeProblems.join(', ') || failedTests.join(', ') || 'verification failed'}`);
  process.exitCode = 1;
} else {
  console.log('[verify-guard] PASSED');
}
