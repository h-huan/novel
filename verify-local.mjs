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


/** Classify only evidence actually returned by the current verification run.
 * Missing server data is unknown, not a successful zero-call/zero-defect result. */
function triageThreeIssues(report) {
  const runtime = report?.runtime || {};
  const serverReady = runtime.health?.ok === true;
  const audit = normalizeIdeaDiscoveryAudit(runtime.ideaDiscovery || {});
  const trace = runtime.discoveryCallTrace || {};
  const metricsAvailable = trace.source?.ok === true;
  const phases = Array.isArray(trace.phaseBreakdown) ? trace.phaseBreakdown : [];
  const projectMap = runtime.projects && typeof runtime.projects === 'object' ? runtime.projects : {};
  const projects = Object.entries(projectMap).map(([key, item]) => {
    const runs = Array.isArray(item?.runTimeline) ? item.runTimeline : [];
    const failed = runs.filter(run => String(run?.status || '').toLowerCase() === 'failed');
    return {
      key, projectId: item?.project?.id ?? null, status: item?.project?.status ?? null,
      observedRunCount: runs.length, failedRunCount: failed.length,
      recentFailedRuns: failed.slice(0, 15).map(compactRun),
      consistencyIssues: item?.integrityAudit?.consistencyIssues ?? null,
      creationStalled: item?.cockpit?.diagnostics?.creationStalled ?? null,
      persistenceMismatch: item?.cockpit?.diagnostics?.persistenceMismatch ?? null,
    };
  });
  return {
    schemaVersion: 1,
    prerequisite: {
      apiBaseUrl: report?.options?.baseUrl ?? null,
      serverReachable: serverReady,
      healthError: runtime.health?.error ?? null,
      backendLoadedRevision: runtime.backendIdentity?.loadedLocalRevision ?? 'unknown',
      localGitDirty: report?.git?.dirty ?? null,
      serverStartupStderrCollected: false,
    },
    ideaLatency: {
      evidenceStatus: !serverReady ? 'not_collected_server_unavailable' : !audit.available ? 'no_saved_idea_audit' : 'saved_audit_available',
      requestId: audit.discoveryRequestId ?? null, startedAt: audit.startedAt ?? null, finishedAt: audit.finishedAt ?? null,
      wallMs: audit.startedAt && audit.finishedAt
        ? Math.max(0, Date.parse(audit.finishedAt) - Date.parse(audit.startedAt)) || null : null,
      callMetricsAvailable: metricsAvailable,
      callsUnobserved: !metricsAvailable,
      totals: metricsAvailable ? trace.totals ?? null : null,
      slowestRecordedPhases: metricsAvailable
        ? [...phases].sort((a,b)=>Number(b.wallMs ?? b.sumDurationMs ?? 0)-Number(a.wallMs ?? a.sumDurationMs ?? 0)).slice(0,8)
        : [],
      limitation: metricsAvailable ? '阶段指标反映已存储的调用；同版本分组不是实际相同输入的证明。'
        : '模型调用指标未获取，不能将空数组视为0次调用。',
    },
    ideaCount: {
      evidenceStatus: !serverReady ? 'not_collected_server_unavailable' : !audit.available ? 'no_saved_idea_audit' : 'saved_audit_available',
      requested: audit.available ? audit.requested ?? null : null,
      returned: audit.available ? audit.returned ?? null : null,
      shortfall: audit.available ? audit.shortfall ?? null : null,
      stopReason: audit.available ? audit.stopReason ?? null : null,
      qualified: audit.available ? audit.qualified ?? null : null,
      acceptedIds: audit.available ? audit.acceptedIdeas.map(idea => idea?.sourcePremiseId ?? null) : [],
      limitation: '只统计服务端最后一批质量门结果；桌面端补齐后的合并显示数不在本次后端审计中。',
    },
    creationConsistency: {
      evidenceStatus: !serverReady ? 'not_collected_server_unavailable'
        : projects.length === 0 ? 'no_project_runtime_snapshot' : 'project_runtime_snapshot_available',
      projects,
      limitation: '失败运行仅来自现存指标与项目审计，不包括未提供的独立后端 stdout/stderr。',
    },
    missingEvidence: [
      ...(!serverReady ? ['启动并验证当前 http 健康检查；需提供服务端启动错误输出与运行身份，否则三个问题的实时链路均不可判定。'] : []),
      ...(serverReady && !audit.available ? ['缺少最近一次灵感请求审计；实际执行发现后再验收。'] : []),
      ...(serverReady && !metricsAvailable ? ['缺少灵感生成逐步模型指标与请求关联证据；不能计算实际模型耗时、重试次数。'] : []),
      ...(serverReady && projects.length === 0 ? ['缺少项目创建运行记录；需要失败项目的生成运行与完整性审计。'] : []),
      ...(report?.git?.dirty ? ['本地工作区有未提交修改，Git HEAD 不能代表本轮实际运行源码；需要提供 git diff。'] : []),
    ],
  };
}

