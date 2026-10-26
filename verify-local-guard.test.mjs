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

// The existing restart.ps1 is itself a backend launcher. Both its normal
// build path and -Watch path must stamp the revision before Start-Process,
// otherwise desktop/scripts/dev.js rejects this project's own healthy server.
{
  const restart = fs.readFileSync(path.join(root, 'restart.ps1'), 'utf8');
  const backendBranch = restart.indexOf("if ($Only -in @('all', 'back')) {");
  const gitHead = restart.indexOf('git -C $ProjectRoot rev-parse --verify HEAD');
  const stamp = restart.indexOf('$env:NOVEL_BUILD_COMMIT = $localBuildCommit');
  const watchStart = restart.indexOf('$backend = Start-Process', stamp);
  const normalStart = restart.indexOf('$backend = Start-Process', watchStart + 1);
  assert.ok(backendBranch >= 0 && gitHead > backendBranch && stamp > gitHead,
    'backend version must be captured inside backend startup');
  assert.ok(watchStart > stamp && normalStart > watchStart,
    'both backend launch paths must inherit the version stamp');
  assert.match(restart, /\$gitStatus -ne 0 -or \$localBuildCommit -notmatch/u);
  assert.ok(restart.includes("$localBuildCommit -notmatch '^[0-9a-fA-F]{40}$') {"),
    'PowerShell version validation must remain syntactically complete');
  assert.match(restart, /throw '无法确认当前 Git HEAD/u);
  // PowerShell must not announce readiness or launch the frontend merely
  // because an older process responds HTTP 200.
  assert.match(restart, /\$reportedBuildCommit -ceq \$localBuildCommit/u);
  assert.match(restart, /\$healthData\.status -eq 'ok'/u);
  assert.match(restart, /throw "后端未按本次提交就绪/u);
  assert.doesNotMatch(restart, /if \(\$healthy\).*Write-Note '后端健康检查超时/u);
  assert.equal((restart.match(/^\s*\$backend = Start-Process/gmu) || []).length, 2,
    'normal and -Watch must be the only backend launcher branches');
  // Use the actual PowerShell parser whenever it is installed (including
  // Windows development and supported CI runners); no code is executed.
  const psPath = path.join(root, 'restart.ps1').replace(/'/g, "''");
  const psCommand = "$tok=$null;$err=$null;[System.Management.Automation.Language.Parser]::ParseFile('"
    + psPath + "',[ref]$tok,[ref]$err)|Out-Null;if($err.Count){$err|ForEach-Object{Write-Error $_};exit 1}";
  const parser = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', psCommand],
    { encoding: 'utf8' });
  if (!parser.error) assert.equal(parser.status, 0, 'restart.ps1 PowerShell parser errors: ' + parser.stderr);
}

// Direct server launchers are also first-class paths. A port occupied by a
// healthy unverified backend must not cause a new start to silently succeed.
// The reported commit is captured only after build-freshness validation.
{
  const main = fs.readFileSync(path.join(root, 'server', 'src', 'main.ts'), 'utf8');
  const health = fs.readFileSync(path.join(root, 'server', 'src', 'health', 'health.controller.ts'), 'utf8');
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8')).scripts;
  assert.match(scripts['start:dev'], /nest.*start --watch/u);
  assert.match(scripts['start:prod'], /dist\/src\/main\.js/u);
  assert.ok(main.indexOf('assertBuildIsFresh();') < main.indexOf('stampLocalCheckoutRevision();'),
    'do not advertise a checkout commit before confirming compiled output freshness');
  assert.match(main, /function stampLocalCheckoutRevision\(\): void/u);
  assert.match(main, /path\.basename\(serverRoot\) !== 'server'/u);
  assert.match(main, /path\.join\(checkoutRoot, '\.git'\)/u);
  assert.match(main, /process\.env\.NOVEL_BUILD_COMMIT = commit/u);
  assert.doesNotMatch(main, /duplicate start skipped|existingNovelServer/u);
  assert.match(main, /probeExistingNovelServer\(cliPort\)\.then/u);
  assert.match(main, /return bootstrap\(\);/u);
  assert.match(main, /当前进程未启动，也没有复用旧进程/u);
  assert.ok(main.indexOf('probeExistingNovelServer(cliPort).then') < main.indexOf('return bootstrap();'),
    'check occupied healthy ports before Nest initializes SQLite providers');
  assert.match(health, /this\.buildCommit = process\.env\.NOVEL_BUILD_COMMIT/u);
  assert.match(health, /commit: this\.buildCommit/u);
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

// Reproduce the latest report's ordering: an old backend can have a genuine
// historical failed idea audit, but the FIRST reason this is not a valid new
// production run is the loaded revision. Never mark preflight healthy.
{
  const { result, next, nextMarkdown } = run({
    options: { mode: 'diagnostic_latest_short_and_long', fullTests: false, shortProjectId: 'short-1' },
    runtime: {
      preflight: { ok: true, rootCause: null, downstreamSkipped: [] },
      backendIdentity: { loadedLocalRevision: 'mismatch', localCommit: '7c2f193', buildCommit: '5c635819', diagnosticsMarkerStatus: 'present' },
      ideaDiscovery: { available: true, success: false },
      projects: { short: { project: { status: 'active' }, cockpit: { diagnostics: {} } } },
    },
    verdict: {
      status: 'failed', rootCause: 'latest_idea_discovery_failed',
      failedTests: [], runtimeProblems: ['latest_idea_discovery_failed'],
    },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.rootCause, 'backend_loaded_revision_mismatch');
  assert.equal(next.runtime.preflight.ok, false);
  assert.equal(next.runtime.preflight.rootCause, 'backend_loaded_revision_mismatch');
  assert.equal(next.runtime.preflight.evidenceScope, 'historical_only');
  assert.ok(next.verdict.runtimeProblems.includes('latest_idea_discovery_failed'));
  assert.ok(next.verdict.runtimeProblems.includes('backend_loaded_revision_mismatch'));
  assert.match(nextMarkdown, /backend_loaded_revision_mismatch/u);
}

// Restarting to the correct HEAD must not relabel the persisted older
// discovery failure as a newly executed check. The historical error stays
// inspectable, but current-version production verification is still missing.
{
  const { result, next } = run({
    options: { mode: 'diagnostic_latest_short_and_long', fullTests: false, shortProjectId: 'short-1' },
    runtime: {
      backendIdentity: { loadedLocalRevision: 'match', processStartedAt: '2026-10-26T05:55:00.000Z', diagnosticsMarkerStatus: 'present' },
      ideaDiscovery: { available: true, audit: { finishedAt: '2026-10-26T03:52:25.755Z', success: false } },
      projects: { short: { project: { status: 'active' }, cockpit: { diagnostics: {} } } },
    },
    verdict: { status: 'failed', rootCause: 'latest_idea_discovery_failed',
      failedTests: [], runtimeProblems: ['latest_idea_discovery_failed'] },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.rootCause, 'latest_idea_audit_predates_backend_start');
  assert.ok(next.verdict.runtimeProblems.includes('latest_idea_discovery_failed'));
  assert.ok(next.verdict.runtimeProblems.includes('latest_idea_audit_predates_backend_start'));
  assert.equal(next.runtime.currentRevisionEvidence.ideaDiscovery, 'historical_only');
}

// A legacy first-chapter run must remain visible without masquerading as a
// fresh successful generation on the new backend after restart.
{
  const { result, next } = run({
    options: { mode: 'single_project', fullTests: false, projectId: 'short-1' },
    runtime: {
      backendIdentity: { loadedLocalRevision: 'match', processStartedAt: '2026-10-26T05:55:00.000Z', diagnosticsMarkerStatus: 'present' },
      project: { id: 'short-1', status: 'active' },
      firstChapterRun: { status: 'failed', finished_at: '2026-10-26T02:22:48.928Z' },
      cockpit: { diagnostics: {} },
    },
    verdict: { status: 'failed', rootCause: 'project_first_chapter_empty',
      failedTests: [], runtimeProblems: ['project_first_chapter_empty'] },
  });
  assert.equal(result.status, 1);
  assert.equal(next.verdict.rootCause, 'project_first_chapter_run_predates_backend_start');
  assert.equal(next.runtime.currentRevisionEvidence.projects.project.firstChapter, 'historical_only');
  assert.ok(next.verdict.runtimeProblems.includes('project_first_chapter_empty'));
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
