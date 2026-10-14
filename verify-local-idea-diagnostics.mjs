// Read-only formatter for the authoritative runtime idea-discovery audit.
// Never re-grade, regenerate or change any qualified story card here.
const list = (value) => Array.isArray(value) ? value : [];
const textOf = (value, limit = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const countOf = (value) => value === null || value === undefined || value === ''
  ? null
  : Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function analyzeIdeaDiscovery(snapshot) {
  if (snapshot?.available !== true || !snapshot?.audit) {
    return {
      available: false, reason: textOf(snapshot?.reason || snapshot?.error || '尚无灵感发现审计'),
      warning: '未取得本轮真实灵感审计；不能据此判断模型或质量 Gate 已通过。',
    };
  }
  const audit = snapshot.audit;
  const gate = audit.appealGate || {};
  const request = audit.request || {};
  const selected = countOf(gate.premiseSelected);
  const requested = countOf(gate.requested) ?? countOf(request.requestedCount) ?? null;
  const qualified = countOf(audit.qualifiedCount) ?? countOf(gate.qualified) ?? 0;
  const shortfall = countOf(audit.shortfallCount) ?? countOf(gate.shortfall)
    ?? (requested === null ? null : Math.max(0, requested - qualified));
  const selectionAudit = gate.selectionAudit || {};
  const selectionReasons = list(selectionAudit.reasons).map((reason) => ({
    id: textOf(reason?.premiseId || reason?.sourcePremiseId || reason?.id, 80),
    reason: textOf(typeof reason === 'string' ? reason : reason?.reason || reason?.message || reason?.issue, 1000),
    kind: textOf(reason?.kind || reason?.type, 100),
  })).filter((item) => item.reason);
  const structuringErrors = list(gate.structuringErrors).map((item) => ({
    premiseId: textOf(item?.sourcePremiseId, 100),
    error: textOf(item?.error, 1600),
  })).filter((item) => item.error);
  const candidates = list(gate.candidateAssessments).map((item) => ({
    premiseId: textOf(item?.sourcePremiseId, 100),
    title: textOf(item?.title, 150),
    attempt: textOf(item?.attempt, 50),
    passed: item?.passed === true,
    hasStructuredCard: Boolean(item?.candidate && typeof item.candidate === 'object' && !Array.isArray(item.candidate)),
    issues: list(item?.issues).map((issue) => textOf(issue, 1200)).filter(Boolean),
    warnings: list(item?.warnings).map((warning) => textOf(warning, 1200)).filter(Boolean),
    evidence: item?.passed === true ? null : {
      hook: textOf(item?.candidate?.hook, 1000),
      description: textOf(item?.candidate?.description, 1600),
      coreConflict: textOf(item?.candidate?.coreConflict, 1000),
      mainReversal: textOf(item?.candidate?.mainReversal, 1000),
    },
  }));
  const failedCandidates = candidates.filter((item) => !item.passed && item.hasStructuredCard);
  const stageSignals = [];
  if (requested !== null && selected !== null && selected < requested) stageSignals.push('前置筛选未选足');
  if (selectionReasons.length) stageSignals.push('前置筛选复核不通过');
  if (structuringErrors.length) stageSignals.push('逐题材结构化异常');
  if (failedCandidates.length) stageSignals.push('完整卡审查不通过');
  if (gate.repairError) stageSignals.push('局部修复调用或协议异常');
  if (audit.success === false && stageSignals.length === 0) stageSignals.push('批次失败，审计尚未定位到具体环节');
  return {
    available: true,
    generatedAt: audit.generatedAt || snapshot.updatedAt || null,
    success: audit.success === true,
    error: textOf(audit.error, 1800),
    counts: {
      requested, poolTarget: countOf(gate.premisePoolTarget),
      poolActual: countOf(gate.premisePoolSize), selected,
      structured: countOf(gate.generated), evaluatedAttempts: countOf(gate.evaluatedAttempts),
      qualified, delivered: countOf(audit.totalIdeas) ?? 0, shortfall,
    },
    stageSignals, selectionReasons, structuringErrors, candidates,
    timing: gate.timing && typeof gate.timing === 'object' ? gate.timing : audit.timing || null,
    reviewAttempts: gate.reviewAttempts || null,
    repair: {
      attempted: gate.repairAttempted === true,
      generated: countOf(gate.repairGenerated),
      error: textOf(gate.repairError, 1600),
    },
    gateReasons: list(gate.reasons).map((item) => textOf(item, 1000)).filter(Boolean),
    note: '阶段信号由真实审计字段汇总，不等于因果根因已被独立证明；完整原始证据仍在 runtime.ideaDiscovery。',
  };
}

export function renderIdeaDiscoveryDetails(analysis) {
  if (!analysis?.available) {
    return '## 灵感生成详细诊断\n\n- 未取得审计：' + textOf(analysis?.reason || '无记录') +
      '\n- ' + textOf(analysis?.warning || '未执行', 400);
  }
  const c = analysis.counts;
  const shown = (n) => n === null || n === undefined ? '未知' : String(n);
  const lines = [
    '## 灵感生成详细诊断',
    '',
    '- 本批状态：' + (analysis.success ? 'SUCCESS（整批已完成）' : 'FAILED / INCOMPLETE（整批未完成）'),
    '- 审计时间：' + (analysis.generatedAt || '未知'),
    '- 数量链：请求 ' + shown(c.requested) + ' → 题材池 ' + shown(c.poolActual) + '/' +
      shown(c.poolTarget) + ' → 已选 ' + shown(c.selected) + ' → 完整结构化 ' +
      shown(c.structured) + ' → Gate 合格 ' + shown(c.qualified) + ' → 整批交付 ' +
      shown(c.delivered) + '；缺额 ' + shown(c.shortfall),
    '- 可能出问题的阶段：' + (analysis.stageSignals.join('；') || '未发现已记录的失败阶段'),
  ];
  if (analysis.timing) {
    const tm = analysis.timing;
    const duration = (n) => Number.isFinite(Number(n)) ? (Number(n) / 1000).toFixed(1) + '秒' : '未知';
    lines.push('- 总耗时：' + duration(tm.totalMs) + '；前置筛选及复核：' + duration(tm.preselectionMs)
      + '；逐卡结构化（并发墙钟）：' + duration(tm.structuringMs)
      + '；初次终审：' + duration(tm.initialFinalGateMs) + '；失败卡局部修复与复核：' + duration(tm.repairMs));
    for (const call of list(tm.cardCalls)) lines.push('  - 单卡模型调用 ' + textOf(call?.premiseId, 80)
      + '：' + duration(call?.durationMs) + ' · ' + textOf(call?.outcome, 20));
  } else lines.push('- 耗时拆分：旧版报告没有逐阶段计时；仅凭总等待时间不能判定是哪一环卡顿或重复。');
  if (analysis.error) lines.push('- 服务端批次错误：' + analysis.error);
  if (analysis.selectionReasons.length) {
    lines.push('', '### 前置题材筛选 / 独立复核');
    for (const item of analysis.selectionReasons) {
      lines.push('- ' + (item.id ? item.id + ' · ' : '') +
        (item.kind ? '[' + item.kind + '] ' : '') + item.reason);
    }
  }
  if (analysis.structuringErrors.length) {
    lines.push('', '### 单卡结构化错误');
    for (const item of analysis.structuringErrors) {
      lines.push('- ' + (item.premiseId || '未知题材') + '：' + item.error);
    }
  }
  const failed = analysis.candidates.filter((item) => !item.passed && item.hasStructuredCard);
  if (failed.length) {
    lines.push('', '### 逐题材 Gate 失败（按尝试记录）');
    for (const item of failed) {
      lines.push('- ' + (item.premiseId || '未知题材') + ' / ' +
        (item.attempt || '未知尝试') + ' / ' + (item.title || '未取得标题'));
      for (const issue of item.issues) lines.push('  - 阻断原因：' + issue);
      for (const warning of item.warnings) lines.push('  - 提醒（非阻断）：' + warning);
      if (item.evidence?.hook) lines.push('  - 钩子证据：' + textOf(item.evidence.hook, 600));
      if (item.evidence?.coreConflict) lines.push('  - 冲突证据：' + textOf(item.evidence.coreConflict, 450));
      if (item.evidence?.mainReversal) lines.push('  - 反转证据：' + textOf(item.evidence.mainReversal, 450));
      if (item.evidence?.description) lines.push('  - 概要证据：' + textOf(item.evidence.description, 800));
    }
  }
  if (analysis.gateReasons.length) {
    lines.push('', '### 最终缺额原因汇总');
    for (const reason of analysis.gateReasons) lines.push('- ' + reason);
  }
  if (analysis.repair.attempted || analysis.repair.error) {
    lines.push('', '### 定向修复');
    lines.push('- 是否尝试：' + (analysis.repair.attempted ? '是' : '否') +
      '；返回补丁数：' + shown(analysis.repair.generated));
    if (analysis.repair.error) lines.push('- 修复错误：' + analysis.repair.error);
  }
  if (!analysis.success && !failed.length && !analysis.selectionReasons.length && !analysis.structuringErrors.length) {
    lines.push('', '- 尚未取得细粒度失败证据。检查下方项目生成记录和 Server 运行日志，不要按“内容质量不佳”擅自归因。');
  }
  lines.push('', '> ' + analysis.note);
  return lines.join('\n');
}
