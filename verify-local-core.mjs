#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { normalizeIdeaDiscoveryAudit, summarizeDiscoveryStepMetrics, redactDiagnosticText, redactDiagnosticValue } from './verify-local-diagnostics.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const valueOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};

const legacyProjectId = valueOf('--project') || process.env.VERIFY_PROJECT_ID || null;
const requestedShortProjectId = valueOf('--short-project') || process.env.VERIFY_SHORT_PROJECT_ID || null;
const requestedLongProjectId = valueOf('--long-project') || process.env.VERIFY_LONG_PROJECT_ID || null;
const baseUrl = (valueOf('--base') || process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3100/api/v1').replace(/\/$/, '');
const runFull = has('--full');
const runE2E = has('--e2e');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const outDir = path.join(root, 'verification');
fs.mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();
const startedAt = now;
const verificationRunId = randomUUID();
const singleMode = Boolean(legacyProjectId) && !requestedShortProjectId && !requestedLongProjectId;
let shortProjectId = requestedShortProjectId;
let longProjectId = requestedLongProjectId;

function runProcess(label, cwd, command, commandArgs) {
  const started = Date.now();
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
    // Node 22+ cannot launch npm.cmd directly on Windows; arguments here are
    // fixed repository script names, so the shell can execute that batch file.
    shell: process.platform === 'win32',
  });
  const stdout = String(result.stdout || '');
  const stderr = [result.stderr, result.error?.message].filter(Boolean).join('\n');
  const tail = (text) => text.split(/\r?\n/).filter(Boolean).slice(-120).join('\n');
  return {
    label,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    durationMs: Date.now() - started,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    stdoutTail: redactDiagnosticText(tail(stdout)),
    stderrTail: redactDiagnosticText(tail(stderr)),
  };
}

function git(gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout || '').trim() : null;
}

function seedVersion() {
  try {
    const raw = fs.readFileSync(path.join(root, 'server/shared/src/执行标准.ts'), 'utf8');
    const m = raw.match(/SYSTEM_WORKFLOW_RULESET_VERSION\s*=\s*(\d+)/);
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

function projectType(project) {
  const constitution = project?.creativeConstitution ?? project?.creative_constitution ?? null;
  return String(project?.type ?? constitution?.projectType ?? '').trim() || null;
}

function projectSettingsObject(project) {
  const value = project?.settings ?? project?.settings_json;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return {};
}

function comparableValue(value) {
  if (Array.isArray(value)) return value.map(comparableValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparableValue(value[key])]));
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

function comparePersistedField(authoritative, confirmedStory) {
  const missing = value => value === null || value === undefined || value === '';
  if (missing(authoritative) || missing(confirmedStory)) {
    return { status: 'unknown', authoritative: authoritative ?? null, confirmedStory: confirmedStory ?? null };
  }
  const left = comparableValue(authoritative);
  const right = comparableValue(confirmedStory);
  return { status: JSON.stringify(left) === JSON.stringify(right) ? 'match' : 'mismatch', authoritative: left, confirmedStory: right };
}

function projectTime(project) {
  const raw = project?.updatedAt ?? project?.updated_at ?? project?.createdAt ?? project?.created_at ?? '';
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectSelectionSummary(project) {
  if (!project) return null;
  return {
    id: project.id ?? null,
    title: project.title ?? null,
    type: projectType(project),
    status: project.status ?? null,
    updatedAt: project.updatedAt ?? project.updated_at ?? null,
  };
}

// Runtime diagnostics depend on the same backend. Establish that prerequisite once,
// then skip dependent probes when it is unavailable instead of reporting cascaded
// project/standard failures that are only consequences of the same root cause.
const health = await request('/health');

const projectDiscovery = {
  attempted: false,
  ok: true,
  source: singleMode
    ? 'single_project'
    : requestedShortProjectId && requestedLongProjectId
      ? 'explicit_pair'
      : requestedShortProjectId || requestedLongProjectId
        ? 'mixed_explicit_and_auto'
        : runFull
          ? 'auto_latest_active_pair'
          : 'diagnostic_latest_projects',
  error: null,
  skippedReason: null,
  candidates: 0,
  short: null,
  long: null,
};

if (!health.ok) {
  projectDiscovery.ok = false;
  projectDiscovery.skippedReason = 'server_unavailable';
  projectDiscovery.error = 'skipped: server unavailable';
} else if (!singleMode && (!shortProjectId || !longProjectId)) {
  projectDiscovery.attempted = true;
  const discoveryEndpoint = runFull
    ? '/projects?status=active&limit=100&offset=0'
    : '/projects?limit=100&offset=0';
  const projectsRes = await request(discoveryEndpoint);
  if (!projectsRes.ok) {
    projectDiscovery.ok = false;
    projectDiscovery.error = projectsRes.error ?? `HTTP ${projectsRes.status}`;
  } else {
    const projects = asArray(projectsRes.data)
      .filter((project) => runFull ? String(project?.status ?? '').toLowerCase() === 'active' : true)
      .sort((a, b) => projectTime(b) - projectTime(a));
    projectDiscovery.candidates = projects.length;
    if (!shortProjectId) shortProjectId = projects.find((project) => projectType(project) === 'short_story')?.id ?? null;
    if (!longProjectId) longProjectId = projects.find((project) => projectType(project) === 'long_novel')?.id ?? null;
    projectDiscovery.short = projectSelectionSummary(projects.find((project) => project.id === shortProjectId));
    projectDiscovery.long = projectSelectionSummary(projects.find((project) => project.id === longProjectId));
  }
}

const dualMode = !singleMode;
const projectTargets = singleMode
  ? [{ key: 'project', label: '项目', id: legacyProjectId, expectedType: null }]
  : [
      shortProjectId ? { key: 'short', label: '短篇', id: shortProjectId, expectedType: 'short_story' } : null,
      longProjectId ? { key: 'long', label: '长篇', id: longProjectId, expectedType: 'long_novel' } : null,
    ].filter(Boolean);

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
    'started_at', 'startedAt', 'duration_ms', 'durationMs', 'prompt_version', 'promptVersion',
    'context_version', 'contextVersion', 'standard_version', 'standardVersion',
  ]);
}


