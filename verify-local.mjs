#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalizeIdeaDiscoveryAudit, redactDiagnosticText } from './verify-local-diagnostics.mjs';

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
    id: run.id ?? null, runId: run.runId ?? run.run_id ?? null,
    step: run.step_key ?? run.stepKey ?? run.stage ?? run.scenario ?? null,
    status: run.status ?? null, durationMs: run.durationMs ?? run.duration_ms ?? null,
    internalRetries: run.internalRetries ?? run.internal_retries ?? 0,
    physicalAttempts: run.physicalAttempts ?? (1 + Number(run.internal_retries ?? 0)),
    totalTokens: run.totalTokens ?? run.total_tokens ?? null,
    gateStatus: run.gateStatus ?? run.gate_status ?? null,
    startedAt: run.startedAt ?? run.started_at ?? null, finishedAt: run.finishedAt ?? run.finished_at ?? null,
    error: run.error == null ? null : redactDiagnosticText(run.error),
  };
}

function printDetailedReport(value) {
  const runtime = value?.runtime || {};
  const audit = normalizeIdeaDiscoveryAudit(runtime.ideaDiscovery || {});
  const trace = runtime.discoveryCallTrace || {};
  const calls = Array.isArray(trace.runs) ? trace.runs : [];
  const poolEvidence = {
    available: audit.available, discoveryRequestId: audit.discoveryRequestId,
    updatedAt: audit.updatedAt, startedAt: audit.startedAt, finishedAt: audit.finishedAt,
    request: audit.request, success: audit.success, requested: audit.requested,
    premisePoolTarget: audit.premisePoolTarget, premisePoolSize: audit.premisePoolSize,
    premiseSelected: audit.premiseSelected, generated: audit.generated, qualified: audit.qualified,
    returned: audit.returned, shortfall: audit.shortfall, minimumDeliverableCount: audit.minimumDeliverableCount,
    stopReason: audit.stopReason, error: audit.error, qualityWarning: audit.qualityWarning,
    poolGeneration: audit.poolGeneration, phaseTimings: audit.phaseTimings,
    candidatePool: audit.candidatePool, preselectedPremises: audit.preselectedPremises,
    candidateAssessments: audit.candidateAssessments,
    sourceReviewReuse: audit.selectionAudit?.initialReview?.sourceReviewReuse ?? audit.selectionAudit?.sourceReviewReuse ?? null,
    acceptedIdeaSourceIds: audit.acceptedIdeas.map(idea => idea?.sourcePremiseId ?? null),
  };
  const callEvidence = {
    source: trace.source ?? null, totals: trace.totals ?? null,
    phaseBreakdown: trace.phaseBreakdown ?? [], stepBreakdown: trace.stepBreakdown ?? [],
    sameVersionCallGroups: trace.sameVersionCallGroups ?? [],
    duplicateClassification: '按 stepKey 与版本元数据分组，不是实际输入指纹；需核对 Run ID 和时间窗',
    callTimeline: calls.slice(0, 50).map(compactRun), omittedCallRows: Math.max(0, calls.length - 50),
  };
  const projectRows = runtime.projects && typeof runtime.projects === 'object'
    ? Object.entries(runtime.projects) : runtime.project ? [['project', runtime]] : [];
  const projectEvidence = Object.fromEntries(projectRows.map(([key, item]) => {
    const row = item || {};
    const diagnostics = row.cockpit?.diagnostics || {};
    const integrity = row.integrityAudit || {};
    const timeline = Array.isArray(row.runTimeline) ? row.runTimeline : [];
    return [key, {
      project: row.project ? {
        id: row.project.id ?? null, title: row.project.title ?? null, type: row.project.type ?? null,
        status: row.project.status ?? null, confirmedStoryPresent: row.project.confirmedStoryPresent ?? null,
      } : null,
      latestRun: compactRun(row.latestRun), firstChapterRun: compactRun(row.firstChapterRun),
      failedRuns: timeline.filter(run => String(run.status || '').toLowerCase() === 'failed').slice(0, 12).map(compactRun),
      integrityAudit: {
        missingModules: integrity.missingModules ?? null, consistencyIssues: integrity.consistencyIssues ?? null,
        outlineBodyMappingValid: integrity.outlineBodyMappingValid ?? null, error: integrity.error ?? null,
      },
      creationDiagnostics: {
        creationStalled: diagnostics.creationStalled ?? null, idleMs: diagnostics.idleMs ?? null,
        persistenceStatus: diagnostics.persistenceStatus ?? null, persistenceMismatch: diagnostics.persistenceMismatch ?? null,
        pendingPersistenceMismatch: diagnostics.pendingPersistenceMismatch ?? null,
        persistenceUnknown: diagnostics.persistenceUnknown ?? null, persistenceQueryErrors: diagnostics.persistenceQueryErrors ?? null,
        persisted: diagnostics.persisted ?? null, slowestSteps: diagnostics.slowestSteps ?? null,
        sameVersionRunGroupCount: diagnostics.exactDuplicateRunGroups ?? null,
        sameVersionRunGroups: diagnostics.exactDuplicateRuns ?? null,
        duplicateClassification: '后端按阶段/场景/章节与 prompt/context/constitution 版本分组，不代表输入完全相同',
      },
    }];
  }));
  console.log('[verify] 本次报告身份：' + JSON.stringify({
    verificationRunId: value.verificationRunId ?? null, generatedAt: value.generatedAt ?? null,
    command: value.command ?? null, git: value.git ?? null, options: value.options ?? null, verdict: value.verdict ?? null,
  }, null, 2));
  console.log('[verify] 灵感发现阶段与质量门证据：\n' + JSON.stringify(poolEvidence, null, 2).slice(0, 26000));
  console.log('[verify] 灵感发现实际调用时间线：\n' + JSON.stringify(callEvidence, null, 2).slice(0, 22000));
  console.log('[verify] 诊断警告：\n' + JSON.stringify(runtime.diagnosticWarnings ?? [], null, 2));
  console.log('[verify] 项目创建、落库与失败步骤证据：\n' + JSON.stringify(projectEvidence, null, 2).slice(0, 20000));
  const failedTests = Array.isArray(value.tests) ? value.tests.filter(test => test.status !== 'passed') : [];
  if (failedTests.length) {
    console.error('[verify] 仓库测试失败详情（报告保留每个步骤最近120行输出）：');
    for (const test of failedTests.slice(0, 8)) {
      console.error('[verify] ' + test.label + ' exitCode=' + test.exitCode + ' durationMs=' + test.durationMs);
      const detail = [test.stdoutTail, test.stderrTail].filter(Boolean).join('\n');
      console.error(redactDiagnosticText(detail.slice(-12000)) || '(该步骤未保留 stdout/stderr)');
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

  if (report) {
    try {
      // The guard is authoritative for persistence and terminal project status. Reload its
      // result before printing, otherwise console output can contradict latest.json/latest.md.
      report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (error) {
      console.error('[verify] Guard 核验后的 latest.json 无法读取：' + String(error));
      report = null;
      guardStatus = 1;
    }
  }
  if (report) printDetailedReport(report);
}

if (!reportUpdated) {
  console.error('[verify] 本次未生成内容更新的 verification/latest.json；旧报告不能代表本次测试，请检查核心诊断进程的错误输出。');
}
process.exitCode = coreStatus !== 0 ? coreStatus : (reportUpdated ? guardStatus : 1);