function threeIssueMarkdown(triage) {
  const show = value => value === null || value === undefined ? '未知（未取得）' : String(value);
  const latency = triage.ideaLatency, count = triage.ideaCount, creation = triage.creationConsistency;
  return [
    '## 三项问题专项取证状态',
    '',
    '- 服务可达：' + (triage.prerequisite.serverReachable ? '是' : '否')
      + '；健康检查：' + show(triage.prerequisite.healthError)
      + '；后端修订匹配：' + show(triage.prerequisite.backendLoadedRevision),
    '- ① 灵感耗时：' + latency.evidenceStatus + '；墙钟毫秒：' + show(latency.wallMs)
      + '；调用指标：' + (latency.callMetricsAvailable ? '已采集' : '未采集（不能记为0）'),
    '- ② 题材数量：' + count.evidenceStatus + '；请求：' + show(count.requested)
      + '；合格返回：' + show(count.returned) + '；缺额：' + show(count.shortfall)
      + '；补足停止原因：' + show(count.stopReason),
    '- ③ 创建一致性：' + creation.evidenceStatus + '；采集项目：' + creation.projects.length
      + '；失败运行数：' + (creation.projects.length ? creation.projects.reduce((n,p)=>n+p.failedRunCount,0) : '未知（未取得）'),
    '',
    '### 尚缺的证据与本轮判定边界',
    ...(triage.missingEvidence.length ? triage.missingEvidence.map(item=>'- '+item) : ['- 三项问题的实际证据见下方运行审计；不能仅凭类型检查/构建通过宣布生产验收通过。']),
    '',
  ].join('\n');
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
  console.log('[verify] 三项问题专项取证：\n' + JSON.stringify(runtime.threeIssueTriage ?? null, null, 2));
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

  // Preserve the scoped diagnostic snapshot in the same latest.json the guard validates.
  if (report) {
    report.runtime = report.runtime || {};
    report.runtime.threeIssueTriage = triageThreeIssues(report);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
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
  if (report) {
    // The core recreates latest.md each run; add only this verification's evidence before Guard.
    const markdownPath = path.join(root, 'verification', 'latest.md');
    if (fs.existsSync(markdownPath)) {
      const markdown = fs.readFileSync(markdownPath, 'utf8');
      const section = threeIssueMarkdown(report.runtime?.threeIssueTriage || triageThreeIssues(report));
      const separator = '\n## Verification Guard\n';
      const pos = markdown.indexOf(separator);
      const updated = pos >= 0
        ? markdown.slice(0,pos).trimEnd() + '\n\n' + section + '\n' + markdown.slice(pos)
        : markdown.trimEnd() + '\n\n' + section + '\n';
      fs.writeFileSync(markdownPath, updated, 'utf8');
    }
    printDetailedReport(report);
  }
}

if (!reportUpdated) {
  console.error('[verify] 本次未生成内容更新的 verification/latest.json；旧报告不能代表本次测试，请检查核心诊断进程的错误输出。');
}
process.exitCode = coreStatus !== 0 ? coreStatus : (reportUpdated ? guardStatus : 1);
