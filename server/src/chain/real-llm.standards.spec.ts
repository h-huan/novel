import { afterEach, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { activeSystemWorkflowRules, SYSTEM_WORKFLOW_RULESET_VERSION, STORY_PREREQUISITE_POLICY } from '../modules/module-standards/system-workflow-rules.registry';

afterEach(() => standardDirectiveCache.clear());


it('bounds preliminary selection and citation repair without changing independent quality Gates', () => {
  const service = new RealLLMService({} as any);
  const oldEffort = process.env.LLM_REASONING_EFFORT;
  try {
    delete process.env.LLM_REASONING_EFFORT;
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_causal_plan_contract')).toBe('low');
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_selection')).toBe('low');
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_refill_selection')).toBe('low');
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_pool_generation')).toBe('low');
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_pool_refill')).toBe('low');
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_pool_reselection')).toBe('low');
    for (const step of ['idea_premise_source_drift_review',
      'idea_premise_overlap_review','idea_card_structure','idea_presentation_review']) {
      expect((service as any).resolveReasoningEffort('idea_generate',step)).toBeUndefined();
    }
    process.env.LLM_REASONING_EFFORT = 'high';
    expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_causal_plan_contract')).toBe('high');
  } finally {
    if(oldEffort===undefined)delete process.env.LLM_REASONING_EFFORT;
    else process.env.LLM_REASONING_EFFORT=oldEffort;
  }
});
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
  expect(directive).toContain(STORY_PREREQUISITE_POLICY);
  expect(directive).toContain('第五节分类流派机制只解释前四节已有事实');
  expect(directive).toContain('证据存在不等于足以指认或自动处分');
 }
});

