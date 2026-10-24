const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function redactDiagnosticText(value) {
  return String(value ?? '')
    .replace(/(authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1 [REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi, '$1[REDACTED]')
    .replace(/([?&](?:api[_-]?key|access_token|refresh_token|token|secret|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(--(?:api-key|token|password|secret)\s+)[^\s]+/gi, '$1[REDACTED]')
    .slice(0, 4000);
}

export function redactDiagnosticValue(value, key = '') {
  const normalizedKey = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (/(?:apikey|accesstoken|refreshtoken|authorization|password|clientsecret|credential|secret)$/.test(normalizedKey)) return '[REDACTED]';
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map(item => redactDiagnosticValue(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey, redactDiagnosticValue(childValue, childKey),
  ]));
  return value;
}

/** A reachable HTTP port is not sufficient evidence that the correct backend is ready.
 * The same result object feeds all existing runtime/guard checks. */
export function validateBackendHealth(response) {
  if (!response || response.ok !== true) {
    return {
      ...(response || {}), ok: false,
      error: response?.error ?? (response?.status == null ? '健康接口无法访问' : `HTTP ${response.status}`),
      data: response?.data ?? null,
    };
  }
  const data = isRecord(response.data?.data) ? response.data.data : response.data;
  if (!isRecord(data) || data.status !== 'ok') {
    return {
      ...response, ok: false,
      error: `健康接口没有返回 status=ok（实际：${String(data?.status ?? 'missing')}）`,
    };
  }
  return response;
}

/** API recovery diagnostics place the audit in {success,audit}; retain metadata
 * but expose the actual completeness fields to the existing guard and report. */
export function normalizeProjectIntegrityAudit(value) {
  const root = isRecord(value?.data) ? value.data : value;
  if (!isRecord(root)) return root;
  return isRecord(root.audit) ? { ...root, ...root.audit } : root;
}

export function normalizeIdeaDiscoveryAudit(value) {
  const root = isRecord(value?.data) ? value.data : (isRecord(value) ? value : {});
  const envelope = isRecord(root.audit) ? root.audit : root;
  const gate = isRecord(envelope.appealGate) ? envelope.appealGate
    : isRecord(root.appealGate) ? root.appealGate : envelope;
  const request = isRecord(envelope.request) ? envelope.request : isRecord(root.request) ? root.request : {};
  const selectionAudit = isRecord(gate.selectionAudit) ? gate.selectionAudit
    : isRecord(envelope.selectionAudit) ? envelope.selectionAudit : null;
  const poolGeneration = selectionAudit?.poolGeneration ?? gate.poolGeneration ?? null;
  const phaseTimings = selectionAudit?.phaseTimings ?? gate.phaseTimings ?? null;
  const acceptedIdeas = Array.isArray(envelope.acceptedIdeas) ? envelope.acceptedIdeas : [];
  const requested = gate.requested ?? request.requestedCount ?? request.count ?? null;
  const returned = gate.returned ?? envelope.totalIdeas ?? (Array.isArray(envelope.acceptedIdeas) ? acceptedIdeas.length : null);
  const available = typeof root.available === 'boolean'
    ? root.available : Boolean(root.audit || root.appealGate || root.schemaVersion || root.success !== undefined);
  const shortfall = gate.shortfall ?? (
    requested !== null && requested !== undefined && returned !== null && returned !== undefined
      && Number.isFinite(Number(requested)) && Number.isFinite(Number(returned))
      ? Math.max(0, Number(requested) - Number(returned)) : null
  );
  return {
    available, updatedAt: root.updatedAt ?? envelope.generatedAt ?? null,
    discoveryRequestId: envelope.discoveryRequestId ?? null,
    startedAt: envelope.startedAt ?? null,
    finishedAt: envelope.finishedAt ?? envelope.generatedAt ?? root.updatedAt ?? null,
    request: {
      requestedCount: request.requestedCount ?? request.count ?? requested,
      platform: request.platform ?? null, storyType: request.storyType ?? null,
      storyCategory: request.storyCategory ?? null, targetAudience: request.targetAudience ?? null,
      webNovelGenre: request.webNovelGenre ?? null,
    },
    success: envelope.success ?? gate.success ?? root.success ?? null,
    totalIdeas: envelope.totalIdeas ?? null, requested,
    premisePoolTarget: gate.premisePoolTarget ?? poolGeneration?.target ?? null,
    premisePoolSize: gate.premisePoolSize ?? poolGeneration?.actual ?? poolGeneration?.generated ?? null,
    premiseSelected: gate.premiseSelected ?? (Array.isArray(gate.preselectedPremises) ? gate.preselectedPremises.length : null),
    generated: gate.generated ?? gate.generatedCount ?? null,
    qualified: gate.qualified ?? gate.qualifiedCount ?? null,
    returned, shortfall, minimumDeliverableCount: gate.minimumDeliverableCount ?? null,
    stopReason: gate.fulfillment?.stopReason ?? gate.stopReason ?? (Array.isArray(gate.reasons) ? gate.reasons[0] : null),
    error: envelope.error ?? root.error ?? null, qualityWarning: envelope.qualityWarning ?? root.qualityWarning ?? null,
    poolGeneration, phaseTimings, selectionAudit,
    candidatePool: Array.isArray(gate.candidatePool) ? gate.candidatePool : [],
    preselectedPremises: Array.isArray(gate.preselectedPremises) ? gate.preselectedPremises : [],
    candidateAssessments: Array.isArray(gate.candidateAssessments) ? gate.candidateAssessments : [],
    acceptedIdeas, gate, envelope,
  };
}

export function discoveryStepMetricDetail(row = {}) {
  const numeric = value => value === null || value === undefined || value === ''
    ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const internalRetries = Math.max(0, numeric(row.internal_retries ?? row.internalRetries) ?? 0);
  const stepKey = row.step_key ?? row.stepKey ?? row.stage ?? 'unknown';
  return {
    id: row.id ?? row.run_id ?? null, metricId: row.id ?? null, runId: row.run_id ?? null,
    projectId: row.project_id ?? null, chapterIndex: row.chapter_index ?? null,
    stage: row.stage ?? null, scenario: row.scenario ?? null, stepKey, step_key: stepKey,
    status: row.status ?? null, attempt: numeric(row.attempt), phase: row.phase ?? null,
    durationMs: numeric(row.duration_ms ?? row.durationMs), internalRetries, physicalAttempts: 1 + internalRetries,
    totalTokens: numeric(row.total_tokens ?? row.totalTokens), model: row.model_version ?? row.model ?? null,
    startedAt: row.started_at ?? row.startedAt ?? null,
    finishedAt: row.finished_at ?? row.finishedAt ?? row.created_at ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    gateStatus: row.gate_status ?? row.gateStatus ?? null,
    promptVersion: row.prompt_version ?? row.promptVersion ?? null,
    contextVersion: row.context_version ?? row.contextVersion ?? null,
    constitutionRevision: row.constitution_revision ?? row.constitutionRevision ?? null,
    error: row.fail_reason == null && row.error == null ? null : redactDiagnosticText(row.fail_reason ?? row.error),
  };
}

function phaseForStep(stepKey) {
  if (stepKey === 'idea_premise_pool_generation') return 'candidate_pool_generation';
  if (stepKey === 'idea_premise_selection') return 'fixed_pool_selection';
  if (stepKey.startsWith('idea_premise_')) return 'preselection_review_reselection';
  if (stepKey === 'idea_card_structure') return 'complete_card_generation';
  if (stepKey.startsWith('idea_presentation_')) return 'complete_card_review';
  if (stepKey === 'idea_card_local_repair') return 'targeted_card_repair';
  return 'other';
}

function aggregateMetrics(runs, keyFn) {
  const groups = new Map();
  for (const run of runs) {
    const key = keyFn(run) || 'unknown';
    let group = groups.get(key);
    if (!group) {
      group = { key, calls: 0, failedCalls: 0, internalRetries: 0, physicalAttempts: 0, sumDurationMs: 0,
        totalTokens: 0, hasTokenCount: false, firstStartMs: null, lastFinishMs: null, runIds: [] };
      groups.set(key, group);
    }
    group.calls += 1;
    if (String(run.status ?? '').toLowerCase() !== 'success') group.failedCalls += 1;
    group.internalRetries += run.internalRetries;
    group.physicalAttempts += run.physicalAttempts;
    group.sumDurationMs += run.durationMs ?? 0;
    if (run.totalTokens !== null) { group.totalTokens += run.totalTokens; group.hasTokenCount = true; }
    const start = run.startedAt ? Date.parse(run.startedAt) : NaN;
    const finish = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
    if (Number.isFinite(start)) group.firstStartMs = group.firstStartMs === null ? start : Math.min(group.firstStartMs, start);
    if (Number.isFinite(finish)) group.lastFinishMs = group.lastFinishMs === null ? finish : Math.max(group.lastFinishMs, finish);
    if (run.runId) group.runIds.push(run.runId);
  }
  return [...groups.values()].map(group => ({
    key: group.key, calls: group.calls, failedCalls: group.failedCalls, internalRetries: group.internalRetries,
    physicalAttempts: group.physicalAttempts, sumDurationMs: group.sumDurationMs,
    wallMs: group.firstStartMs !== null && group.lastFinishMs !== null ? Math.max(0, group.lastFinishMs - group.firstStartMs) : null,
    totalTokens: group.hasTokenCount ? group.totalTokens : null, runIds: group.runIds,
  })).sort((a, b) => a.key > b.key ? 1 : a.key < b.key ? -1 : 0);
}

export function summarizeDiscoveryStepMetrics(rows) {
  const runs = (Array.isArray(rows) ? rows : []).map(discoveryStepMetricDetail).sort((a, b) => {
    const left = Date.parse(a.startedAt ?? a.createdAt ?? '') || 0;
    const right = Date.parse(b.startedAt ?? b.createdAt ?? '') || 0;
    return left - right;
  });
  const stepBreakdown = aggregateMetrics(runs, run => run.stepKey).map(group => ({ stepKey: group.key, ...group, key: undefined }));
  const phaseBreakdown = aggregateMetrics(runs, run => phaseForStep(run.stepKey)).map(group => ({ phase: group.key, ...group, key: undefined }));
  const duplicateMap = new Map();
  for (const run of runs) {
    if (!run.promptVersion && !run.contextVersion && run.constitutionRevision === null) continue;
    const key = [run.projectId ?? '', run.scenario ?? '', run.stepKey, run.promptVersion ?? '', run.contextVersion ?? '', run.constitutionRevision ?? '', run.chapterIndex ?? ''].join('\u001f');
    let group = duplicateMap.get(key);
    if (!group) {
      group = { stepKey: run.stepKey, promptVersion: run.promptVersion, contextVersion: run.contextVersion,
        constitutionRevision: run.constitutionRevision, chapterIndex: run.chapterIndex, runIds: [], attempts: [] };
      duplicateMap.set(key, group);
    }
    if (run.runId) group.runIds.push(run.runId);
    group.attempts.push(run.attempt);
  }
  const sameVersionCallGroups = [...duplicateMap.values()].filter(group => group.runIds.length > 1)
    .map(group => ({ ...group, count: group.runIds.length, evidenceLevel: 'same_version_metadata_only_not_exact_input_fingerprint' }));
  const starts = runs.map(run => Date.parse(run.startedAt ?? '')).filter(Number.isFinite);
  const finishes = runs.map(run => Date.parse(run.finishedAt ?? '')).filter(Number.isFinite);
  const tokens = runs.filter(run => run.totalTokens !== null);
  return {
    runs, stepBreakdown, phaseBreakdown, sameVersionCallGroups,
    totals: {
      logicalCalls: runs.length,
      failedCalls: runs.filter(run => String(run.status ?? '').toLowerCase() !== 'success').length,
      internalRetries: runs.reduce((sum, run) => sum + run.internalRetries, 0),
      physicalAttempts: runs.reduce((sum, run) => sum + run.physicalAttempts, 0),
      sumDurationMs: runs.reduce((sum, run) => sum + (run.durationMs ?? 0), 0),
      wallMs: starts.length && finishes.length ? Math.max(0, Math.max(...finishes) - Math.min(...starts)) : null,
      totalTokens: tokens.length ? tokens.reduce((sum, run) => sum + run.totalTokens, 0) : null,
    },
  };
}
