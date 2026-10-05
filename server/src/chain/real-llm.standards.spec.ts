import { afterEach, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { activeSystemWorkflowRules, SYSTEM_WORKFLOW_RULESET_VERSION } from '../modules/module-standards/system-workflow-rules.registry';

afterEach(() => standardDirectiveCache.clear());

it('injects Rule-ID based public standards with preserved detailed clauses', async () => {
  standardDirectiveCache.rebuild(activeSystemWorkflowRules());
  const service = new RealLLMService({
    getConfig: () => ({ defaults: { maxTokens: 4096 } }),
    getModelForScenario: () => ({ modelName: 'fixture', modelVersion: 'fixture', temperature: 0 }),
  } as any, { beginRun: vi.fn(), finishRun: vi.fn() } as any);
  const call = vi.fn(async () => ({ content: '{}', finishReason: 'stop' }));
  (service as any).callModel = call;

  await service.generate({ prompt: '评审正文', scenario: 'review', responseFormat: 'json_object' });
  const system = (call.mock.calls.at(-1) as any)[2] as string;
  expect(system).toContain('【系统规则 ARCH-003');
  expect(system).toContain('【系统规则 QLT-011');
  expect(system).toContain('prosePassed');
  expect(system).toContain('【系统规则 QLT-012');
  expect(system).toContain('具体必需事件');
  expect(system).toContain('终章按合同结局或余韵收束');
  expect(system).toContain('凭空增加事件、时间、地点');
});

it('injectStandard=false really disables public-rule injection instead of leaving a second inline preflight rule', async () => {
  standardDirectiveCache.rebuild(activeSystemWorkflowRules());
  const service = new RealLLMService({
    getConfig: () => ({ defaults: { maxTokens: 4096 } }),
    getModelForScenario: () => ({ modelName: 'fixture', modelVersion: 'fixture', temperature: 0 }),
  } as any, { beginRun: vi.fn(), finishRun: vi.fn() } as any);
  const call = vi.fn(async () => ({ content: '结果', finishReason: 'stop' }));
  (service as any).callModel = call;
  await service.generate({ prompt: '题材', scenario: 'idea_generate', injectStandard: false });
  const system = (call.mock.calls[0] as any)[2] as string;
  expect(system).not.toContain('执行前置规则');
  expect(system).not.toContain('【系统规则');
});

it('ruleset snapshots carry both scene digest and registry-wide digest', () => {
  standardDirectiveCache.rebuild(activeSystemWorkflowRules());
  const snapshot = standardDirectiveCache.snapshot('writing', true);
  expect(snapshot.rulesetVersion).toBe(SYSTEM_WORKFLOW_RULESET_VERSION);
  expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(snapshot.registryDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(snapshot.ruleIds).toContain('GEN-004');
  expect(snapshot.ruleIds).toContain('QLT-013');
});

it('normalized daily body steps still receive writing rules from the single registry', () => {
  standardDirectiveCache.rebuild(activeSystemWorkflowRules());
  expect(standardDirectiveCache.get('daily', 'body_first')).toContain('【系统规则 GEN-004');
  expect(standardDirectiveCache.snapshot('daily', true, 'body_first').available).toBe(true);
});
