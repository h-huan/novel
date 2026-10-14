import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIdeaDiscovery, renderIdeaDiscoveryDetails } from './verify-local-idea-diagnostics.mjs';

test('records the exact failed stage and source evidence for an incomplete 4/5 discovery', () => {
  const analysis = analyzeIdeaDiscovery({
    available: true, updatedAt: '2026-10-14T02:00:00Z',
    audit: {
      success: false, totalIdeas: 0, qualifiedCount: 4, shortfallCount: 1,
      error: '请求5，通过4，批次未完成',
      appealGate: {
        requested: 5, premisePoolTarget: 15, premisePoolSize: 12,
        premiseSelected: 5, generated: 4, qualified: 4,
        selectionAudit: { reasons: [{ premiseId: 'P0', kind: 'source_drift', reason: '人物动机偏离原池' }] },
        structuringErrors: [{ sourcePremiseId: 'P5', error: 'JSON missing one structured card' }],
        candidateAssessments: [
          { sourcePremiseId: 'P5', attempt: 'initial', passed: false, issues: ['JSON missing one structured card'] },
          { sourcePremiseId: 'P1', attempt: 'initial', passed: true, issues: [] },
        ],
        repairAttempted: true, repairGenerated: 0, repairError: 'local repair malformed JSON',
        reasons: ['P5结构化失败'],
      },
    },
  });
  assert.equal(analysis.available, true);
  assert.equal(analysis.success, false);
  assert.deepEqual(analysis.counts, {
    requested: 5, poolTarget: 15, poolActual: 12, selected: 5,
    structured: 4, evaluatedAttempts: null, qualified: 4, delivered: 0, shortfall: 1,
  });
  assert.ok(analysis.stageSignals.includes('逐题材结构化异常'));
  assert.ok(!analysis.stageSignals.includes('完整卡审查不通过'), 'no structured card means no substantive Gate verdict');
  assert.ok(analysis.stageSignals.includes('前置筛选复核不通过'));
  assert.ok(analysis.stageSignals.includes('局部修复调用或协议异常'));
  const md = renderIdeaDiscoveryDetails(analysis);
  assert.match(md, /请求 5/);
  assert.match(md, /完整结构化 4/);
  assert.match(md, /P5：JSON missing one structured card/);
  assert.match(md, /人物动机偏离原池/);
  assert.match(md, /修复错误：local repair malformed JSON/);
  assert.doesNotMatch(md, /SUCCESS（整批已完成）/);
});

test('renders final Gate failures with their actual evidence, not just a generic quality judgment', () => {
  const result = analyzeIdeaDiscovery({
    available: true,
    audit: {
      success: false, error: '终审未通过', qualifiedCount: 0, totalIdeas: 0,
      request: { requestedCount: 1 },
      appealGate: {
        premiseSelected: 1, generated: 1, reasons: ['终局未兑现开头承诺'],
        candidateAssessments: [{
          sourcePremiseId: 'P1', title: '社区账本', attempt: 'initial', passed: false,
          issues: ['主角没有真实行动后果'],
          warnings: ['描述需要明确关系代价'],
          candidate: {
            hook: '主角当场公布一张账本',
            description: '公布账本后却没有任何事件发展',
            coreConflict: '必须在期限前查清账目',
            mainReversal: '事件没有改变目标',
          },
        }],
      },
    },
  });
  assert.equal(result.counts.requested, 1);
  assert.equal(result.counts.shortfall, 1);
  assert.deepEqual(result.stageSignals, ['完整卡审查不通过']);
  const md = renderIdeaDiscoveryDetails(result);
  assert.match(md, /P1 \/ initial \/ 社区账本/);
  assert.match(md, /阻断原因：主角没有真实行动后果/);
  assert.match(md, /钩子证据：主角当场公布一张账本/);
  assert.match(md, /概要证据：公布账本后却没有任何事件发展/);
  assert.match(md, /提醒（非阻断）：描述需要明确关系代价/);
});

test('does not guess a quality issue when the server is unavailable or no audit exists', () => {
  const result = analyzeIdeaDiscovery({ available: false, reason: 'no_discovery_audit_yet' });
  assert.equal(result.available, false);
  assert.match(renderIdeaDiscoveryDetails(result), /no_discovery_audit_yet/);
  assert.doesNotMatch(renderIdeaDiscoveryDetails(result), /主角没有真实行动后果/);
});

test('preserves successfully completed exact-count batches without inventing failure stages', () => {
  const result = analyzeIdeaDiscovery({
    available: true, audit: {
      success: true, totalIdeas: 5, qualifiedCount: 5,
      request: { requestedCount: 5 },
      appealGate: { premiseSelected: 5, generated: 5, qualified: 5, candidateAssessments: [] },
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.counts.shortfall, 0);
  assert.deepEqual(result.stageSignals, []);
  assert.match(renderIdeaDiscoveryDetails(result), /SUCCESS（整批已完成）/);
});

test('does not mark a failed batch as successful when the overall audit is incomplete', () => {
  const result = analyzeIdeaDiscovery({
    available: true, audit: {
      success: false, totalIdeas: 0, qualifiedCount: 0,
      request: { requestedCount: 5 },
    },
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.stageSignals, ['批次失败，审计尚未定位到具体环节']);
  assert.match(renderIdeaDiscoveryDetails(result), /尚未取得细粒度失败证据/);
});

test('does not turn an absent premise count into a fake zero-selected failure', () => {
  const result = analyzeIdeaDiscovery({
    available: true,
    audit: {
      success: false, qualifiedCount: 0, totalIdeas: 0,
      request: { requestedCount: 5 },
      appealGate: { premiseSelected: null, premisePoolSize: null },
    },
  });
  assert.equal(result.counts.selected, null);
  assert.equal(result.counts.poolActual, null);
  assert.equal(result.counts.requested, 5);
  assert.deepEqual(result.stageSignals, ['批次失败，审计尚未定位到具体环节']);
});
