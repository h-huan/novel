#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const legacyProjectId = valueOf('--project') || process.env.VERIFY_PROJECT_ID || null;
const shortProjectId = valueOf('--short-project') || process.env.VERIFY_SHORT_PROJECT_ID || null;
const longProjectId = valueOf('--long-project') || process.env.VERIFY_LONG_PROJECT_ID || null;
const baseUrl = (valueOf('--base') || process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100/api/v1').replace(/\/$/, '');
const runFull = has('--full');
const runE2E = has('--e2e');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const outDir = path.join(root, 'verification');
fs.mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();
const dualMode = Boolean(shortProjectId || longProjectId);
const projectTargets = dualMode
  ? [
      shortProjectId ? { key: 'short', label: '短篇', id: shortProjectId, expectedType: 'short_story' } : null,
      longProjectId ? { key: 'long', label: '长篇', id: longProjectId, expectedType: 'long_novel' } : null,
    ].filter(Boolean)
  : legacyProjectId
    ? [{ key: 'project', label: '项目', id: legacyProjectId, expectedType: null }]
    : [];

function runProcess(label, cwd, command, commandArgs) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const tail = (text) => text.split(/\r?\n/).filter(Boolean).slice(-30).join('\n');
  return {
    label,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    durationMs: Date.now() - started,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr),
  };
}

function git(gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() : null;
}

function seedVersion() {
  try {
    const raw = fs.readFileSync(path.join(root, 'server/src/modules/module-standards/module-standards.seed.ts'), 'utf8');
    const m = raw.match(/SEED_BASELINE_VERSION\s*=\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function request(endpoint) {
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, { signal: AbortSignal.timeout(5000) });
    let data = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error), data: null };
  }
}

function unwrap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if ('data' in value && value.data !== undefined) return value.data;
  return value;
}

function asArray(value) {
  const v = unwrap(value);
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const key of ['items', 'rows', 'runs', 'chapters', 'standards', 'data']) {
      if (Array.isArray(v[key])) return v[key];
    }
  }
  return [];
}

function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const key of keys) if (obj[key] !== undefined) out[key] = obj[key];
  return out;
}

function chapterSummary(chapter) {
  if (!chapter) return null;
  const content = String(chapter.content ?? chapter.body ?? '');
  return {
    id: chapter.id ?? null,
    index: chapter.chapter_index ?? chapter.chapterIndex ?? chapter.index ?? chapter.order ?? null,
    title: chapter.title ?? null,
    status: chapter.status ?? null,
    contentLength: content.length,
    wordCount: Number(chapter.word_count ?? chapter.wordCount ?? 0) || 0,
    locked: chapter.locked ?? chapter.is_locked ?? null,
  };
}

function runSummary(run) {
  if (!run) return null;
  return pick(run, [
    'id', 'stage', 'scenario', 'step_key', 'stepKey', 'status', 'gate_status', 'gateStatus',
    'chapter_index', 'chapterIndex', 'model', 'provider', 'error', 'created_at', 'createdAt', 'finished_at', 'finishedAt',
    'context_version', 'contextVersion', 'standard_version', 'standardVersion',
  ]);
}

