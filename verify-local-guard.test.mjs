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

// Startup is deliberately non-cascading. Each launcher must have a single
// owner; status polling and IPC must never create or kill a backend.
{
  const scripts = JSON.parse(fs.readFileSync(path.join(root,'desktop','package.json'),'utf8')).scripts;
  const vite = fs.readFileSync(path.join(root,'desktop','vite.config.mts'),'utf8');
  const main = fs.readFileSync(path.join(root,'desktop','src','main','main.ts'),'utf8');
  assert.equal(fs.existsSync(path.join(root,'restart.ps1')),false);
  assert.equal(fs.existsSync(path.join(root,'desktop','scripts','dev.js')),false);
  assert.equal(scripts.dev,'vite --host 0.0.0.0');
  // The normal desktop dev command MUST display Electron, not just Vite's browser page.
  // Vite may launch/rebuild the Electron UI; it must never start a NestJS backend.
  assert.match(vite,/onstart: \(\) => startElectronApp\(\)/u);
  assert.match(vite,/function startElectronApp\(\): void/u);
  assert.match(vite,/spawn\(electronExecutable, \['\.', '--no-sandbox'\]/u);
  assert.match(vite,/windowsHide: false/u, 'GUI subprocess must not request hidden windows');
  assert.doesNotMatch(vite,/restart\.ps1|scripts\/dev\.js|server\/dist\/src\/main\.js|npm run start:dev/u);
  assert.doesNotMatch(scripts.dev,/scripts\/dev\.js|restart\.ps1/u);
  assert.match(main,/async function checkServerConnection/u);
  assert.doesNotMatch(main,/startManagedServer|managedServerProcess|NOVEL_MANAGED_SERVER|spawn\(/u);
  assert.match(main,/ipcMain\.handle\('start-server'/u);
  assert.match(main,/ipcMain\.handle\('stop-server'/u);
  assert.match(main,/await checkServerConnection\(SERVER_PORT\)/u);
  assert.doesNotMatch(main,/ensureServerRunning/u);
  const guide = fs.readFileSync(path.join(root,'server','docs','user-guide.md'),'utf8');
  const governance = fs.readFileSync(path.join(root,'DEVELOPMENT_GOVERNANCE.md'),'utf8');
  assert.ok(!guide.includes('restart.ps1') && !guide.includes('scripts/dev.js'));
  assert.ok(guide.includes('npm run dev'));
  assert.ok(guide.includes('Electron 窗口'));
  assert.ok(guide.includes('server/shared/src/执行标准.ts'));
  assert.ok(governance.includes('server/shared/src/执行标准.ts'));
  assert.ok(main.includes('new BrowserWindow('));
  assert.ok(main.includes("launcherWindow.loadURL(VITE_DEV_SERVER_URL + 'launcher.html')"));
  assert.ok(main.includes('createWindow();'));
  assert.ok(!vite.includes('onstart: () => {}'));
  assert.ok(main.includes('revealLoadedWindow(launcherWindow);'), 'launcher uses shared foreground restoration');
  assert.ok(main.includes('revealLoadedWindow(mainWindow);'), 'editor uses shared foreground restoration');
  assert.ok(main.includes("window.once('ready-to-show', reveal)"), 'foreground when Chromium signals readiness');
  assert.ok(main.includes("window.webContents.once('did-finish-load', reveal)"), 'foreground after document load when ready-to-show is absent');
  assert.ok(main.includes("window.webContents.once('dom-ready', reveal)"), 'foreground when the renderer DOM becomes ready');
  assert.ok(main.includes("const fallback = setTimeout(reveal, 1500)"), 'foreground when hidden Chromium emits no readiness event');
  assert.ok(main.includes('window.show();') && main.includes('window.focus();'), 'normal launch must show and focus both windows');
  assert.ok(main.includes('mainWindow.isMinimized()'), 'do not persist minimized placement');
  assert.ok(main.includes('screen.getAllDisplays()'), 'screen-bound check for previously saved window placement');
  assert.ok(main.includes("tray.on('double-click', restoreApplicationWindow)"),
    'tray restore must unminimize instead of leaving the window on the taskbar');
  const planning = fs.readFileSync(path.join(root,'server','src','chain','chain-planning.controller.ts'),'utf8');
  const wizard = fs.readFileSync(path.join(root,'desktop','src','renderer','pages','DiscoveryWizardPage.tsx'),'utf8');
  assert.ok(planning.includes('dto.discoveryRequestId.trim()'),
    'planning route must propagate renderer cancellation IDs');
  assert.ok(wizard.includes("err.message.startsWith('请求超时')"));
  assert.ok(wizard.includes("'/chain/cancel-idea-discovery/' + encodeURIComponent(discoveryRequestId)"),
    'HTTP timeout must cancel the exact server request instead of orphaning model work');
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
