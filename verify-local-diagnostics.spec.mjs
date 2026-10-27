import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdeaDiscoveryAudit, summarizeDiscoveryStepMetrics, redactDiagnosticValue, validateBackendHealth, normalizeProjectIntegrityAudit, summarizeRecentIdeaActivity } from './verify-local-diagnostics.mjs';

test('normalizes the nested saved idea-discovery audit and partial-card counts', () => {
  const audit = normalizeIdeaDiscoveryAudit({
    available: true, updatedAt: '2026-10-22T07:00:04.000Z',
    audit: {
      schemaVersion: 1, discoveryRequestId: 'discovery-1',
      startedAt: '2026-10-22T07:00:00.000Z', finishedAt: '2026-10-22T07:00:04.000Z',
      request: { requestedCount: 5, platform: 'fanqie', storyType: 'short_story', storyCategory: '悬疑' },
      success: true, totalIdeas: 4, acceptedIdeas: [{ sourcePremiseId: 'P2' }, { sourcePremiseId: 'P5' }],
      appealGate: {
        premisePoolTarget: 15, premisePoolSize: 8, premiseSelected: 5, generated: 5, qualified: 4,
        returned: 4, shortfall: 1, minimumDeliverableCount: 3,
        selectionAudit: { poolGeneration: { target: 15, generated: 8, shortfall: 7, duplicateCount: 2 }, phaseTimings: { poolGenerationWallMs: 1000, selectionWallMs: 500 } },
      },
    },
  });
  assert.equal(audit.available, true);
  assert.equal(audit.discoveryRequestId, 'discovery-1');
  assert.equal(audit.requested, 5);
  assert.equal(audit.premisePoolTarget, 15);
  assert.equal(audit.premisePoolSize, 8);
  assert.equal(audit.premiseSelected, 5);
  assert.equal(audit.qualified, 4);
  assert.equal(audit.returned, 4);
  assert.equal(audit.shortfall, 1);
  assert.equal(audit.poolGeneration.duplicateCount, 2);
  assert.equal(audit.phaseTimings.selectionWallMs, 500);
});

test('reports logical calls, physical attempts, phase wall time and same-version call groups without claiming exact duplicates', () => {
  const rows = [
    { id: 'm1', run_id: 'r1', step_key: 'idea_premise_pool_generation', scenario: 'idea_generate', status: 'success', attempt: 0, duration_ms: 100, internal_retries: 1, total_tokens: 500, model_version: 'deepseek-flash', started_at: '2026-10-22T07:00:00.000Z', finished_at: '2026-10-22T07:00:00.100Z', created_at: '2026-10-22T07:00:00.100Z', prompt_version: 'p1', context_version: 'c1', constitution_revision: 1 },
    { id: 'm2', run_id: 'r2', step_key: 'idea_premise_pool_generation', scenario: 'idea_generate', status: 'success', attempt: 1, duration_ms: 200, internal_retries: 0, total_tokens: 600, model_version: 'deepseek-flash', started_at: '2026-10-22T07:00:00.050Z', finished_at: '2026-10-22T07:00:00.250Z', created_at: '2026-10-22T07:00:00.250Z', prompt_version: 'p1', context_version: 'c1', constitution_revision: 1 },
    { id: 'm3', run_id: 'r3', step_key: 'idea_premise_selection', scenario: 'idea_generate', status: 'failed', attempt: 0, duration_ms: 300, internal_retries: 2, total_tokens: 700, model_version: 'deepseek-flash', started_at: '2026-10-22T07:00:00.300Z', finished_at: '2026-10-22T07:00:00.600Z', created_at: '2026-10-22T07:00:00.600Z', prompt_version: 'p2', context_version: 'c2', constitution_revision: 1, fail_reason: 'Authorization: Bearer secret-token' },
  ];
  const summary = summarizeDiscoveryStepMetrics(rows);
  assert.equal(summary.totals.logicalCalls, 3);
  assert.equal(summary.totals.failedCalls, 1);
  assert.equal(summary.totals.internalRetries, 3);
  assert.equal(summary.totals.physicalAttempts, 6);
  assert.equal(summary.totals.sumDurationMs, 600);
  assert.equal(summary.totals.wallMs, 600);
  assert.equal(summary.phaseBreakdown.find(row => row.phase === 'candidate_pool_generation').wallMs, 250);
  assert.equal(summary.phaseBreakdown.find(row => row.phase === 'fixed_pool_selection').wallMs, 300);
  assert.equal(summary.sameVersionCallGroups.length, 1);
  assert.equal(summary.sameVersionCallGroups[0].count, 2);
  assert.equal(summary.sameVersionCallGroups[0].evidenceLevel, 'same_version_metadata_only_not_exact_input_fingerprint');
  assert.equal(summary.runs[2].error.includes('secret-token'), false);
});