async function inspectProject(target) {
  const projectId = target.id;
  const [projectRes, chaptersRes, runsRes, cockpitRes, analyticsRes] = await Promise.all([
    request(`/projects/${encodeURIComponent(projectId)}`),
    request(`/projects/${encodeURIComponent(projectId)}/chapters`),
    request(`/generation-metrics/runs?projectId=${encodeURIComponent(projectId)}&limit=200`),
    request(`/generation-metrics/cockpit?projectId=${encodeURIComponent(projectId)}`),
    request(`/platform-analytics/overview?projectId=${encodeURIComponent(projectId)}&days=30`),
  ]);

  const project = unwrap(projectRes.data);
  const chapterRows = asArray(chaptersRes.data).slice().sort((a, b) => {
    const ai = Number(a.chapter_index ?? a.chapterIndex ?? a.index ?? a.order ?? 0);
    const bi = Number(b.chapter_index ?? b.chapterIndex ?? b.index ?? b.order ?? 0);
    return ai - bi;
  });
  const runRows = asArray(runsRes.data);
  const constitution = project?.creativeConstitution ?? project?.creative_constitution ?? null;
  const projectType = String(project?.type ?? constitution?.projectType ?? '').trim() || null;
  const firstChapterIndex = Number(chapterRows[0]?.chapter_index ?? chapterRows[0]?.chapterIndex ?? chapterRows[0]?.index ?? chapterRows[0]?.order ?? NaN);
  const firstChapterRun = Number.isFinite(firstChapterIndex)
    ? runRows.find((run) => String(run.stage ?? '').toLowerCase() === 'chapter'
      && Number(run.chapter_index ?? run.chapterIndex ?? NaN) === firstChapterIndex)
    : null;

  return {
    key: target.key,
    label: target.label,
    expectedType: target.expectedType,
    project: projectRes.ok ? {
      id: project?.id ?? projectId,
      title: project?.title ?? null,
      status: project?.status ?? null,
      type: projectType,
      typeMatches: target.expectedType ? projectType === target.expectedType : true,
      targetPlatform: project?.targetPlatform ?? constitution?.targetPlatform ?? null,
      constitutionRevision: constitution?.revision ?? null,
      confirmedStoryPresent: Boolean(constitution?.confirmedStory),
    } : { id: projectId, error: projectRes.error ?? `HTTP ${projectRes.status}` },
    chapters: {
      count: chapterRows.length,
      first: chapterSummary(chapterRows[0]),
      latest: chapterSummary(chapterRows[chapterRows.length - 1]),
    },
    firstChapterRun: runSummary(firstChapterRun),
    latestRun: runSummary(runRows[0]),
    cockpit: cockpitRes.ok ? unwrap(cockpitRes.data) : { error: cockpitRes.error ?? `HTTP ${cockpitRes.status}` },
    platformAnalytics: analyticsRes.ok ? unwrap(analyticsRes.data) : { error: analyticsRes.error ?? `HTTP ${analyticsRes.status}` },
  };
}

const tests = [];
if (runFull) {
  const server = path.join(root, 'server');
  const desktop = path.join(root, 'desktop');
  for (const [label, cwd, script] of [
    ['server:typecheck', server, 'typecheck'],
    ['server:unit', server, 'test'],
    ['server:acceptance', server, 'test:acceptance'],
    ['server:build', server, 'build'],
    ['desktop:typecheck', desktop, 'typecheck'],
    ['desktop:unit', desktop, 'test'],
    ['desktop:build', desktop, 'build'],
  ]) {
    tests.push(runProcess(label, cwd, npmCmd, ['run', script]));
  }
  if (runE2E) {
    tests.push(runProcess('server:e2e', server, npmCmd, ['run', 'test:e2e']));
    tests.push(runProcess('desktop:e2e', desktop, npmCmd, ['run', 'test:e2e']));
  }
}

const health = await request('/health');
const standardsResponse = await request('/module-standards');
const standards = asArray(standardsResponse.data);
const codeSeedVersion = seedVersion();
const standardMismatch = standards.filter((s) => {
  const seed = Number(s.seedBaselineVersion ?? s.seed_baseline_version ?? NaN);
  const source = String(s.source ?? '');
  return (Number.isFinite(seed) && codeSeedVersion !== null && seed !== codeSeedVersion)
    || !['seed', 'seed_upgrade', 'seed_locked'].includes(source);
}).map((s) => ({
  moduleKey: s.moduleKey ?? s.module_key ?? null,
  version: s.version ?? null,
  seedBaselineVersion: s.seedBaselineVersion ?? s.seed_baseline_version ?? null,
  source: s.source ?? null,
}));