/** Existing generation_runs data only; never export prompts or context snapshots. */
function runDetail(run) {
  const summary = runSummary(run) || {};
  let payload = null;
  try { payload = typeof run.quality_payload === 'string' ? JSON.parse(run.quality_payload) : run.quality_payload; } catch {}
  return {
    ...summary,
    error: String(summary.error || '').slice(0, 4000) || null,
    durationMs: Number(run.duration_ms ?? run.durationMs ?? 0) || 0,
    startedAt: run.started_at ?? run.startedAt ?? null,
    finishedAt: run.finished_at ?? run.finishedAt ?? null,
    gateStatus: run.gate_status ?? run.gateStatus ?? payload?.gate?.status ?? null,
    qualityGate: payload?.gate ? pick(payload.gate, ['status', 'passed', 'reason']) : null,
    stageScore: payload?.stageScore ? pick(payload.stageScore, ['stage', 'status', 'overallScore']) : null,
    failedOutputExcerpt: String(run.status).toLowerCase() === 'failed'
      ? String(run.output_text || '').slice(0, 700) : null,
  };
}
function stepBreakdown(runs) {
  const byStep = new Map();
  for (const row of runs) {
    const step = String(row.step_key ?? row.stepKey ?? row.stage ?? row.scenario ?? 'unknown');
    const group = byStep.get(step) || { step, calls: 0, failures: 0, durationMs: 0 };
    group.calls++;
    group.durationMs += Math.max(0, Number(row.durationMs) || 0);
    if (String(row.status).toLowerCase() !== 'success') group.failures++;
    byStep.set(step, group);
  }
  return [...byStep.values()].sort((a, b) => b.durationMs - a.durationMs);
}
function markdownCell(value, limit = 320) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '／').slice(0, limit);
}

async function inspectProject(target) {
  const projectId = target.id;
  const [projectRes, chaptersRes, runsRes, cockpitRes, analyticsRes, integrityRes] = await Promise.all([
    request(`/projects/${encodeURIComponent(projectId)}`),
    request(`/projects/${encodeURIComponent(projectId)}/chapters`),
    request(`/generation-metrics/runs?projectId=${encodeURIComponent(projectId)}&limit=200`),
    request(`/generation-metrics/cockpit?projectId=${encodeURIComponent(projectId)}`),
    request(`/platform-analytics/overview?projectId=${encodeURIComponent(projectId)}&days=30`),
    request(`/chain/generation-recovery/${encodeURIComponent(projectId)}`),
  ]);

  const project = unwrap(projectRes.data);
  const projectSettings = projectSettingsObject(project);
  const chapterRows = asArray(chaptersRes.data).slice().sort((a, b) => {
    const ai = Number(a.chapter_index ?? a.chapterIndex ?? a.index ?? a.order ?? 0);
    const bi = Number(b.chapter_index ?? b.chapterIndex ?? b.index ?? b.order ?? 0);
    return ai - bi;
  });
  const runRows = asArray(runsRes.data);
  const constitution = project?.creativeConstitution ?? project?.creative_constitution ?? projectSettings?.creativeConstitution ?? null;
  const confirmedStory = constitution?.confirmedStory && typeof constitution.confirmedStory === 'object' && !Array.isArray(constitution.confirmedStory)
    ? constitution.confirmedStory
    : null;
  const ideaDiscoveryAudit = projectSettings.ideaDiscoveryAudit ?? confirmedStory?.ideaDiscoveryAudit ?? null;
  const auditPlacement = {
    topLevel: Boolean(projectSettings.ideaDiscoveryAudit),
    embeddedInConfirmedStory: Boolean(confirmedStory?.ideaDiscoveryAudit),
    status: confirmedStory?.ideaDiscoveryAudit ? 'embedded_in_confirmed_story' : projectSettings.ideaDiscoveryAudit ? 'separated' : 'unknown',
  };
  const resolvedProjectType = projectType(project);
  const authoritativeTargetWords = constitution?.targetWords ?? project?.target_words ?? project?.targetWords;
  const fieldChecks = {
    storyType: comparePersistedField(resolvedProjectType, confirmedStory?.storyType),
    targetPlatform: comparePersistedField(constitution?.targetPlatform ?? project?.targetPlatform ?? project?.target_platform, confirmedStory?.targetPlatform),
    category: comparePersistedField(constitution?.category, confirmedStory?.storyCategory ?? confirmedStory?.category),
    storyTone: comparePersistedField(constitution?.storyTone, confirmedStory?.storyTone),
    writingStyle: comparePersistedField(constitution?.writingStyle, confirmedStory?.writingStyle),
    webNovelGenre: comparePersistedField(constitution?.webNovelGenre, confirmedStory?.webNovelGenre),
    pov: comparePersistedField(constitution?.pov, confirmedStory?.pov),
    targetAudience: comparePersistedField(constitution?.targetAudience, confirmedStory?.targetAudience),
    targetWords: comparePersistedField(Number(authoritativeTargetWords) || null, Number(confirmedStory?.recommendedTargetWords ?? confirmedStory?.estimatedWords) || null),
  };
  const selectedPremiseId = String(confirmedStory?.sourcePremiseId || '').trim();
  const acceptedPremiseIds = Array.isArray(ideaDiscoveryAudit?.acceptedEvidence)
    ? ideaDiscoveryAudit.acceptedEvidence.map(item => String(item?.sourcePremiseId || '').trim()).filter(Boolean)
    : [];
  fieldChecks.sourcePremiseIdInAudit = selectedPremiseId && acceptedPremiseIds.length
    ? { status: acceptedPremiseIds.includes(selectedPremiseId) ? 'match' : 'mismatch', sourcePremiseId: selectedPremiseId, acceptedPremiseIds }
    : { status: 'unknown', sourcePremiseId: selectedPremiseId || null, acceptedPremiseIds: acceptedPremiseIds.length ? acceptedPremiseIds : null };
  const fieldMismatches = Object.entries(fieldChecks).filter(([, check]) => check.status === 'mismatch').map(([field]) => field);
  const fieldUnknowns = Object.entries(fieldChecks).filter(([, check]) => check.status === 'unknown').map(([field]) => field);
  const fieldConsistency = { status: fieldMismatches.length ? 'mismatch' : fieldUnknowns.length ? 'partial' : 'match', mismatches: fieldMismatches, unknowns: fieldUnknowns, checks: fieldChecks };
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
      type: resolvedProjectType,
      typeMatches: target.expectedType ? resolvedProjectType === target.expectedType : true,
      targetPlatform: project?.targetPlatform ?? constitution?.targetPlatform ?? null,
      constitutionRevision: constitution?.revision ?? null,
      confirmedStoryPresent: Boolean(confirmedStory),
      fieldConsistency,
      auditPlacement,
      storySelection: confirmedStory ? {
        title: confirmedStory.title ?? null,
        hook: confirmedStory.hook ?? null,
        protagonist: confirmedStory.protagonist ?? null,
        coreConflict: confirmedStory.coreConflict ?? confirmedStory.conflict ?? null,
        uniquePoint: confirmedStory.uniquePoint ?? confirmedStory.uniqueSelling ?? confirmedStory.storyCore ?? null,
        mainReversal: confirmedStory.mainReversal ?? null,
        noveltyProof: confirmedStory.noveltyProof ?? null,
        readerExperienceProfile: confirmedStory.readerExperienceProfile ?? null,
        ideaDiscoveryAudit,
        auditPlacement,
      } : null,
    } : { id: projectId, error: projectRes.error ?? `HTTP ${projectRes.status}` },
    chapters: {
      count: chapterRows.length,
      first: chapterSummary(chapterRows[0]),
      latest: chapterSummary(chapterRows[chapterRows.length - 1]),
    },
    firstChapterRun: runSummary(firstChapterRun),
    latestRun: runSummary(runRows[0]),
    runTimeline: runRows.map(runDetail),
    stepBreakdown: stepBreakdown(runRows.map(runDetail)),
    runtimeSources: {
      project: { ok: projectRes.ok, status: projectRes.status, error: projectRes.error ?? null },
      chapters: { ok: chaptersRes.ok, status: chaptersRes.status, error: chaptersRes.error ?? null },
      runs: { ok: runsRes.ok, status: runsRes.status, error: runsRes.error ?? null, returned: runRows.length, limit: 200 },
      cockpit: { ok: cockpitRes.ok, status: cockpitRes.status, error: cockpitRes.error ?? null },
      integrity: { ok: integrityRes.ok, status: integrityRes.status, error: integrityRes.error ?? null },
    },
    integrityAudit: integrityRes.ok ? unwrap(integrityRes.data) : { error: integrityRes.error ?? `HTTP ${integrityRes.status}` },
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