test('does not group same-version calls across different projects or scenarios as possible duplicates', () => {
  const base = {
    step_key: 'idea_premise_pool_generation', status: 'success', attempt: 0, duration_ms: 100,
    internal_retries: 0, prompt_version: 'p1', context_version: 'c1', constitution_revision: 1,
  };
  const summary = summarizeDiscoveryStepMetrics([
    { ...base, id: 'm1', run_id: 'r1', project_id: 'p1', scenario: 'idea_generate',
      started_at: '2026-10-22T07:00:00.000Z', finished_at: '2026-10-22T07:00:00.100Z' },
    { ...base, id: 'm2', run_id: 'r2', project_id: 'p2', scenario: 'idea_generate',
      started_at: '2026-10-22T07:00:00.200Z', finished_at: '2026-10-22T07:00:00.300Z' },
    { ...base, id: 'm3', run_id: 'r3', project_id: 'p1', scenario: 'another_scenario',
      started_at: '2026-10-22T07:00:00.400Z', finished_at: '2026-10-22T07:00:00.500Z' },
  ]);
  assert.equal(summary.sameVersionCallGroups.length, 0);
});

test('redacts credential-shaped keys and secret values without redacting token-count metrics', () => {
  const result = redactDiagnosticValue({ apiKey: 'api-secret-value', nested: { authorization: 'Bearer secret-token', message: 'token=other-secret' }, total_tokens: 1200 });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('api-secret-value'), false);
  assert.equal(serialized.includes('secret-token'), false);
  assert.equal(serialized.includes('other-secret'), false);
  assert.equal(result.total_tokens, 1200);
});

test('health preflight rejects reachable but unrelated or unhealthy HTTP 200 services', () => {
  assert.equal(validateBackendHealth({ ok: true, status: 200, data: { status: 'ok' } }).ok, true);
  const unrelated = validateBackendHealth({ ok: true, status: 200, data: '<html>wrong service</html>' });
  assert.equal(unrelated.ok, false);
  assert.match(unrelated.error, /status=ok/);
  const degraded = validateBackendHealth({ ok: true, status: 200, data: { status: 'degraded' } });
  assert.equal(degraded.ok, false);
  assert.match(degraded.error, /degraded/);
  const unavailable = validateBackendHealth({ ok: false, status: null, error: 'fetch failed', data: null });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.error, 'fetch failed');
  const error500 = validateBackendHealth({ ok: false, status: 500, data: { status: 'down' } });
  assert.equal(error500.ok, false);
  assert.equal(error500.error, 'HTTP 500');
});

test('reads nested recovery integrity fields without treating missing modules as PASS', () => {
  const raw = {
    success: true, diagnosticSchemaVersion: 2,
    audit: { status: 'generation_failed', missingModules: ['人物', '章节大纲', '正文空壳', '时间线'],
      consistencyIssues: [], outlineBodyMappingValid: true, canResume: true },
  };
  const result = normalizeProjectIntegrityAudit(raw);
  assert.deepEqual(result.missingModules, raw.audit.missingModules);
  assert.equal(result.outlineBodyMappingValid, true);
  assert.equal(result.canResume, true);
  assert.equal(result.diagnosticSchemaVersion, 2);
  assert.deepEqual(normalizeProjectIntegrityAudit({ missingModules: ['人物'], consistencyIssues: [] }).missingModules, ['人物']);
  assert.equal(normalizeProjectIntegrityAudit(null), null);
});

test('unfinished and cancelled discovery calls remain visible despite an older completed audit',()=>{
 const records=[
  {id:'old',scenario:'idea_generate',status:'success',started_at:'2026-10-26T10:58:00Z'},
  {id:'done',scenario:'idea_generate',status:'success',started_at:'2026-10-26T23:24:40Z',finished_at:'2026-10-26T23:25:30Z'},
  {id:'cancelled',scenario:'idea_generate',status:'cancelled',started_at:'2026-10-26T23:26:00Z',finished_at:'2026-10-26T23:33:00Z'},
  {id:'running',scenario:'idea_generate',status:'running',started_at:'2026-10-26T23:34:00Z'},
  {id:'orphaned',scenario:'idea_generate',status:'running',started_at:'2026-10-26T20:00:00Z'},
  {id:'other',scenario:'writing',status:'running',started_at:'2026-10-26T23:35:00Z'}
 ];
 const activity=summarizeRecentIdeaActivity(records,'2026-10-26T11:28:33Z','2026-10-26T23:24:24Z','2026-10-26T23:44:00Z');
 assert.equal(activity.totalRecent,4);
 assert.equal(activity.running,1);assert.equal(activity.staleRunning,1);
 assert.equal(activity.cancelled,1);assert.equal(activity.finished,1);
 assert.equal(activity.runs.find(r=>r.runId==='running').elapsedMs,600000);
 assert.equal(activity.runs.find(r=>r.runId==='orphaned').staleProcess,true);
 assert.equal(activity.runs.some(r=>r.runId==='old'||r.runId==='other'),false);
 assert.equal(activity.association,'after_latest_completed_audit_time_only');
 const overlap=summarizeRecentIdeaActivity([
  {id:'old-active',scenario:'idea_generate',status:'running',started_at:'2026-10-26T10:00:00Z'},
  {id:'newly-cancelled',scenario:'idea_generate',status:'cancelled',started_at:'2026-10-26T10:40:00Z',finished_at:'2026-10-26T11:31:00Z'}
 ],'2026-10-26T11:28:33Z','2026-10-26T09:00:00Z','2026-10-26T11:44:00Z');
 assert.equal(overlap.totalRecent,2);
 assert.equal(overlap.running,1);
 assert.equal(overlap.cancelled,1);

});