const inspectedProjects = {};
for (const target of projectTargets) inspectedProjects[target.key] = await inspectProject(target);

const runtime = {
  health,
  standards: {
    codeSeedVersion,
    activeCount: standards.length,
    consistent: standardsResponse.ok && standardMismatch.length === 0,
    mismatches: standardMismatch,
  },
  projects: inspectedProjects,
};

// Keep the legacy single-project shape for tools that already consume latest.json.
if (!dualMode && inspectedProjects.project) {
  Object.assign(runtime, {
    project: inspectedProjects.project.project,
    chapters: inspectedProjects.project.chapters,
    firstChapterRun: inspectedProjects.project.firstChapterRun,
    latestRun: inspectedProjects.project.latestRun,
    cockpit: inspectedProjects.project.cockpit,
    platformAnalytics: inspectedProjects.project.platformAnalytics,
  });
}

const gitInfo = {
  commit: git(['rev-parse', 'HEAD']),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  dirty: Boolean(git(['status', '--porcelain'])),
};

const failedTests = tests.filter((x) => x.status !== 'passed');
const runtimeProblems = [];
if (!health.ok) runtimeProblems.push('server_unavailable');
if (standardsResponse.ok && !runtime.standards.consistent) runtimeProblems.push('execution_standard_drift');
if (dualMode && (!shortProjectId || !longProjectId)) runtimeProblems.push('dual_project_pair_incomplete');

for (const target of projectTargets) {
  const result = inspectedProjects[target.key];
  const prefix = target.key;
  if (!result?.project || result.project.error) {
    runtimeProblems.push(`${prefix}_project_unavailable`);
    continue;
  }
  if (target.expectedType && result.project.type !== target.expectedType) {
    runtimeProblems.push(`${prefix}_project_type_${result.project.type || 'unknown'}`);
  }
  if (!result.project.confirmedStoryPresent) runtimeProblems.push(`${prefix}_confirmed_story_missing`);
  const firstChapter = result.chapters?.first ?? null;
  if (!firstChapter || firstChapter.contentLength <= 0) runtimeProblems.push(`${prefix}_first_chapter_empty`);
  const firstRun = result.firstChapterRun;
  if (!firstRun) {
    runtimeProblems.push(`${prefix}_first_chapter_run_missing`);
  } else {
    const runStatus = String(firstRun.status ?? '').toLowerCase();
    if (runStatus !== 'success') runtimeProblems.push(`${prefix}_first_chapter_run_${runStatus || 'unknown'}`);
    const gate = String(firstRun.gate_status ?? firstRun.gateStatus ?? '').toLowerCase();
    if (!gate) runtimeProblems.push(`${prefix}_first_chapter_gate_missing`);
    else if (!['passed', 'pass', 'accepted'].includes(gate)) runtimeProblems.push(`${prefix}_first_chapter_gate_${gate}`);
  }
}

const report = {
  generatedAt: now,
  command: process.argv.join(' '),
  git: gitInfo,
  options: {
    projectId: legacyProjectId,
    shortProjectId,
    longProjectId,
    mode: dualMode ? 'short_and_long' : legacyProjectId ? 'single_project' : 'repository_only',
    baseUrl,
    fullTests: runFull,
    e2e: runE2E,
  },
  tests,
  runtime,
  verdict: {
    status: failedTests.length === 0 && runtimeProblems.length === 0 ? 'passed' : 'failed',
    failedTests: failedTests.map((x) => x.label),
    runtimeProblems,
  },
};

