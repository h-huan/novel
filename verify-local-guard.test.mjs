import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

function run(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-verify-guard-'));
  const file = path.join(dir, 'latest.json');
  const markdown = path.join(dir, 'latest.md');
  const mismatch = report?.runtime?.projects?.short?.cockpit?.diagnostics?.persistenceMismatch
    ?? report?.runtime?.projects?.project?.cockpit?.diagnostics?.persistenceMismatch
    ?? report?.runtime?.cockpit?.diagnostics?.persistenceMismatch;
  const mismatchText = Array.isArray(mismatch) && mismatch.length ? mismatch.join(',') : 'none';
  const markdownText = '# 本地验收报告\n\n- 最终结果：**PASSED**\n\n### 短篇\n\n- 创建/持久化诊断：PASS · mismatch='
    + mismatchText
    + '\n\n## 说明\n\n- 不带 --full 是故障诊断：自动选择最近项目（包括 creating / generation_failed），不要求短篇和长篇同时存在；正常创建中的项目显示 IN_PROGRESS，只有无运行调用且超过诊断阈值无活动才标记 creation_stalled。\n';
  fs.writeFileSync(file, JSON.stringify(report), 'utf8');
  fs.writeFileSync(markdown, markdownText, 'utf8');
  const result = spawnSync(process.execPath, [path.join(root, 'verify-local-guard.mjs'), file], { encoding: 'utf8' });
  const next = JSON.parse(fs.readFileSync(file, 'utf8'));
  const nextMarkdown = fs.readFileSync(markdown, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, next, nextMarkdown };
}

// The development launcher must not reuse a healthy but stale backend.
// A health response with commit=null is NOT evidence of the loaded source.
{
  const launcher = fs.readFileSync(path.join(root, 'desktop', 'scripts', 'dev.js'), 'utf8');
  assert.match(launcher, /health\?\.build\?\.commit === localBuildCommit/u);
  assert.match(launcher, /existing\.build\?\.commit === localBuildCommit/u);
  assert.match(launcher, /端口3100已存在旧版或未标记版本的后端/u);
  assert.doesNotMatch(launcher, /if \(await backendHealthy\(\)\) \{\s*console\.log\('\[dev\] reuse healthy backend/u);
}

const verifiedIdentity = { loadedLocalRevision: 'match', diagnosticsMarkerStatus: 'present' };

// Quick diagnostics must allow one project and preserve the documented behavior.
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'diagnostic_latest_short_and_long', fullTests: false, shortProjectId: 'short-1', longProjectId: null },
    runtime: { projects: { short: { project: { status: 'creating' }, cockpit: { diagnostics: { creationStalled: false } } } } },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 0);
  assert.equal(next.verdict.status, 'passed');
  assert.deepEqual(next.verdict.runtimeProblems, []);
  assert.match(nextMarkdown, /不要求短篇和长篇同时存在/u);
  assert.doesNotMatch(nextMarkdown, /long_project_missing/u);
}

// Full dual-project acceptance must still reject a missing short/long project.
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'auto_latest_active_short_and_long', fullTests: true, shortProjectId: 'short-1', longProjectId: null },
    runtime: {
      backendIdentity: verifiedIdentity,
      projects: { short: { project: { status: 'active' }, cockpit: { diagnostics: {} } } },
    },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.status, 'failed');
  assert.deepEqual(next.verdict.runtimeProblems, ['long_project_missing']);
  assert.match(nextMarkdown, /最终结果：\*\*FAILED\*\*/u);
  assert.match(nextMarkdown, /long_project_missing/u);
}

// Full dual-project acceptance passes only when both project identities exist.
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'auto_latest_active_short_and_long', fullTests: true, shortProjectId: 'short-1', longProjectId: 'long-1' },
    runtime: {
      backendIdentity: verifiedIdentity,
      projects: { short: { project: { status: 'active' }, cockpit: { diagnostics: {} } }, long: { project: { status: 'active' }, cockpit: { diagnostics: {} } } },
    },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 0);
  assert.equal(next.verdict.status, 'passed');
  assert.deepEqual(next.verdict.runtimeProblems, []);
  assert.match(nextMarkdown, /Verification Guard\n\n- PASS/u);
}

// A failed project and a terminal persistence mismatch can never be reported as PASS.
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'auto_latest_active_short_and_long', fullTests: true, shortProjectId: 'short-1', longProjectId: 'long-1' },
    runtime: {
      backendIdentity: verifiedIdentity,
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

// Single-project compatibility mode must also inspect terminal persistence mismatches.
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'single_project', fullTests: false, projectId: 'project-1' },
    runtime: {
      project: { id: 'project-1', status: 'active' },
      cockpit: { diagnostics: { persistenceMismatch: ['outline_success_without_chapter_outline'] } },
    },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.status, 'failed');
  assert.ok(next.verdict.runtimeProblems.includes('project_persistence_mismatch_outline_success_without_chapter_outline'));
  assert.match(nextMarkdown, /创建\/持久化诊断：FAIL · mismatch=outline_success_without_chapter_outline/u);
}

// A stale backend cannot pass even a quick diagnosis.
{
  const { result, next } = run({
    options: { mode: 'single_project', fullTests: false, projectId: 'project-1' },
    runtime: {
      backendIdentity: { loadedLocalRevision: 'mismatch', diagnosticsMarkerStatus: 'different' },
      project: { id: 'project-1', status: 'active' },
      cockpit: { diagnostics: {} },
    },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.ok(next.verdict.runtimeProblems.includes('backend_loaded_revision_mismatch'));
  assert.ok(next.verdict.runtimeProblems.includes('backend_diagnostics_marker_mismatch'));
}

// A full acceptance with unknown build identity must not claim the current code was tested.
{
  const { result, next } = run({
    options: { mode: 'single_project', fullTests: true, projectId: 'project-1' },
    runtime: {
      backendIdentity: { loadedLocalRevision: 'unknown', diagnosticsMarkerStatus: 'unknown' },
      project: { id: 'project-1', status: 'active' },
      cockpit: { diagnostics: {} },
    },
    verdict: { status: 'passed', failedTests: [], runtimeProblems: [] },
  });
  assert.equal(result.status, 1);
  assert.ok(next.verdict.runtimeProblems.includes('backend_loaded_revision_unknown'));
  assert.ok(next.verdict.runtimeProblems.includes('backend_diagnostics_marker_unknown'));
}

console.log('verify-local-guard tests passed');
