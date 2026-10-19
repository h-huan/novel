import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-verify-guard-'));
  const file = path.join(dir, 'latest.json');
  const markdown = path.join(dir, 'latest.md');
  const sectionKey = report?.options?.mode === 'single_project' ? 'project' : 'short';
  const sectionLabel = sectionKey === 'project' ? '项目' : '短篇';
  const mismatch = report?.runtime?.projects?.[sectionKey]?.cockpit?.diagnostics?.persistenceMismatch;
  const mismatchText = Array.isArray(mismatch) && mismatch.length ? mismatch.join(',') : 'none';
  fs.writeFileSync(file, JSON.stringify(report), 'utf8');
  fs.writeFileSync(markdown, `# 本地验收报告\n\n- 最终结果：**PASSED**\n\n### ${sectionLabel}\n\n- 创建/持久化诊断：PASS · mismatch=${mismatchText}\n\n## 说明\n\n- 不带 --full 是故障诊断：自动选择最近项目（包括 creating / generation_failed），不要求短篇和长篇同时存在；正常创建中的项目显示 IN_PROGRESS，只有无运行调用且超过诊断阈值无活动才标记 creation_stalled。\n`, 'utf8');
  const result = spawnSync(process.execPath, [path.resolve('verify-local-guard.mjs'), file], { encoding: 'utf8' });
  const next = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nextMarkdown = fs.readFileSync(markdown, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, next, nextMarkdown };
}

{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'diagnostic_latest_short_and_long', shortProjectId: 'short-1', longProjectId: null },
    runtime: { projects: { short: { project: { status: 'creating' }, cockpit: { diagnostics: { creationStalled: false } } } } },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.status, 'failed');
  assert.deepEqual(next.verdict.runtimeProblems, ['long_project_missing']);
  assert.match(nextMarkdown, /最终结果：\*\*FAILED\*\*/u);
  assert.match(nextMarkdown, /long_project_missing/u);
  assert.doesNotMatch(nextMarkdown, /不要求短篇和长篇同时存在/u);
}

{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'diagnostic_latest_short_and_long', shortProjectId: 'short-1', longProjectId: 'long-1' },
    runtime: { projects: { short: { project: { status: 'active' }, cockpit: { diagnostics: {} } }, long: { project: { status: 'active' }, cockpit: { diagnostics: {} } } } },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 0);
  assert.equal(next.verdict.status, 'passed');
  assert.deepEqual(next.verdict.runtimeProblems, []);
  assert.match(nextMarkdown, /Verification Guard\n\n- PASS/u);
}

{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'diagnostic_latest_short_and_long', shortProjectId: 'short-1', longProjectId: 'long-1' },
    runtime: {
      projects: {
        short: {
          project: { status: 'generation_failed' },
          cockpit: { diagnostics: { creationStalled: false, persistenceMismatch: ['outline_success_without_chapter_outline'] } },
        },
        long: { project: { status: 'active' }, cockpit: { diagnostics: {} } },
      },
    },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.status, 'failed');
  assert.ok(next.verdict.runtimeProblems.includes('short_persistence_mismatch_outline_success_without_chapter_outline'));
  assert.ok(next.verdict.runtimeProblems.includes('short_project_status_generation_failed'));
  assert.match(nextMarkdown, /创建\/持久化诊断：FAIL · mismatch=outline_success_without_chapter_outline/u);
  assert.doesNotMatch(nextMarkdown, /创建\/持久化诊断：PASS · mismatch=outline_success_without_chapter_outline/u);
}


{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'single_project', projectId: 'failed-1' },
    runtime: { projects: { project: {
      project: { id: 'failed-1', status: 'generation_failed' },
      cockpit: { diagnostics: { persistenceMismatch: ['outline_success_without_chapter_outline'] } },
    } } },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.ok(next.verdict.runtimeProblems.includes('project_project_status_generation_failed'));
  assert.ok(next.verdict.runtimeProblems.includes('project_persistence_mismatch_outline_success_without_chapter_outline'));
  assert.match(nextMarkdown, /### 项目\n\n- 创建\/持久化诊断：FAIL · mismatch=outline_success_without_chapter_outline/u);
}
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'single_project', projectId: 'creating-1' },
    runtime: { projects: { project: {
      project: { id: 'creating-1', status: 'creating' },
      cockpit: { diagnostics: { creationStalled: false, persistenceMismatch: [],
        pendingPersistenceMismatch: ['outline_success_without_chapter_outline'] } },
    } } },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.deepEqual(next.verdict.runtimeProblems, []);
  assert.equal(next.verdict.status, 'in_progress');
  assert.match(nextMarkdown, /最终结果：\*\*IN_PROGRESS\*\*/u);
  assert.match(nextMarkdown, /创建\/持久化诊断：IN_PROGRESS · pending=outline_success_without_chapter_outline/u);
}
{
  const { result, next } = run({
    options: { mode: 'single_project', projectId: 'stalled-1' },
    runtime: { projects: { project: {
      project: { status: 'creating' },
      cockpit: { diagnostics: { creationStalled: true,
        persistenceMismatch: ['outline_success_without_chapter_outline'] } },
    } } },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.ok(next.verdict.runtimeProblems.includes('project_creation_stalled'));
  assert.ok(next.verdict.runtimeProblems.includes('project_persistence_mismatch_outline_success_without_chapter_outline'));
}

console.log('verify-local-guard tests passed');
