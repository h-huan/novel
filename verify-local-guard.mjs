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
const terminalPersistenceMismatches = [];

// Only explicit pair/full acceptance requires both project types. Auto quick
// diagnostic of the latest existing project must not invent a missing-book bug.
if (report?.options?.fullTests === true || mode === 'explicit_short_and_long') {
  if (!report?.options?.shortProjectId) problems.add('short_project_missing');
  if (!report?.options?.longProjectId) problems.add('long_project_missing');
}

const problemToken = (value) => String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';

const projectKeys = Object.keys(report?.runtime?.projects || {}).filter(key => ['project', 'short', 'long'].includes(key));
const persistenceRows = [];
for (const key of projectKeys) {
  const result = report.runtime.projects[key];
  const status = String(result?.project?.status || '').toLowerCase();
  const diagnostics = result?.cockpit?.diagnostics || {};
  const persistenceMismatch = Array.isArray(diagnostics.persistenceMismatch)
    ? diagnostics.persistenceMismatch.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const pendingMismatch = Array.isArray(diagnostics.pendingPersistenceMismatch)
    ? diagnostics.pendingPersistenceMismatch.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  if (status === 'creating' && diagnostics.creationStalled === true) problems.add(`${key}_creation_stalled`);

  // creation 中间态可能短暂出现未持久化，不在这里误判；一旦项目已经退出 creating，
  // “LLM/outline 成功但数据库没有对应产物”就是终态数据不一致，latest.md 不能再显示 PASS。
  if ((status !== 'creating' || diagnostics.creationStalled === true) && persistenceMismatch.length > 0) {
    terminalPersistenceMismatches.push({key, mismatches: persistenceMismatch});
    for (const mismatch of persistenceMismatch) {
      problems.add(`${key}_persistence_mismatch_${problemToken(mismatch)}`);
    }
  }
  persistenceRows.push({key, status, creationStalled: diagnostics.creationStalled === true,
    terminal: persistenceMismatch, pending: pendingMismatch});

  if (status === 'generation_failed') problems.add(`${key}_project_status_generation_failed`);
}

const runtimeProblems = [...problems];
const failedTests = Array.isArray(report?.verdict?.failedTests) ? report.verdict.failedTests : [];
report.verdict = {
  ...(report.verdict || {}),
  status: runtimeProblems.length || failedTests.length ? 'failed'
    : persistenceRows.some(row => row.status === 'creating' && !row.creationStalled) ? 'in_progress' : 'passed',
  rootCause: runtimeProblems[0] || report?.verdict?.rootCause || null,
  failedTests,
  runtimeProblems,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

if (fs.existsSync(markdownPath)) {
  let markdown = fs.readFileSync(markdownPath, 'utf8');
  markdown = markdown.replace(/- 最终结果：\*\*(?:PASSED|FAILED|IN_PROGRESS)\*\*/u, `- 最终结果：**${report.verdict.status.toUpperCase()}**`);

  // Rewrite only the matching project's section. Never change a different project's
  // PASS line just because it has the same mismatch text.
  const sectionTitle = {project:'项目',short:'短篇',long:'长篇'};
  for (const row of persistenceRows) {
    const heading = `### ${sectionTitle[row.key]}\n`;
    const start = markdown.indexOf(heading);
    if (start < 0) continue;
    const bodyStart = start + heading.length;
    const nextHeadings = [markdown.indexOf('\n### ', bodyStart), markdown.indexOf('\n## ', bodyStart)].filter(n => n >= 0);
    const end = nextHeadings.length ? Math.min(...nextHeadings) : markdown.length;
    const body = markdown.slice(bodyStart, end);
    let statusLine = row.creationStalled ? `FAIL · stalled · mismatch=${row.terminal.join(',') || 'none'}`
      : row.status !== 'creating' && row.terminal.length ? `FAIL · mismatch=${row.terminal.join(',')}`
      : row.status === 'creating' && row.pending.length ? `IN_PROGRESS · pending=${row.pending.join(',')}`
      : row.status === 'creating' ? 'IN_PROGRESS · creating' : null;
    if (!statusLine) continue;
    const nextBody = body.replace(/- 创建\/持久化诊断：[^\r\n]*/u,
      `- 创建/持久化诊断：${statusLine}`);
    markdown = markdown.slice(0, bodyStart) + nextBody + markdown.slice(end);
  }
  const guardSection = `\n## Verification Guard\n\n${runtimeProblems.length ? runtimeProblems.map((item) => `- ${item}`).join('\n') : '- PASS'}\n`;
  markdown = markdown.replace(/\n## Verification Guard\n[\s\S]*$/u, '');
  fs.writeFileSync(markdownPath, markdown.trimEnd() + '\n' + guardSection, 'utf8');
}

if (report.verdict.status !== 'passed') {
  console.error(`[verify-guard] ${report.verdict.status.toUpperCase()}: ${runtimeProblems.join(', ') || failedTests.join(', ') || 'creation not yet completed'}`);
  process.exitCode = 1;
} else {
  console.log('[verify-guard] PASSED');
}