const skippedRuntimeRequest = (label) => ({
  ok: false,
  status: null,
  error: `skipped: server unavailable (${label})`,
  data: null,
});
const ideaDiscoveryResponse = health.ok
  ? await request('/chain/idea-discovery-diagnostics/latest')
  : skippedRuntimeRequest('idea-discovery');
const standardsResponse = health.ok
  ? await request('/module-standards')
  : skippedRuntimeRequest('module-standards');
const standards = asArray(standardsResponse.data);
const rawIdeaDiscovery = ideaDiscoveryResponse.ok
  ? unwrap(ideaDiscoveryResponse.data)
  : { available: false, error: ideaDiscoveryResponse.error ?? `HTTP ${ideaDiscoveryResponse.status}` };
const savedDiscoveryAudit = normalizeIdeaDiscoveryAudit(rawIdeaDiscovery);
const stepMetricsQuery = new URLSearchParams({ scenario: 'idea_generate', limit: '500' });
if (savedDiscoveryAudit.discoveryRequestId) {
  stepMetricsQuery.set('discoveryRequestId', savedDiscoveryAudit.discoveryRequestId);
} else if (savedDiscoveryAudit.startedAt && savedDiscoveryAudit.finishedAt) {
  stepMetricsQuery.set('startAt', savedDiscoveryAudit.startedAt);
  stepMetricsQuery.set('endAt', savedDiscoveryAudit.finishedAt);
}
const stepMetricsResponse = health.ok
  ? await request('/generation-metrics/steps?' + stepMetricsQuery.toString())
  : skippedRuntimeRequest('discovery-step-metrics');
const stepMetricRows = stepMetricsResponse.ok ? asArray(stepMetricsResponse.data) : [];
const discoveryCallTrace = {
  source: {
    ok: stepMetricsResponse.ok, status: stepMetricsResponse.status, error: stepMetricsResponse.error ?? null,
    endpoint: '/generation-metrics/steps', totalRows: stepMetricRows.length, limit: 500,
    correlationMode: savedDiscoveryAudit.discoveryRequestId ? 'discovery_request_id'
      : savedDiscoveryAudit.startedAt && savedDiscoveryAudit.finishedAt ? 'audit_time_window' : 'latest_unbound',
    requestCorrelation: savedDiscoveryAudit.discoveryRequestId ? 'discovery_request_id'
      : savedDiscoveryAudit.startedAt && savedDiscoveryAudit.finishedAt ? 'time_window_only' : 'unbound',
    discoveryRequestId: savedDiscoveryAudit.discoveryRequestId,
    auditStartedAt: savedDiscoveryAudit.startedAt, auditFinishedAt: savedDiscoveryAudit.finishedAt,
    concurrentOverlapPossible: !savedDiscoveryAudit.discoveryRequestId && Boolean(savedDiscoveryAudit.startedAt && savedDiscoveryAudit.finishedAt),
  },
  ...summarizeDiscoveryStepMetrics(stepMetricRows),
};
const codeSeedVersion = seedVersion();
const standardMismatch = standards.filter((s) => {
  const seed = Number(s.seedBaselineVersion ?? s.seed_baseline_version ?? NaN);
  const source = String(s.source ?? '');
  return (Number.isFinite(seed) && codeSeedVersion !== null && seed !== codeSeedVersion)
    || source !== 'system_workflow_rule_registry';
}).map((s) => ({
  moduleKey: s.moduleKey ?? s.module_key ?? null,
  version: s.version ?? null,
  seedBaselineVersion: s.seedBaselineVersion ?? s.seed_baseline_version ?? null,
  source: s.source ?? null,
}));

