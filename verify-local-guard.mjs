#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = process.argv[2] || path.join(root, 'verification', 'latest.json');
const markdownPath = path.join(path.dirname(reportPath), 'latest.md');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const mode = String(report?.options?.mode || '');
const problems = new Set(Array.isArray(report?.verdict?.runtimeProblems) ? report.verdict.runtimeProblems : []);

if (mode.includes('short_and_long')) {
  if (!report?.options?.shortProjectId) problems.add('short_project_missing');
  if (!report?.options?.longProjectId) problems.add('long_project_missing');
}

for (const key of ['short', 'long']) {
  const result = report?.runtime?.projects?.[key];
  const status = String(result?.project?.status || '').toLowerCase();
  const diagnostics = result?.cockpit?.diagnostics || {};
  if (status === 'creating' && diagnostics.creationStalled === true) problems.add(`${key}_creation_stalled`);
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
  markdown = markdown.replace(
    /- 不带 --full 是故障诊断：自动选择最近项目（包括 creating \/ generation_failed），不要求短篇和长篇同时存在；正常创建中的项目显示 IN_PROGRESS，只有无运行调用且超过诊断阈值无活动才标记 creation_stalled。/u,
    '- 不带 --full 是故障诊断：自动选择最近项目（包括 creating / generation_failed）；当模式声明 short_and_long 时必须同时找到短篇和长篇，否则验收失败；正常创建中的项目显示 IN_PROGRESS，只有无运行调用且超过诊断阈值无活动才标记 creation_stalled。',
  );
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