const jsonPath = path.join(outDir, 'latest.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

const testLines = tests.length
  ? tests.map((t) => `- ${t.label}: **${t.status.toUpperCase()}** (${t.durationMs}ms)`).join('\n')
  : '- 未执行仓库测试（使用 --full 执行；追加 --e2e 执行 E2E）';
const standardLine = standardsResponse.ok
  ? `${runtime.standards.consistent ? 'PASS' : 'FAIL'} · code seed=${codeSeedVersion ?? 'unknown'} · active=${standards.length}`
  : `UNAVAILABLE · ${standardsResponse.error ?? `HTTP ${standardsResponse.status}`}`;

function projectMarkdown(target) {
  const result = inspectedProjects[target.key];
  if (!result) return `### ${target.label}\n\n- 未指定项目 ID`;
  if (result.project?.error) return `### ${target.label}\n\n- 项目：FAIL · ${result.project.error}`;
  const firstChapter = result.chapters?.first ?? null;
  const firstLine = firstChapter
    ? `${firstChapter.contentLength > 0 ? 'PASS' : 'FAIL'} · length=${firstChapter.contentLength} · wordCount=${firstChapter.wordCount} · status=${firstChapter.status ?? 'unknown'}`
    : 'FAIL · 未找到第一章';
  const gateLine = result.firstChapterRun
    ? `${result.firstChapterRun.gate_status ?? result.firstChapterRun.gateStatus ?? 'missing'} · run=${result.firstChapterRun.id ?? 'unknown'} · status=${result.firstChapterRun.status ?? 'unknown'} · model=${result.firstChapterRun.model ?? 'unknown'}`
    : 'FAIL · 未找到第一章 chapter generation run';
  const typeLine = target.expectedType
    ? `${result.project.typeMatches ? 'PASS' : 'FAIL'} · expected=${target.expectedType} · actual=${result.project.type ?? 'unknown'}`
    : `${result.project.type ?? 'unknown'}`;
  return `### ${target.label}\n\n- 项目：${result.project.title ?? result.project.id} (${result.project.id})\n- 类型：${typeLine}\n- confirmedStory：${result.project.confirmedStoryPresent ? 'PASS' : 'FAIL'}\n- 第一章：${firstLine}\n- 第一章 Gate：${gateLine}`;
}

const projectSections = projectTargets.length
  ? projectTargets.map(projectMarkdown).join('\n\n')
  : '未指定项目；本次仅执行仓库/服务健康检查。';

const markdown = `# 本地验收报告\n\n生成时间：${now}\n\n## 总结\n\n- 最终结果：**${report.verdict.status.toUpperCase()}**\n- Git：${gitInfo.branch ?? 'unknown'} @ ${gitInfo.commit ?? 'unknown'}${gitInfo.dirty ? '（工作区有未提交改动）' : ''}\n- Server：${health.ok ? 'PASS' : 'UNAVAILABLE'}\n- 执行标准：${standardLine}\n- 验收模式：${report.options.mode}\n\n## 项目验收\n\n${projectSections}\n\n## 仓库测试\n\n${testLines}\n\n## 运行问题\n\n${runtimeProblems.length ? runtimeProblems.map((x) => `- ${x}`).join('\n') : '- 无'}\n\n## 说明\n\n- 本报告每次运行覆盖 verification/latest.json 与 verification/latest.md，不叠加历史。\n- 同时验收真实短篇和长篇时使用 --short-project <短篇ID> --long-project <长篇ID>；两个项目会进入同一份 latest 报告，不会互相覆盖。\n- Git/CI/数据库运行记录负责历史追溯；latest 报告只描述当前状态。\n- 项目验收要求第一章正文非空、存在对应 chapter generation run、run=success、Gate=passed/accepted，并且 Creative Constitution 已保存 confirmedStory。\n`;

const mdPath = path.join(outDir, 'latest.md');
fs.writeFileSync(mdPath, markdown, 'utf8');

console.log(`[verify] ${report.verdict.status.toUpperCase()}`);
console.log(`[verify] ${path.relative(root, jsonPath)}`);
console.log(`[verify] ${path.relative(root, mdPath)}`);
if (report.verdict.status !== 'passed') process.exitCode = 1;