const inspectedProjects = {};
if (health.ok) {
  for (const target of projectTargets) inspectedProjects[target.key] = await inspectProject(target);
}

const runtime = redactDiagnosticValue({
  health,
  preflight: health.ok
    ? { ok: true, rootCause: null, downstreamSkipped: [] }
    : {
        ok: false,
        rootCause: 'server_unavailable',
        downstreamSkipped: ['ideaDiscovery', 'standards', 'projectDiscovery', 'projects'],
        detail: health.error ?? `HTTP ${health.status}`,
      },
  ideaDiscovery: rawIdeaDiscovery,
  discoveryCallTrace,
  standards: {
    codeSeedVersion,
    activeCount: standards.length,
    consistent: standardsResponse.ok && standardMismatch.length === 0,
    mismatches: standardMismatch,
  },
  projectDiscovery,
  projects: inspectedProjects,
});

if (!dualMode && inspectedProjects.project) {
  Object.assign(runtime, {
    project: inspectedProjects.project.project,
    chapters: inspectedProjects.project.chapters,
    firstChapterRun: inspectedProjects.project.firstChapterRun,
    latestRun: inspectedProjects.project.latestRun,
    integrityAudit: inspectedProjects.project.integrityAudit,
    cockpit: inspectedProjects.project.cockpit,
    platformAnalytics: inspectedProjects.project.platformAnalytics,
  });
}

const gitInfo = {
  commit: git(['rev-parse', 'HEAD']),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  dirty: Boolean(git(['status', '--porcelain'])),
};
const healthPayload = unwrap(health.data);
const backendBuild = healthPayload?.build && typeof healthPayload.build === 'object' ? healthPayload.build : {};
const backendIdentity = {
  apiReachable: health.ok,
  instanceId: healthPayload?.instanceId ?? null,
  buildVersion: backendBuild.version ?? healthPayload?.version ?? null,
  buildCommit: backendBuild.commit ?? null,
  processStartedAt: backendBuild.processStartedAt ?? null,
  diagnosticsMarker: backendBuild.diagnosticsMarker ?? null,
  localCommit: gitInfo.commit,
  loadedLocalRevision: backendBuild.commit && gitInfo.commit
    ? (String(backendBuild.commit) === String(gitInfo.commit) ? 'match' : 'mismatch')
    : 'unknown',
  diagnosticsMarkerStatus: backendBuild.diagnosticsMarker === 'verify-local-build-identity-v1'
    ? 'present' : backendBuild.diagnosticsMarker ? 'different' : 'unknown',
};
runtime.backendIdentity = backendIdentity;

const failedTests = tests.filter((x) => x.status !== 'passed');
const runtimeProblems = [];
if (!health.ok) {
  // Root-cause-first: downstream runtime checks were not executed.
  runtimeProblems.push('server_unavailable');
} else {
  if (standardsResponse.ok && !runtime.standards.consistent) runtimeProblems.push('execution_standard_drift');
  if (projectDiscovery.attempted && !projectDiscovery.ok) runtimeProblems.push('project_auto_discovery_failed');
  if (runFull && dualMode && (!shortProjectId || !longProjectId)) runtimeProblems.push('dual_project_pair_incomplete');
  if (!runFull && !singleMode && projectTargets.length === 0) runtimeProblems.push('no_projects_found');
  const latestAuditSummary = normalizeIdeaDiscoveryAudit(runtime.ideaDiscovery);
  if (!runFull && latestAuditSummary.available && latestAuditSummary.success === false) runtimeProblems.push('latest_idea_discovery_failed');
}

