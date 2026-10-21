#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(root, 'verification', 'latest.json');
const previousReportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;

const core = spawnSync(
  process.execPath,
  [path.join(root, 'verify-local-core.mjs'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: process.env },
);

const currentReportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
const reportUpdated = currentReportText !== null && currentReportText !== previousReportText;
const coreStatus = typeof core.status === 'number' ? core.status : 1;
let guardStatus = 0;
let report = null;

function compactRun(run) {
  if (!run) return null;
  return {
    id: run.id ?? null,
    step: run.step_key ?? run.stepKey ?? run.stage ?? run.scenario ?? null,
    status: run.status ?? null,
    durationMs: run.durationMs ?? run.duration_ms ?? null,
    gateStatus: run.gateStatus ?? run.gate_status ?? null,
    startedAt: run.startedAt ?? run.started_at ?? null,
    finishedAt: run.finishedAt ?? run.finished_at ?? null,
    error: String(run.error || run.failedOutputExcerpt || '').slice(0, 2400) || null,
  };
}

function printDetailedReport(value) {
  const runtime = value?.runtime || {};
  const discovery = runtime.ideaDiscovery || {};
  const audit = discovery.audit || {};
  const trace = runtime.discoveryCallTrace || {};
  const poolEvidence = {
    available: discovery.available ?? null,
    error: discovery.error ?? null,
    success: audit.success ?? null,
    requested: audit.requested ?? null,
    selected: audit.premiseSelected ?? null,
    qualified: audit.qualified ?? null,
    returned: audit.returned ?? null,
    poolSize: audit.premisePoolSize ?? null,
    poolTarget: audit.premisePoolTarget ?? null,
    stoppedAt: audit.stoppedAt ?? null,
    stopReason: audit.stopReason ?? null,
    phaseDurationsMs: audit.phaseDurationsMs ?? null,
    preselectionDurationsMs: audit.preselectionDurationsMs ?? null,
    preselectionBudgets: audit.preselectionBudgets ?? null,
    selectionAudit: audit.selectionAudit ?? null,
    structuringErrors: audit.structuringErrors ?? null,
    candidateAssessments: audit.candidateAssessments ?? null,
    reasons: audit.reasons ?? null,
    fulfillment: audit.fulfillment ?? null,
  };

  console.log('[verify] 本次报告身份：' + JSON.stringify({
    generatedAt: value.generatedAt ?? null,
    command: value.command ?? null,
    git: value.git ?? null,
    options: value.options ?? null,
    verdict: value.verdict ?? null,
  }, null, 2));

  console.log('[verify] 灵感发现阶段与质量门证据：\n'
    + JSON.stringify(poolEvidence, null, 2).slice(0, 22000));

  console.log('[verify] 灵感发现实际调用时间线：\n' + JSON.stringify({
    source: trace.source ?? null,
    stepBreakdown: trace.stepBreakdown ?? [],
    runs: (Array.isArray(trace.runs) ? trace.runs : []).map(compactRun),
  }, null, 2).slice(0, 18000));

  const projectRows = runtime.projects && typeof runtime.projects === 'object'
    ? Object.entries(runtime.projects)
    : runtime.project ? [['project', runtime]] : [];
  const projectEvidence = Object.fromEntries(projectRows.map(([key, item]) => {
    const row = item || {};
    const diagnostics = row.cockpit?.diagnostics || {};
    const integrity = row.integrityAudit || {};
    const timeline = Array.isArray(row.runTimeline) ? row.runTimeline : [];
    return [key, {
      project: row.project ? {
        id: row.project.id ?? null,
        title: row.project.title ?? null,
        type: row.project.type ?? null,
        status: row.project.status ?? null,
        confirmedStoryPresent: row.project.confirmedStoryPresent ?? null,
      } : null,
      latestRun: compactRun(row.latestRun),
      firstChapterRun: compactRun(row.firstChapterRun),
      failedRuns: timeline.filter(run => String(run.status || '').toLowerCase() === 'failed')
        .slice(0, 12).map(compactRun),
      integrityAudit: {
        missingModules: integrity.missingModules ?? null,
        consistencyIssues: integrity.consistencyIssues ?? null,
        outlineBodyMappingValid: integrity.outlineBodyMappingValid ?? null,
        error: integrity.error ?? null,
      },
      creationDiagnostics: {
        creationStalled: diagnostics.creationStalled ?? null,
        idleMs: diagnostics.idleMs ?? null,
        persistenceMismatch: diagnostics.persistenceMismatch ?? null,
        persisted: diagnostics.persisted ?? null,
        slowestSteps: diagnostics.slowestSteps ?? null,
        exactDuplicateRuns: diagnostics.exactDuplicateRuns ?? null,
      },
    }];
  }));
  console.log('[verify] 项目创建、落库与失败步骤证据：\n'
    + JSON.stringify(projectEvidence, null, 2).slice(0, 18000));

  const failedTests = Array.isArray(value.tests) ? value.tests.filter(test => test.status !== 'passed') : [];
  if (failedTests.length) {
    console.error('[verify] 仓库测试失败详情（报告保留每个步骤最近120行输出）：');
    for (const test of failedTests.slice(0, 8)) {
      console.error('[verify] ' + test.label + ' exitCode=' + test.exitCode + ' durationMs=' + test.durationMs);
      const detail = [test.stdoutTail, test.stderrTail].filter(Boolean).join('\n');
      console.error(detail.slice(-12000) || '(该步骤未保留 stdout/stderr)');
    }
    if (failedTests.length > 8) console.error('[verify] 其余失败步骤见 verification/latest.json 与 latest.md。');
  }
}

if (reportUpdated) {
  try {
    report = JSON.parse(currentReportText);
  } catch (error) {
    console.error('[verify] 本次生成的 latest.json 无法解析：' + String(error));
  }

  const guard = spawnSync(
    process.execPath,
    [path.join(root, 'verify-local-guard.mjs'), reportPath],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  guardStatus = typeof guard.status === 'number' ? guard.status : 1;

  if (report) printDetailedReport(report);
}

if (!reportUpdated) {
  console.error('[verify] 本次未生成内容更新的 verification/latest.json；旧报告不能代表本次测试，请检查核心诊断进程的错误输出。');
}
process.exitCode = coreStatus !== 0 ? coreStatus : (reportUpdated ? guardStatus : 1);
