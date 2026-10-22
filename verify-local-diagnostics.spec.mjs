import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdeaDiscoveryAudit, summarizeDiscoveryStepMetrics, redactDiagnosticValue } from './verify-local-diagnostics.mjs';

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