it('keeps causal validity and tag-conditioned appeal distinct from preselection to full-card and prose review',()=>{
 standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 for(const [scene,step] of [['idea_generate','idea_premise_selection'],['idea_generate','idea_card_structure'],
  ['idea_generate','idea_presentation_review'],['writing','body_first'],['review','alignment_review']] as const){
  const directive=standardDirectiveCache.get(scene,step);
  expect(directive).toContain('故事成立与吸引读者是并列且不可互代的判断');
  expect(directive).toContain('相同标签组合不自动同构');
  expect(directive).toContain('不得为迎合标签改变已确认人物');
  expect(directive).toContain('正文阶段以已写现场与实际人物反应验收');
 }
 const unrelated=standardDirectiveCache.get('review','alignment_reader_goal_evidence');
 expect(unrelated).not.toContain('故事成立与吸引读者是并列且不可互代的判断');
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

it('preserves final review thinking defaults while bounding preliminary identity ranking', async () => {
 const old = process.env.LLM_REASONING_EFFORT;
 const oldReview = process.env.LLM_IDEA_REVIEW_REASONING_EFFORT;
 delete process.env.LLM_REASONING_EFFORT; delete process.env.LLM_IDEA_REVIEW_REASONING_EFFORT;
 try {
  const service = new RealLLMService({getConfig:()=>({defaults:{maxTokens:4096}}),getModelForScenario:()=>({modelName:'fixture',modelVersion:'fixture',temperature:0})} as any, {beginRun:vi.fn(),finishRun:vi.fn()} as any);
  const call=vi.fn(async()=>({content:'{}',finishReason:'stop'})); (service as any).callModel=call;
  await service.generate({prompt:'完整题材审核',scenario:'idea_generate',responseFormat:'json_object',metrics:{stepKey:'idea_presentation_review'}});
  expect((call.mock.calls[0] as any)[7]).toBeUndefined();
  expect((call.mock.calls[0] as any)[8]).not.toBe(true);
  await service.generate({prompt:'原池身份选优',scenario:'idea_generate',responseFormat:'json_object',metrics:{stepKey:'idea_premise_selection'}});
  expect((call.mock.calls.at(-1) as any)[7]).toBe('low');
  expect((call.mock.calls.at(-1) as any)[8]).not.toBe(true);
  await service.generate({prompt:'轻量候选生成',scenario:'idea_generate',responseFormat:'json_object',metrics:{stepKey:'idea_premise_pool_generation'}});
  expect((call.mock.calls.at(-1) as any)[7]).toBe('low');
  expect((call.mock.calls.at(-1) as any)[8]).not.toBe(true);
  for(const step of ['idea_premise_pool_reselection','idea_premise_pool_refill']){
    await service.generate({prompt:'原池有界补位',scenario:'idea_generate',responseFormat:'json_object',metrics:{stepKey:step}});
    expect((call.mock.calls.at(-1) as any)[7]).toBe('low');
    expect((call.mock.calls.at(-1) as any)[8]).not.toBe(true);
  }
  for(const [scene,step] of [['idea_generate','idea_card_structure'],['idea_generate','idea_presentation_review'],['writing','idea_presentation_review'],['review','alignment_review']])expect((service as any).resolveReasoningEffort(scene,step)).toBeUndefined();
  expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_selection')).toBe('low');
  expect((service as any).resolveReasoningEffort('idea_generate','idea_premise_refill_selection')).toBe('low');
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

it('projects the actual payoff recheck and citation-only protocols instead of the entire generation workflow',async()=>{
 const rules=await import('../modules/module-standards/system-workflow-rules.registry');
 standardDirectiveCache.rebuild();
 const full=standardDirectiveCache.get('idea_generate');
 const recheck=standardDirectiveCache.get('idea_generate','idea_premise_payoff_recheck');
 const contract=standardDirectiveCache.get('idea_generate','idea_premise_causal_plan_contract');
 expect(recheck).toContain(rules.PREMISE_PAYOFF_REVIEW_POLICY);
 expect(contract).toContain(rules.IDEA_PROTOCOL_BINDING_POLICY);
 expect(standardDirectiveCache.snapshot('idea_generate',true,'idea_premise_payoff_recheck').ruleIds).toEqual(standardDirectiveCache.snapshot('idea_generate',true,'idea_premise_source_drift_review').ruleIds);
 expect(recheck).not.toContain(rules.IDEA_SCOPE_ALLOCATION_POLICY);
 expect(recheck).not.toContain(rules.IDEA_PREMISE_DIFFERENCE_POLICY);
 expect(recheck.length).toBeLessThan(full.length/2);
 expect(contract.length).toBeLessThan(full.length/2);
 expect(standardDirectiveCache.get('idea_generate','idea_presentation_review')).toContain(rules.READER_ENGAGEMENT_POLICY);
 expect(standardDirectiveCache.get('idea_generate','idea_premise_source_drift_review')).toContain(rules.PREMISE_PAYOFF_REVIEW_POLICY);
});

it('delivers the shared action-state condition to draft and local repair before any model output, once per physical call',async()=>{
 const {STORY_CAUSAL_STATE_POLICY,SOURCE_QUALITY_POLICY}=await import('../modules/module-standards/system-workflow-rules.registry');
 standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 const service=new RealLLMService({
  getConfig:()=>({defaults:{maxTokens:4096}}),
  getModelForScenario:()=>({modelName:'fixture',modelVersion:'fixture',temperature:0}),
 } as any,{beginRun:vi.fn(),finishRun:vi.fn()} as any);
 const call=vi.fn(async()=>({content:'{}',finishReason:'stop'}));(service as any).callModel=call;
 for(const stepKey of ['creation_chapter_detail','creation_chapter_fact_repair']){
  call.mockClear();
  await service.generate({prompt:'按既定职责生成候选',scenario:'outline',responseFormat:'json_object',metrics:{stepKey}});
  expect(call).toHaveBeenCalledTimes(1);
  const system=(call.mock.calls[0] as any)[2] as string;
  expect(system.split(STORY_CAUSAL_STATE_POLICY)).toHaveLength(2);
  expect(system).toContain(SOURCE_QUALITY_POLICY);
  expect(system).toContain('CR-1');
  expect(system).not.toContain('坐标由程序按 UTF-16');
 }
});

it('projects the same established-boundary check into candidate generation, source audit and final card audit',()=>{
 standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 for(const step of ['idea_premise_pool_generation','idea_premise_pool_refill','idea_premise_selection','idea_premise_source_drift_review','idea_presentation_review']){
  const directive=standardDirectiveCache.get('idea_generate',step);
  expect(directive).toContain(STORY_PREREQUISITE_POLICY);
  expect(directive).toContain('原池自身的规则与用法相冲突时，同样不合格');
 }
});

it('keeps discovery scheduling out of confirmed-story generation while retaining story constraints',async()=>{
 const rules=await import('../../shared/src/system-workflow-rules.registry');standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 for(const [scene,step]of [['outline','creation_chapter_detail'],['review','review'],['world_building','world_generation']]){
  const directive=standardDirectiveCache.get(scene,step);expect(directive).toContain(rules.CONFIRMED_STORY_FOUNDATION_POLICY);expect(directive).toContain(rules.STORY_PREREQUISITE_POLICY);expect(directive).not.toContain(rules.IDEA_DISCOVERY_FULFILLMENT_POLICY);expect(directive).not.toContain(rules.IDEA_AGGREGATE_RESERVE_POLICY);
 }
 expect(standardDirectiveCache.get('idea_generate','idea_premise_pool_generation')).toContain(rules.IDEA_CANDIDATE_CONSTRUCTION_POLICY);
});

it('injects the same decisive-choice prerequisite before pool generation, selection and either gate',async()=>{
 const rules=await import('../../shared/src/system-workflow-rules.registry');standardDirectiveCache.rebuild(activeSystemWorkflowRules());for(const step of ['idea_premise_pool_generation','idea_premise_pool_refill','idea_premise_selection','idea_premise_refill_selection','idea_premise_pool_reselection','idea_premise_source_drift_review','idea_premise_payoff_recheck','idea_card_structure','idea_presentation_review'])expect(standardDirectiveCache.get('idea_generate',step)).toContain(rules.DECISIVE_CHOICE_CONDITION_POLICY);
});

it('projects one participant-choice condition before candidate creation and through both creation paths',async()=>{
 const rules=await import('../../shared/src/system-workflow-rules.registry');standardDirectiveCache.rebuild(activeSystemWorkflowRules());
 for(const [scene,step]of [
  ...['idea_premise_pool_generation','idea_premise_pool_refill','idea_premise_selection','idea_premise_refill_selection','idea_premise_pool_reselection','idea_premise_source_drift_review','idea_premise_payoff_recheck','idea_card_structure','idea_presentation_review'].map(step=>['idea_generate',step]),
  ['outline','creation_chapter_detail'],['outline','creation_chapter_fact_repair'],['outline','outline'],['writing','writing'],['review','review']]){
  expect(standardDirectiveCache.get(scene,step),scene+':'+step).toContain(rules.STORY_PARTICIPANT_CHOICE_POLICY);
 }
});