if (health.ok) for (const target of projectTargets) {
  const result = inspectedProjects[target.key];
  const prefix = target.key;
  if (!result?.project || result.project.error) {
    runtimeProblems.push(`${prefix}_project_unavailable`);
    continue;
  }

  const projectStatus = String(result.project.status || '').toLowerCase();
  const diagnostics = result.cockpit?.diagnostics ?? null;
  const creatingInProgress = !runFull && projectStatus === 'creating' && diagnostics?.creationStalled !== true;
  if (runFull) {
    if (projectStatus !== 'active') runtimeProblems.push(`${prefix}_project_status_${projectStatus || 'unknown'}`);
  } else if (projectStatus === 'creating') {
    if (diagnostics?.creationStalled === true) runtimeProblems.push(`${prefix}_creation_stalled`);
  } else if (projectStatus !== 'active') {
    runtimeProblems.push(`${prefix}_project_status_${projectStatus || 'unknown'}`);
  }
  if (target.expectedType && result.project.type !== target.expectedType) {
    runtimeProblems.push(`${prefix}_project_type_${result.project.type || 'unknown'}`);
  }
  if (!result.project.confirmedStoryPresent) runtimeProblems.push(`${prefix}_confirmed_story_missing`);

  const integrity = result.integrityAudit;
  if (!integrity || integrity.error) {
    runtimeProblems.push(`${prefix}_integrity_audit_unavailable`);
  } else {
    const missingModules = Array.isArray(integrity.missingModules) ? integrity.missingModules : [];
    const consistencyIssues = Array.isArray(integrity.consistencyIssues) ? integrity.consistencyIssues : [];
    if (missingModules.length && !creatingInProgress) runtimeProblems.push(`${prefix}_missing_modules_${missingModules.length}`);
    if (consistencyIssues.length) runtimeProblems.push(`${prefix}_consistency_issues_${consistencyIssues.length}`);
    if (runFull && integrity.outlineBodyMappingValid !== true) runtimeProblems.push(`${prefix}_outline_body_mapping_invalid`);
  }

  const firstChapter = result.chapters?.first ?? null;
  const shouldRequireFirstChapter = runFull || projectStatus === 'active';
  if (shouldRequireFirstChapter) {
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
}

const diagnosticWarnings = [];
const finalDiscoveryAudit = normalizeIdeaDiscoveryAudit(runtime.ideaDiscovery);
if (!runtime.discoveryCallTrace?.source?.ok) {
  diagnosticWarnings.push('灵感发现逐步指标查询失败：' + String(runtime.discoveryCallTrace?.source?.error ?? '原因未知'));
}
if (runtime.discoveryCallTrace?.source?.correlationMode === 'latest_unbound') {
  diagnosticWarnings.push('最新灵感审计缺少开始/结束时间，调用记录只能按最近记录查询，无法严格关联。');
}
if (runtime.discoveryCallTrace?.source?.ok && finalDiscoveryAudit.startedAt && finalDiscoveryAudit.finishedAt && runtime.discoveryCallTrace.runs.length === 0) {
  diagnosticWarnings.push('最新灵感审计时间窗内没有模型调用指标；不能据此宣称耗时或调用次数为零。');
}
if (runtime.discoveryCallTrace?.sameVersionCallGroups?.length) {
  diagnosticWarnings.push('灵感发现存在相同版本元数据组合的多次调用；指标没有保存实际输入指纹，这只能提示人工核对 Run ID、时间窗与请求，不能单独认定重复调用。');
}
for (const target of projectTargets) {
  const diagnostics = inspectedProjects[target.key]?.cockpit?.diagnostics;
  if (Number(diagnostics?.exactDuplicateRunGroups) > 0) {
    diagnosticWarnings.push(target.label + '：后端同版本元数据分组数=' + diagnostics.exactDuplicateRunGroups + '；未保存完整输入指纹，不能单独认定为精确重复运行。');
  }
}
runtime.diagnosticWarnings = diagnosticWarnings;

const selectionMode = singleMode
  ? 'single_project'
  : requestedShortProjectId && requestedLongProjectId
    ? 'explicit_short_and_long'
    : requestedShortProjectId || requestedLongProjectId
      ? 'mixed_explicit_and_auto'
      : runFull
        ? 'auto_latest_active_short_and_long'
        : 'diagnostic_latest_short_and_long';

const finishedAt = new Date().toISOString();
const report = redactDiagnosticValue({
  generatedAt: finishedAt,
  verificationRunId,
  startedAt,
  finishedAt,
  command: redactDiagnosticText(process.argv.join(' ')),
  git: gitInfo,
  options: {
    projectId: legacyProjectId,
    requestedShortProjectId,
    requestedLongProjectId,
    shortProjectId,
    longProjectId,
    mode: selectionMode,
    baseUrl,
    fullTests: runFull,
    e2e: runE2E,
  },
  tests,
  runtime,
  verdict: {
    status: failedTests.length === 0 && runtimeProblems.length === 0 ? 'passed' : 'failed',
    rootCause: !health.ok ? 'server_unavailable' : (runtimeProblems[0] ?? null),
    failedTests: failedTests.map((x) => x.label),
    runtimeProblems,
  },
});

const jsonPath = path.join(outDir, 'latest.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

const testLines = tests.length
  ? tests.map((t) => `- ${t.label}: **${t.status.toUpperCase()}** (${t.durationMs}ms)`).join('\n')
  : '- 未执行仓库测试（使用 --full 执行；追加 --e2e 执行 E2E）';
const standardLine = standardsResponse.ok
  ? `${runtime.standards.consistent ? 'PASS' : 'FAIL'} · code seed=${codeSeedVersion ?? 'unknown'} · active=${standards.length}`
  : `UNAVAILABLE · ${standardsResponse.error ?? `HTTP ${standardsResponse.status}`}`;

function latestRunLine(result) {
  const run = result?.latestRun;
  if (!run) return '未找到 generation run';
  const bits = [
    `status=${run.status ?? 'unknown'}`,
    `stage=${run.stage ?? run.scenario ?? run.step_key ?? run.stepKey ?? 'unknown'}`,
  ];
  if (run.error) bits.push(`error=${String(run.error).replace(/\s+/g, ' ').trim()}`);
  return bits.join(' · ');
}

function projectMarkdown(target) {
  const result = inspectedProjects[target.key];
  if (!result) return `### ${target.label}\n\n- 未找到项目`;
  if (result.project?.error) return `### ${target.label}\n\n- 项目：FAIL · ${result.project.error}`;
  const firstChapter = result.chapters?.first ?? null;
  const firstLine = firstChapter
    ? `${firstChapter.contentLength > 0 ? 'PASS' : 'FAIL'} · length=${firstChapter.contentLength} · wordCount=${firstChapter.wordCount} · status=${firstChapter.status ?? 'unknown'}`
    : '未生成第一章';
  const gateLine = result.firstChapterRun
    ? `${result.firstChapterRun.gate_status ?? result.firstChapterRun.gateStatus ?? 'missing'} · run=${result.firstChapterRun.id ?? 'unknown'} · status=${result.firstChapterRun.status ?? 'unknown'} · model=${result.firstChapterRun.model ?? 'unknown'}`
    : '未找到第一章 chapter generation run';
  const typeLine = target.expectedType
    ? `${result.project.typeMatches ? 'PASS' : 'FAIL'} · expected=${target.expectedType} · actual=${result.project.type ?? 'unknown'}`
    : `${result.project.type ?? 'unknown'}`;
  const fieldConsistency = result.project.fieldConsistency;
  const fieldConsistencyLine = fieldConsistency
    ? `${fieldConsistency.status} · mismatches=${(fieldConsistency.mismatches || []).join(',') || 'none'} · unknown=${(fieldConsistency.unknowns || []).join(',') || 'none'}`
    : 'UNKNOWN';
  const auditPlacement = result.project.auditPlacement;
  const auditPlacementLine = auditPlacement
    ? `${auditPlacement.status} · topLevel=${auditPlacement.topLevel} · embedded=${auditPlacement.embeddedInConfirmedStory}`
    : 'UNKNOWN';
  const diagnostics = result.cockpit?.diagnostics ?? null;
  const isCreating = String(result.project.status || '').toLowerCase() === 'creating';
  const inProgress = !runFull && isCreating && diagnostics?.creationStalled !== true;
  const statusLine = result.project.status === 'active'
    ? 'PASS · active'
    : inProgress
      ? `IN_PROGRESS · creating · idle=${diagnostics?.idleMs ?? 'unknown'}ms`
      : `FAIL · ${result.project.status ?? 'unknown'}${diagnostics?.creationStalled ? ' · creation_stalled' : ''}`;
  const integrity = result.integrityAudit;
  const integrityLine = integrity?.error
    ? `FAIL · ${integrity.error}`
    : integrity
      ? inProgress
        ? `IN_PROGRESS · missing=${(integrity.missingModules || []).length} · consistency=${(integrity.consistencyIssues || []).length}`
        : `${(integrity.missingModules?.length || integrity.consistencyIssues?.length || (runFull && integrity.outlineBodyMappingValid !== true)) ? 'FAIL' : 'PASS'} · missing=${(integrity.missingModules || []).length} · consistency=${(integrity.consistencyIssues || []).length} · outline↔chapter=${integrity.outlineBodyMappingValid ? 'PASS' : 'NOT_READY'}`
      : 'FAIL · 未取得完整性审计';
  const persistenceLine = diagnostics
    ? diagnostics.creationStalled
      ? `FAIL · stalled · mismatch=${(diagnostics.persistenceMismatch || []).join(',') || 'none'}`
      : (diagnostics.pendingPersistenceMismatch || []).length
        ? `IN_PROGRESS · pending=${diagnostics.pendingPersistenceMismatch.join(',')}`
        : `PASS · mismatch=${(diagnostics.persistenceMismatch || []).join(',') || 'none'}`
    : 'UNAVAILABLE';
  return `### ${target.label}\n\n- 项目：${result.project.title ?? result.project.id} (${result.project.id})\n- 状态：${statusLine}\n- 类型：${typeLine}\n- confirmedStory：${result.project.confirmedStoryPresent ? 'PASS' : 'FAIL'}\n- 结构完整性：${integrityLine}\n- 创建/持久化诊断：${persistenceLine}\n- 题材字段一致性：${fieldConsistencyLine}\n- 题材审计隔离：${auditPlacementLine}\n- 最近生成：${latestRunLine(result)}\n- 第一章：${firstLine}\n- 第一章 Gate：${gateLine}`;
}


function detailedIdeaMarkdown() {
  const audit = normalizeIdeaDiscoveryAudit(runtime.ideaDiscovery || {});
  const trace = runtime.discoveryCallTrace || {};
  const source = trace.source || {};
  const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const runs = Array.isArray(trace.runs) ? trace.runs : [];
  const stepLines = (trace.stepBreakdown || []).map(row =>
    '| ' + cell(row.stepKey) + ' | ' + row.calls + ' | ' + row.failedCalls + ' | ' + row.sumDurationMs
      + ' | ' + (row.wallMs ?? '未知') + ' | ' + row.internalRetries + ' | ' + row.physicalAttempts + ' | ' + (row.totalTokens ?? '未知') + ' |'
  ).join('\n');
  const phaseLines = (trace.phaseBreakdown || []).map(row =>
    '| ' + cell(row.phase) + ' | ' + row.calls + ' | ' + row.failedCalls + ' | ' + row.sumDurationMs
      + ' | ' + (row.wallMs ?? '未知') + ' | ' + row.internalRetries + ' | ' + row.physicalAttempts + ' | ' + (row.totalTokens ?? '未知') + ' |'
  ).join('\n');
  const duplicateLines = (trace.sameVersionCallGroups || []).map(group =>
    '| ' + cell(group.stepKey) + ' | ' + group.count + ' | ' + cell(group.promptVersion) + ' | '
      + cell(group.contextVersion) + ' | ' + cell(group.constitutionRevision) + ' | ' + cell((group.runIds || []).join(', ')) + ' |'
  ).join('\n');
  const callLines = runs.map(row =>
    '| ' + cell(row.runId) + ' | ' + cell(row.stepKey) + ' | ' + cell(row.attempt) + ' | '
      + row.internalRetries + ' | ' + row.physicalAttempts + ' | ' + cell(row.status) + ' | '
      + (row.durationMs ?? '未知') + ' | ' + (row.totalTokens ?? '未知') + ' | ' + cell(row.gateStatus) + ' | '
      + cell(row.startedAt) + ' | ' + cell(row.finishedAt) + ' | ' + cell(row.error) + ' |'
  ).join('\n');
  const evidence = {
    available: audit.available, updatedAt: audit.updatedAt, discoveryRequestId: audit.discoveryRequestId,
    startedAt: audit.startedAt, finishedAt: audit.finishedAt, request: audit.request, success: audit.success,
    totalIdeas: audit.totalIdeas, requested: audit.requested, premisePoolTarget: audit.premisePoolTarget,
    premisePoolSize: audit.premisePoolSize, premiseSelected: audit.premiseSelected, generated: audit.generated,
    qualified: audit.qualified, returned: audit.returned, shortfall: audit.shortfall,
    minimumDeliverableCount: audit.minimumDeliverableCount, stopReason: audit.stopReason, error: audit.error,
    qualityWarning: audit.qualityWarning, poolGeneration: audit.poolGeneration, phaseTimings: audit.phaseTimings,
    candidatePool: audit.candidatePool, preselectedPremises: audit.preselectedPremises,
    candidateAssessments: audit.candidateAssessments, selectionAudit: audit.selectionAudit, acceptedIdeas: audit.acceptedIdeas,
  };
  return [
    '## 灵感发现审计',
    '- 本地验证运行 ID：' + verificationRunId,
    '- 灵感请求 ID：' + (audit.discoveryRequestId ?? '未知'),
    '- 审计状态：' + (audit.available ? '已读取' : '不可用') + '；成功：' + (audit.success ?? '未知') + '；更新时间：' + (audit.updatedAt ?? '未知'),
    '- 请求窗口：' + (audit.startedAt ?? '未知') + ' — ' + (audit.finishedAt ?? '未知'),
    '- 请求/候选池/选中/完整卡生成/合格/返回：' + (audit.requested ?? '未知') + ' / '
      + (audit.premisePoolSize ?? '未知') + '（目标 ' + (audit.premisePoolTarget ?? '未知') + '） / '
      + (audit.premiseSelected ?? '未知') + ' / ' + (audit.generated ?? '未知') + ' / '
      + (audit.qualified ?? '未知') + ' / ' + (audit.returned ?? '未知') + '；缺额：' + (audit.shortfall ?? '未知'),
    '- 停止原因：' + (audit.stopReason ?? '无明确记录') + '；错误：' + (audit.error ?? '无') + '；质量警告：' + (audit.qualityWarning ?? '无'),
    '- 调用跟踪：' + (source.ok ? '已查询' : '查询失败') + '；关联方式：' + (source.correlationMode ?? '未知')
      + '；记录数：' + (source.totalRows ?? runs.length) + '；并发重叠可能：' + (source.concurrentOverlapPossible ?? '未知')
      + '；' + (source.requestCorrelation === 'discovery_request_id'
        ? '模型指标按 discoveryRequestId 精确关联，不混入其他并发请求。'
        : '模型指标不含 discoveryRequestId，时间窗关联不能排除并发请求重叠。'),
    '',
    '### 阶段耗时与调用次数',
    '| 阶段 | 逻辑调用 | 失败 | 累计耗时 ms | 阶段墙钟 ms | 内部重试 | 估算物理尝试 | Token |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    phaseLines || '| 无可用记录 | — | — | — | — | — | — | — |',
    '',
    '### 按 stepKey 汇总',
    '| stepKey | 逻辑调用 | 失败 | 累计耗时 ms | 墙钟 ms | 内部重试 | 估算物理尝试 | Token |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    stepLines || '| 无可用记录 | — | — | — | — | — | — | — |',
    '',
    '### 同版本元数据组合的多次调用（不等同于实际输入完全相同）',
    '| stepKey | 次数 | Prompt 版本 | Context 版本 | Constitution 版本 | Run IDs |',
    '|---|---:|---|---|---|---|',
    duplicateLines || '| 未发现同版本元数据组合的多次调用 | — | — | — | — | — |',
    '',
    '### 完整模型调用时间线',
    '| Run ID | Step | 尝试 | 内部重试 | 估算物理尝试 | 状态 | 耗时 ms | Token | Gate | 开始 | 结束 | 错误 |',
    '|---|---|---:|---:|---:|---|---:|---:|---|---|---|---|',
    callLines || '| 无可用记录；不能据此推断没有发生模型调用 | — | — | — | — | — | — | — | — | — | — |',
    '',
    '### 审计原始证据',
    '~~~json',
    JSON.stringify(evidence, null, 2),
    '~~~',
  ].join('\n');
}

function detailedProjectMarkdown(target) {
  const item = inspectedProjects[target.key];
  if (!item) return '';
  const runs = item.runTimeline || [];
  const stats = item.cockpit?.diagnostics || {};
  const issues = Array.isArray(item.integrityAudit?.consistencyIssues) ? item.integrityAudit.consistencyIssues : [];
  const failed = runs.filter(run => String(run.status).toLowerCase() === 'failed');
  const rows = [
    '### ' + target.label + '：逐次调用与根因证据', '',
    '- 运行样本：' + runs.length + ' 条（最近 200 条上限，更早记录未包含）',
    '- 物理步骤指标样本：' + (stats.sample?.stepMetrics ?? 'unknown')
      + '；内部重试：' + (stats.internalRetryCount ?? 'unknown')
      + '；有效重试：' + (stats.effectiveRetryCount ?? 'unknown'),
    '- 指标累计耗时：' + (stats.totalDurationMs ?? 'unknown') + ' ms；Token：'
      + (stats.totalTokens ?? 'unknown') + '；首轮通过率：'
      + (stats.effectiveFirstPassRate ?? 'unknown'),
    '- 同版本元数据匹配运行组：' + (stats.exactDuplicateRunGroups ?? 'unknown')
      + '（仅提示需核对；后端未记录完整输入指纹，不能单凭此字段认定重复请求）',
    '- 已持久化对象：' + JSON.stringify(stats.persisted ?? {}),
    '- 创建停滞：' + (stats.creationStalled ?? 'unknown')
      + '；空闲毫秒：' + (stats.idleMs ?? 'unknown')
      + '；持久化不一致：' + JSON.stringify(stats.persistenceMismatch ?? [])
      + '；核验状态：' + (stats.persistenceStatus ?? '未知')
      + '；无法核实项：' + JSON.stringify(stats.persistenceUnknown ?? [])
      + '；查询错误：' + JSON.stringify(stats.persistenceQueryErrors ?? []),
    '- 完整性冲突：' + issues.length,
    '- 题材字段一致性：' + JSON.stringify(item.project?.fieldConsistency ?? {}),
    '- 题材审计隔离：' + JSON.stringify(item.project?.auditPlacement ?? {}), '',
    ...issues.slice(0, 35).map(issue =>
      '- 冲突：' + markdownCell(typeof issue === 'string' ? issue : JSON.stringify(issue), 1400)),
    '',
    '**步骤耗时分布（仅最近运行样本）**', '',
    '| 步骤 | 次数 | 非成功数 | 累计耗时 ms |', '|---|---:|---:|---:|',
    ...(item.stepBreakdown || []).slice(0, 35).map(step => '| ' +
      markdownCell(step.step) + ' | ' + step.calls + ' | ' + step.failures
      + ' | ' + step.durationMs + ' |'),
    '',
    '**生成调用时间线（含 Gate 和失败原因）**', '',
    '| Run ID | 阶段 | 状态 | 耗时 ms | Gate | 开始时间 | 原始错误摘录 |',
    '|---|---|---|---:|---|---|---|',
    ...runs.map(run => '| ' + markdownCell(run.id, 48) + ' | '
      + markdownCell(run.step_key ?? run.stepKey ?? run.stage ?? run.scenario) + ' | '
      + markdownCell(run.status, 30) + ' | ' + (run.durationMs ?? 0)
      + ' | ' + markdownCell(run.gateStatus, 35)
      + ' | ' + markdownCell(run.startedAt, 40) + ' | '
      + markdownCell(run.error, 450) + ' |'), '',
    '**失败调用详细错误（最多 40 条，每条最多 4000 字）**', '',
    ...(failed.length ? failed.slice(0, 40).map(run =>
      '- ' + markdownCell(run.id) + ' [' + markdownCell(run.stage ?? run.scenario) + '] '
      + markdownCell(run.error || run.failedOutputExcerpt || run.status, 4000))
      : ['- 无失败记录']), '',
    '**后端已识别的慢步骤与可能重复调用**', '',
    '~~~json',
    JSON.stringify({
      slowestSteps: stats.slowestSteps || [], sameVersionRunGroups: stats.exactDuplicateRuns || [],
      duplicateEvidenceLevel: 'same_stage_scenario_chapter_and_prompt_context_constitution_versions_only',
    }, null, 2),
    '~~~',
  ];
  return rows.join('\n');
}
function failedTestsMarkdown() {
  const failed = tests.filter(test => test.status !== 'passed');
  return '## 仓库测试失败日志\n\n' + (failed.length ? failed.map(test =>
    '### ' + test.label + '\n\n'
    + '- 退出码：' + test.exitCode + '；耗时：' + test.durationMs + ' ms\n\n'
    + '~~~text\n' + String(test.stdoutTail || '') + '\n'
    + String(test.stderrTail || '') + '\n~~~').join('\n\n')
    : '无失败测试；若未指定 --full，本轮未执行仓库测试。');
}
const detailedSections = !health.ok
  ? '## 详细运行诊断\n\nServer 不可用，无法取得现有的题材与项目生成日志。'
  : detailedIdeaMarkdown() + '\n## 项目生成调用明细\n\n'
    + projectTargets.map(detailedProjectMarkdown).filter(Boolean).join('\n\n');

const projectSections = !health.ok
  ? 'Server 不可用，项目、题材、Gate 与执行标准运行时检查均未执行；本报告只确认到服务连接这一层。'
  : projectTargets.length
  ? projectTargets.map(projectMarkdown).join('\n\n')
  : runFull
    ? '未找到可做最终验收的项目。请先让至少一个真实短篇和一个真实长篇进入 active，并完成第一章真实生成。'
    : '未找到任何项目。若刚才创建流程已经报错但这里仍为空，说明项目壳没有成功落库，请直接提供创建页错误信息和 Server 日志。';

const selectionLine = singleMode
  ? `single · ${legacyProjectId}`
  : `${selectionMode} · short=${shortProjectId ?? 'NOT_FOUND'} · long=${longProjectId ?? 'NOT_FOUND'}`;

const markdown = `# 本地验收报告\n\n生成时间：${now}\n\n## 总结\n\n- 模式：${runFull ? '最终完整验收' : '快速运行诊断'}\n- 最终结果：**${report.verdict.status.toUpperCase()}**\n- Git：${gitInfo.branch ?? 'unknown'} @ ${gitInfo.commit ?? 'unknown'}${gitInfo.dirty ? '（工作区有未提交改动）' : ''}\n- Server：${health.ok ? 'PASS' : 'UNAVAILABLE'}\n- 后端加载身份：${backendIdentity.loadedLocalRevision} · marker=${backendIdentity.diagnosticsMarkerStatus} · build=${backendIdentity.buildCommit ?? 'unknown'}\n- 执行标准：${standardLine}\n- 项目选择：${selectionLine}\n\n## 后端进程身份\n\n- API 实例：${backendIdentity.instanceId ?? 'unknown'}\n- 后端版本：${backendIdentity.buildVersion ?? 'unknown'}\n- 构建提交：${backendIdentity.buildCommit ?? 'unknown'}\n- 与本地提交一致：${backendIdentity.loadedLocalRevision}\n- 诊断标记：${backendIdentity.diagnosticsMarkerStatus}\n- 进程启动时间：${backendIdentity.processStartedAt ?? 'unknown'}\n\n## 项目验收\n\n${projectSections}\n\n${detailedSections}\n\n## 仓库测试\n\n${testLines}\n\n${failedTestsMarkdown()}\n\n## 运行问题\n\n${runtimeProblems.length ? runtimeProblems.map((x) => `- ${x}`).join('\n') : '- 无'}\n\n## 说明\n\n- 本报告只有执行 verify-local.mjs 后才会生成，并且每次覆盖 verification/latest.json 与 verification/latest.md，不叠加历史。\n- 不带 --full 是故障诊断：自动选择最近项目（包括 creating / generation_failed），不要求短篇和长篇同时存在；正常创建中的项目显示 IN_PROGRESS，只有无运行调用且超过诊断阈值无活动才标记 creation_stalled。\n- --full 是最终验收：自动选择最近 active 的一个短篇和一个长篇，并要求两本都至少完成第一章、generation run 成功且 Gate 通过。\n- 需要精确指定项目时仍可使用 --short-project <短篇ID> --long-project <长篇ID>；兼容单项目模式 --project <项目ID>。\n- 本报告只读取现有 generation_runs 与 cockpit 等接口，不等同于直接读取 Server 进程 stdout/stderr；若有独立服务端日志，可与 JSON 一并提供。\n- generation_runs 最多返回最近 200 条，较早历史需单独提供服务端日志或数据库备份；Markdown 中较长证据可能截断，JSON 保留接口返回的完整结构化数据。\n- Git/CI/数据库运行记录负责历史追溯；latest 报告只描述当前状态。\n`;

const mdPath = path.join(outDir, 'latest.md');
fs.writeFileSync(mdPath, markdown, 'utf8');

console.log(`[verify] ${report.verdict.status.toUpperCase()}`);
if (!health.ok) console.log('[verify] root cause: server_unavailable; downstream runtime diagnostics skipped');
if (dualMode) console.log(`[verify] projects short=${shortProjectId ?? 'NOT_FOUND'} long=${longProjectId ?? 'NOT_FOUND'} (${selectionMode})`);
console.log(`[verify] ${path.relative(root, jsonPath)}`);
console.log(`[verify] ${path.relative(root, mdPath)}`);
if (report.verdict.status !== 'passed') process.exitCode = 1;
