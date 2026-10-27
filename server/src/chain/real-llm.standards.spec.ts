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

it('injects the same missing-prerequisite constraint into initial selection, source review and structuring', () => {
 standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 for(const step of ['idea_premise_pool_generation','idea_premise_selection','idea_premise_source_drift_review','idea_card_structure']){
  const directive=standardDirectiveCache.get('idea_generate',step);
  expect(directive).toContain('【系统规则 GEN-002');
  expect(directive).toContain('原池与展开都缺的关键桥接应在首次选优审查判gap');
  expect(directive).toContain('异常读数不等于证明了具体收费账目或责任人');
 }
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


it('links platform idea step telemetry to its saved run even without a project constitution',async()=>{
 const metrics={beginRun:vi.fn(()=>({id:'platform-run',constitution:null})),finishRun:vi.fn()};
 const service=new RealLLMService({} as any,metrics as any);
 const generate=vi.fn(async()=>({content:'{"ideas":[]}',model:'fixture'}));
 (service as any).generateInternal=generate;
 await service.generate({prompt:'平台题材发现',scenario:'idea_generate',deferQualityGate:true,metrics:{stepKey:'idea_card_structure',attempt:0}});
 expect(generate.mock.calls[0][0].metrics).toEqual({stepKey:'idea_card_structure',attempt:0,runId:'platform-run'});
 expect(generate.mock.calls[0][0].metrics.projectId).toBeUndefined();
 expect(metrics.finishRun).toHaveBeenCalled();
});


it('uses citation lookup rules for reader evidence repair while preserving complete chapter review rules',()=>{
 standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 const focused=standardDirectiveCache.get('review','alignment_reader_goal_evidence');
 expect(focused).toContain('【系统规则 RPR-004');expect(focused).toContain('【系统规则 AUTH-002');
 expect(focused.length).toBeLessThan(standardDirectiveCache.get('review').length);
 expect(standardDirectiveCache.get('review','alignment_review')).toContain('【系统规则 QLT-003');
 expect(standardDirectiveCache.get('review','alignment_review')).toContain('【系统规则 QLT-011');
});

it('preserves provider thinking defaults unless the user explicitly configures effort', async () => {
 const old = process.env.LLM_REASONING_EFFORT;
 const oldReview = process.env.LLM_IDEA_REVIEW_REASONING_EFFORT;
 delete process.env.LLM_REASONING_EFFORT; delete process.env.LLM_IDEA_REVIEW_REASONING_EFFORT;
 try {
  const service = new RealLLMService({getConfig:()=>({defaults:{maxTokens:4096}}),getModelForScenario:()=>({modelName:'fixture',modelVersion:'fixture',temperature:0})} as any, {beginRun:vi.fn(),finishRun:vi.fn()} as any);
  const call=vi.fn(async()=>({content:'{}',finishReason:'stop'})); (service as any).callModel=call;
  await service.generate({prompt:'完整题材审核',scenario:'idea_generate',responseFormat:'json_object',metrics:{stepKey:'idea_presentation_review'}});
  expect((call.mock.calls[0] as any)[7]).toBeUndefined();
  expect((call.mock.calls[0] as any)[8]).not.toBe(true);
  for(const [scene,step] of [['idea_generate','idea_card_structure'],['idea_generate','idea_premise_selection'],['writing','idea_presentation_review'],['review','alignment_review']])expect((service as any).resolveReasoningEffort(scene,step)).toBeUndefined();
  process.env.LLM_IDEA_REVIEW_REASONING_EFFORT='high';expect((service as any).resolveReasoningEffort('idea_generate','idea_presentation_review')).toBe('high');
  process.env.LLM_REASONING_EFFORT='medium';expect((service as any).resolveReasoningEffort('idea_generate','idea_presentation_review')).toBe('medium');
 } finally { if(old===undefined)delete process.env.LLM_REASONING_EFFORT;else process.env.LLM_REASONING_EFFORT=old; if(oldReview===undefined)delete process.env.LLM_IDEA_REVIEW_REASONING_EFFORT;else process.env.LLM_IDEA_REVIEW_REASONING_EFFORT=oldReview; }
});

it('retains failed partial output for diagnosis without promoting it as success',async()=>{
 const metrics={beginRun:vi.fn(()=>({id:'failed-run',constitution:null})),finishRun:vi.fn()};
 const service=new RealLLMService({} as any,metrics as any);
 const failure=Object.assign(new Error('structured output truncated'),{generatedContent:'{"replacements":[{"partial":'});
 (service as any).generateInternal=vi.fn().mockRejectedValue(failure);
 await expect(service.generate({prompt:'只处理一项',scenario:'idea_generate',deferQualityGate:true})).rejects.toThrow('truncated');
 expect(metrics.finishRun).toHaveBeenCalledWith('failed-run','failed',expect.any(Number),failure.generatedContent,'structured output truncated');
});
