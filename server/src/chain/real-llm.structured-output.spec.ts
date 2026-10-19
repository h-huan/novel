import { describe, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';
import { readConstitution } from '../modules/project/creative-constitution';
import { parseScoreReviewJson } from './review-json';
import { SCORE_DIMENSIONS } from '../modules/writing-quality/stage-score';
import { dimensionBasis } from '../test/quality-review.fixture';
import { causalEvidenceAnchors, causalExitResultAnchors, causalChapterResultAnchors } from '../modules/writing-quality/causal-review';
import { createServer } from 'node:http';

it.each(['project_context:p1', 'project_context:p999'])('completes issue citations within the existing two reviews and preserves verdicts: %s', async (basisAnchorId) => {
  const service = new RealLLMService({} as any);
  const constitution = readConstitution({ target_platform: 'fanqie', settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], genreFitNote: '现实城市职业与人际冲突推动人物选择', pov: '第三人称限知' } });
  const content = '真实规划：他进入锁住的屋子。';
  const issue = { ruleId: 'logic.causal_gap', severity: 'medium', message: '进入条件缺失', evidence: content, evidenceKind: 'causal_gap', basisSource: 'project_context', basisEvidence: '不存在的依据', basisReason: '原设定要求开锁的钥匙，当前计划未交代取得。' };
  const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, { score: 85, reason: '满足本阶段要求', evidence: [content], basis: dimensionBasis(constitution, key) }]));
  const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify({ dimensions, issues: [issue] }) })
    .mockResolvedValueOnce({ content: JSON.stringify({ dimensions: {}, repairs: [{ index: 0, evidenceAnchorId: 'body:p1', basisAnchorId, severity: 'info' }] }) });
  (service as any).generateInternal = generate;
  const score = await (service as any).assessGeneratedRun({ id: 'r', projectId: 'p', stage: 'outline', constitution, context: JSON.stringify({ world: '屋门上锁，需钥匙才能进入。' }), previousChapters: [], characterNames: [] }, { prompt: '规划章纲' }, content);
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0].prompt).toContain('repairs');
  expect(score.issues).toHaveLength(1);
  expect(score.issues[0].severity).toBe('medium');
  expect(score.issues[0].evaluation).toBe(basisAnchorId.endsWith('p1') ? 'evidenced' : 'insufficient_evidence');
  expect(score.status).toBe(basisAnchorId.endsWith('p1') ? 'evaluated' : 'partial');
});

it('preserves all findings when normalizing the observed review hierarchy and refuses incomplete values', () => {
  const dimensions = { logic: { score: 45, reason: '事实冲突', evidence: ['实际原文'] } };
  const issues = [{ ruleId: 'logic', severity: 'blocking', message: '事实冲突', evidence: '实际原文' }];
  const canonical = JSON.stringify({ dimensions, issues });
  const malformed = canonical.replace('},"issues":', ',"issues":');
  const result = parseScoreReviewJson(malformed);
  expect(result.normalized).toBe(true);
  expect(result.value).toEqual({ dimensions, issues });
  expect(parseScoreReviewJson(JSON.stringify({ dimensions: { ...dimensions, issues } })).value).toEqual({ dimensions, issues });
  expect(() => parseScoreReviewJson(malformed.slice(0, -10))).toThrow();
  expect(() => parseScoreReviewJson(JSON.stringify({ dimensions: { ...dimensions, issues }, issues: [] }))).toThrow();
});

const createService = () => {
  const router = {
    getConfig: () => ({ defaults: { maxTokens: 4096 }, scenarios: { outline: { maxTokens: 4096 } } }),
    getModelForScenario: () => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash', temperature: 0.4 }),
  };
  return new RealLLMService(router as any);
};
it.each([32768,4096])('retains the original truncation and usage after the last allowed call at %s tokens',async(maxTokens)=>{
 const service=createService(),budget:{remaining:number;recoveryWithoutThinking?:boolean}={remaining:1};
 const record=vi.spyOn(service as any,'recordStepMetric').mockImplementation(()=>{});
 const usage={promptTokens:6908,completionTokens:maxTokens,totalTokens:6908+maxTokens};
 const callModel=vi.fn().mockResolvedValue({content:'',finishReason:'length',usage});
 (service as any).callModel=callModel;
 await expect(service.generate({prompt:'完整来源与原字段',scenario:'idea_generate',responseFormat:'json_object',maxTokens,
  physicalCallBudget:budget,metrics:{stepKey:'idea_premise_source_drift_review'}}))
  .rejects.toMatchObject({structuredOutputTruncated:true,physicalCallBudgetExhausted:true,generatedContent:''});
 expect(callModel).toHaveBeenCalledTimes(1);expect(budget.remaining).toBe(0);
 expect(budget.recoveryWithoutThinking).toBeUndefined();
 expect(record).toHaveBeenCalledTimes(1);expect(record.mock.calls[0][2]).toBe('truncated');
 expect((record.mock.calls[0][5] as any).resp.usage).toEqual(usage);
});
it('keeps a network-recovered truncation instead of replacing it with a budget error',async()=>{
 const service=createService(),budget:{remaining:number;recoveryWithoutThinking?:boolean}={remaining:2};
 const record=vi.spyOn(service as any,'recordStepMetric').mockImplementation(()=>{});
 const usage={promptTokens:6908,completionTokens:32768,totalTokens:39676};
 const callModel=vi.fn().mockRejectedValueOnce(new Error('UND_ERR_SOCKET'))
  .mockResolvedValueOnce({content:'',finishReason:'length',usage});
 (service as any).callModel=callModel;
 await expect(service.generate({prompt:'完整来源与原字段',scenario:'idea_generate',responseFormat:'json_object',maxTokens:32768,
  physicalCallBudget:budget,metrics:{stepKey:'idea_premise_source_drift_review'}}))
  .rejects.toMatchObject({structuredOutputTruncated:true,physicalCallBudgetExhausted:true});
 expect(callModel).toHaveBeenCalledTimes(2);expect(budget.recoveryWithoutThinking).toBeUndefined();
 expect(record).toHaveBeenCalledTimes(1);expect(record.mock.calls[0][2]).toBe('truncated');
 expect((record.mock.calls[0][5] as any).resp.usage).toEqual(usage);
});
it('aborts the physical call at the deadline without retrying or accepting partial output', async () => {
  vi.useFakeTimers();
  try {
    const service = createService();
    let signal: AbortSignal | undefined;
    const callModel = vi.fn((...args: any[]) => new Promise((resolve, reject) => {
      signal = args[9];
      signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    (service as any).callModel = callModel;
    const pending = expect(service.generate({ prompt: '验收', scenario: 'review', timeout: 100, maxTokens: 4096 }))
      .rejects.toThrow('LLM 主调用超时');
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    await vi.advanceTimersByTimeAsync(2000);
    expect(signal?.aborted).toBe(true);
    expect(callModel).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it('cancels an already opened OpenAI compatible stream instead of retaining its partial response', async () => {
  let opened!: () => void, closed!: () => void;
  const ready = new Promise<void>(resolve => { opened = resolve; });
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"choices":[{"delta":{"content":"未完成正文"}}]}\n\n');
    response.on('close', closed);
    opened();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  const service = createService();
  (service as any).resolveProxyExtras = async () => ({});
  try {
    const address = server.address() as { port: number };
    const call = (service as any).callOpenAICompatible('local-test', `http://127.0.0.1:${address.port}/v1`,
      'deepseek-flash', 'deepseek', [{ role: 'user', content: '验收' }], 0.4, 4096, 10000,
      'text', undefined, undefined, controller.signal);
    const rejected = expect(call).rejects.toThrow();
    await ready;
    controller.abort();
    await rejected;
    await disconnected;
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
it('recovers a complete cross-stage decision without re-generating its source candidate or changing the model contract', async () => {
  const service=createService(),budget={remaining:2};
  const callModel=vi.fn().mockResolvedValueOnce({content:'{"consistent":true,"contradictions":[',finishReason:'length'})
    .mockResolvedValueOnce({content:'{"consistent":false,"contradictions":["真实来源冲突"],"unrelatedInventions":[]}',finishReason:'stop'});
  (service as any).callModel=callModel;
  const result=await service.generate({prompt:'同一完整候选和固定成果',scenario:'review',responseFormat:'json_object',maxTokens:32768,
    structuredReviewUnitCount:1,physicalCallBudget:budget,metrics:{stepKey:'creation_cross_stage_review'}});
  expect(JSON.parse(result.content).consistent).toBe(false);
  expect(callModel).toHaveBeenCalledTimes(2);
  expect(callModel.mock.calls[0].slice(0,7)).toEqual(callModel.mock.calls[1].slice(0,7));
  expect(callModel.mock.calls[1][8]).toBe(true);
  expect(budget.remaining).toBe(0);
});
it.each([true,false])('recovers a connected upstream group within its existing two calls, complete=%s', async (complete) => {
  const service=createService(),budget={remaining:2};
  const callModel=vi.fn().mockResolvedValueOnce({content:'{"edits":[',finishReason:'length'})
    .mockResolvedValueOnce({content:complete?' {"edits":[{"anchorId":"E1","replacement":"完整合法路径"}]}':'{"edits":[',finishReason:complete?'stop':'length'});
  (service as any).callModel=callModel;
  const request={prompt:'完整冻结来源与同一组依赖',scenario:'review',responseFormat:'json_object' as const,
    maxTokens:32768,structuredRepairUnitCount:1,physicalCallBudget:budget,metrics:{stepKey:'creation_cross_stage_repair'}};
  if(complete)expect((await service.generate(request)).content).toContain('完整合法路径');
  else await expect(service.generate(request)).rejects.toMatchObject({structuredOutputTruncated:true});
  expect(callModel).toHaveBeenCalledTimes(2);
  expect(callModel.mock.calls[0].slice(0,7)).toEqual(callModel.mock.calls[1].slice(0,7));
  expect(callModel.mock.calls[1][8]).toBe(true);
  expect(budget.remaining).toBe(0);
  await expect(service.generate(request)).rejects.toThrow('预算已用尽');
  expect(callModel).toHaveBeenCalledTimes(2);
});
it('preserves proven empty-output recovery within the same repair budget but leaves fresh tasks unchanged', async () => {
  const service=createService(),budget:{remaining:number;recoveryWithoutThinking?:boolean}={remaining:3};
  const callModel=vi.fn().mockResolvedValueOnce({content:'',finishReason:'length'})
    .mockResolvedValueOnce({content:'{"candidate":true}',finishReason:'stop'})
    .mockResolvedValueOnce({content:'{"corrected":true}',finishReason:'stop'})
    .mockResolvedValueOnce({content:'{"fresh":true}',finishReason:'stop'});
  (service as any).callModel=callModel;
  const request={prompt:'修订必要依赖',scenario:'outline',responseFormat:'json_object' as const,maxTokens:32768,physicalCallBudget:budget};
  await service.generate(request);
  await service.generate({...request,prompt:'纠正同一候选的协议'});
  expect(callModel.mock.calls.slice(0,3).map(call=>call[8])).toEqual([undefined,true,true]);
  expect(budget.remaining).toBe(0);
  await service.generate({...request,physicalCallBudget:{remaining:1},prompt:'新的独立任务'});
  expect(callModel.mock.calls[3][8]).toBeUndefined();
});

it('shares a physical call budget across expansion and subsequent protocol correction', async () => {
  const service=createService(),budget={remaining:2};
  const callModel=vi.fn().mockResolvedValueOnce({content:'{"partial":',finishReason:'length'})
    .mockResolvedValueOnce({content:'{"ok":true}',finishReason:'stop'});
  (service as any).callModel=callModel;
  const request={prompt:'只修订一个源头候选',scenario:'outline',responseFormat:'json_object' as const,maxTokens:4096,physicalCallBudget:budget};
  expect((await service.generate(request)).content).toBe('{"ok":true}');
  await expect(service.generate(request)).rejects.toThrow('调用预算已用尽');
  expect(callModel).toHaveBeenCalledTimes(2);
});

it('uses accepted transient planning sources for both initial review and citation verification before database save', async () => {
  const service = new RealLLMService({} as any);
  const constitution = readConstitution({ target_platform: 'fanqie', settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], genreFitNote: '现实城市职业与人际冲突推动人物选择', pov: '第三人称限知' } });
  const content = '他直接进入锁住的屋子完成反制。';
  const planningSources = { analysis: { chapterResponsibilities: [{ prerequisites: ['必须先取得当单门禁授权。'] }] } };
  const issue = { ruleId: 'logic.causal_gap', severity: 'medium', message: '缺少当前有效授权', evidence: content, evidenceKind: 'causal_gap', basisSource: 'chapter_plan', basisEvidence: '必须先取得当单门禁授权。', basisReason: '前序规划规定先取得当单授权，本轮未写取得过程。' };
  const dimensions = Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, { score: 85, reason: '满足本阶段要求', evidence: [content], basis: dimensionBasis(constitution, key) }]));
  const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ dimensions, issues: [issue] }) });
  (service as any).generateInternal = generate;
  const score = await (service as any).assessGeneratedRun({ id: 'r', projectId: 'p', stage: 'outline', constitution, context: '{}', previousChapters: [], characterNames: [] }, { prompt: '展开已通过职责', planningSources }, content);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].prompt).toContain(JSON.stringify(planningSources));
  expect(score.issues[0].evaluation).toBe('evidenced');
  expect(score.status).toBe('evaluated');
});

describe('upstream responsibility preflight', () => {
  const first = { chapter: 1, title: '起点', function: '起点', responsibility: '取得当单授权', prerequisites: [], timeline: '当晚', exitState: '当单权限到期' };
  const last = { chapter: 2, title: '反制', function: '反制', responsibility: '使用已到期授权进楼', prerequisites: ['旧授权'], timeline: '次日', exitState: '救人成功' };
  const finding = { chapter: 2, criterion: 'CR-1', task: last.responsibility, conflict: '已到期条件不能复用', ruleEvidence: '当单授权到期后失效', retain: '救人', fix: '由已在场的合法住户开门' };
  const constitution = readConstitution({ target_platform: 'fanqie', settings: { category: '悬疑', pov: '第三人称限知' } });
  const run = { constitution, context: JSON.stringify({ world: finding.ruleEvidence }) };
  const plan = { analysis: { ending: '冻结结局' }, chapterResponsibilities: [first, last] };
  const repaired = { resolutions: [{ issueIndex: 1, chapters: [2], removedMechanism: last.responsibility, replacementMechanism: '由已在场的合法住户开门', ruleEvidence: finding.ruleEvidence }], chapterResponsibilities: [{ exitState: first.exitState, timeline: first.timeline, prerequisites: [], responsibility: first.responsibility, function: first.function, title: first.title, chapter: 1 }, { ...last, responsibility: '由已在场的合法住户开门', prerequisites: ['住户自愿开门'] }] };
  const audit = (contradictions: any[] = []) => ({ consistent: !contradictions.length, contradictions, conditionChecks: [first, last].map(ch => ({ chapter: ch.chapter, taskEvidence: ch.responsibility, status: contradictions.some(x => x.chapter === ch.chapter) ? "gap" : "supported", bridgeSource: "body", bridgeEvidence: ch.chapter === 1 ? first.responsibility : "由已在场的合法住户开门", reason: "逐章核对取得路径与有效时段" })) });
  it('rejects an unsubstantiated consistent marker instead of treating it as upstream verification', async () => {
    const service = new RealLLMService({} as any);
    const generate = vi.fn().mockResolvedValue({ content: '{"consistent":true,"contradictions":[]}' });
    (service as any).generateInternal = generate;
    await expect((service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan))).rejects.toThrow('逐章条件核对');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])('corrects only citation metadata once, preserving the prior verdict and condition states: %s', async (changeStatus) => {
    const service = new RealLLMService({} as any);
    const before = { consistent: true, contradictions: [], conditionChecks: [first, last].map(ch => ({
      chapter: ch.chapter, taskAnchorId: `chapter:c${ch.chapter}:task`, status: 'supported',
      bridgeAnchorIds: ['project_context:v1'], reason: '仅有世界允许条件，需补本章实际动作引用' })) };
    const corrected = { ...before, conditionChecks: before.conditionChecks.map(ch => ({ ...ch,
      status: changeStatus && ch.chapter === 2 ? 'not_required' : ch.status,
      bridgeAnchorIds: [`chapter:c${ch.chapter}:task`, 'project_context:v1'] })) };
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(before) })
      .mockResolvedValueOnce({ content: JSON.stringify(corrected) });
    (service as any).generateInternal = generate;
    vi.spyOn(service as any, 'auditPlanningActions').mockResolvedValue({ verified: true, errors: [], issues: [] });
    if (changeStatus) await expect((service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan)))
      .rejects.toThrow('引用纠错改变了原条件状态');
    else expect(JSON.parse(await (service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan)))).toEqual(plan);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toContain('一次引用协议纠错');
  });
  it('reports condition and frozen-source citation errors together before the one correction', async () => {
    const service = new RealLLMService({} as any);
    const before = { consistent: false, contradictions: [{ ...finding, task: undefined, ruleEvidence: undefined,
      taskAnchorId: 'chapter:c2:task', ruleAnchorIds: ['body:v4'] }], conditionChecks: [1, 2].map(chapter => ({
      chapter, taskAnchorId: `chapter:c${chapter}:task`, status: chapter === 2 ? 'gap' : 'supported',
      bridgeAnchorIds: chapter === 2 ? [] : ['project_context:v1'], reason: '逐章核对取得路径和仍有效的条件' })) };
    const corrected = { ...before, contradictions: [{ ...before.contradictions[0], ruleAnchorIds: ['project_context:v1'] }],
      conditionChecks: before.conditionChecks.map(row => ({ ...row, bridgeAnchorIds: row.chapter === 1 ? ['chapter:c1:task'] : [] })) };
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(before) })
      .mockResolvedValueOnce({ content: JSON.stringify(corrected) });
    (service as any).generateInternal = generate;
    vi.spyOn(service as any, 'auditPlanningActions').mockRejectedValue(new Error('stop_after_complete_protocol'));
    await expect((service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan))).rejects.toThrow('stop_after_complete_protocol');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toContain('逐章条件核对缺少取得路径');
    expect(generate.mock.calls[1][0].prompt).toContain('ruleAnchorIds必须全部来自真实project_context');
  });
  it.each(['project_context:v1', 'project_context:v999'])('resolves preflight source addresses without trusting invented IDs: %s', async (ruleAnchorId) => {
    const service = new RealLLMService({} as any);
    const exitProof = vi.spyOn(service as any, 'auditPlanningActions').mockResolvedValue({ verified: true, errors: [], issues: [] });
    const before = { consistent: false, contradictions: [{ ...finding, task: undefined, ruleEvidence: undefined, taskAnchorId: 'chapter:c2:task', ruleAnchorIds: [ruleAnchorId] }],
      conditionChecks: [1, 2].map(chapter => ({ chapter, taskAnchorId: `chapter:c${chapter}:task`, status: chapter === 2 ? 'gap' : 'supported', bridgeAnchorIds: chapter === 2 ? [] : ['chapter:c1:task'], reason: '逐章核对取得路径与有效时段' })) };
    const after = { consistent: true, contradictions: [], conditionChecks: [1, 2].map(chapter => ({ chapter, taskAnchorId: `chapter:c${chapter}:task`, status: 'supported', bridgeAnchorIds: [`chapter:c${chapter}:task`], reason: '逐章核对取得路径与有效时段' })) };
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(before) }).mockResolvedValueOnce({ content: JSON.stringify(repaired) }).mockResolvedValueOnce({ content: JSON.stringify(after) });
    (service as any).generateInternal = generate;
    if (ruleAnchorId.endsWith('v1')) {
      const result = JSON.parse(await (service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan)));
      expect(result.analysis).toEqual(plan.analysis);
      expect(generate).toHaveBeenCalledTimes(3);
      expect(exitProof).toHaveBeenCalledTimes(2);
    } else {
      generate.mockReset().mockResolvedValue({ content: JSON.stringify(before) });
      await expect((service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan))).rejects.toThrow('逐字双边证据');
      expect(generate).toHaveBeenCalledTimes(2);
    }
  });
  it('repairs once before downstream expansion, preserving frozen analysis and unaffected chapters regardless of key order', async () => {
    const service = new RealLLMService({} as any);
    const exitProof = vi.spyOn(service as any, 'auditPlanningActions').mockResolvedValue({ verified: true, errors: [], issues: [] });
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(audit([finding])) })
      .mockResolvedValueOnce({ content: JSON.stringify(repaired) })
      .mockResolvedValueOnce({ content: JSON.stringify({ ...audit(), conditionChecks: audit().conditionChecks.map(ch => ({ ...ch, taskEvidence: ch.chapter === 2 ? repaired.chapterResponsibilities[1].responsibility : ch.taskEvidence })) }) });
    (service as any).generateInternal = generate;
    const result = JSON.parse(await (service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan)));
    expect(result.analysis).toEqual(plan.analysis);
    expect(result.chapterResponsibilities[0]).toEqual(first);
    expect(result.chapterResponsibilities[1].responsibility).toBe(repaired.chapterResponsibilities[1].responsibility);
    expect(exitProof).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map(call => call[0].metrics.stepKey)).toEqual(['framework_responsibility_preflight', 'framework_responsibility_repair', 'framework_responsibility_preflight']);
  });
  it('refuses an unevidenced finding without attempting repair', async () => {
    const service = new RealLLMService({} as any);
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify(audit([{ ...finding, ruleEvidence: '来源没有此限制' }])) });
    (service as any).generateInternal = generate;
    await expect((service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan))).rejects.toThrow('逐字双边证据');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('checks exit conditions before the one repair and rechecks them before downstream expansion', async () => {
    const service = new RealLLMService({} as any);
    const initial = { consistent: true, contradictions: [],
      conditionChecks: plan.chapterResponsibilities.map(ch => ({ chapter: ch.chapter, taskEvidence: ch.responsibility,
        status: 'supported', bridgeSource: 'body', bridgeEvidence: ch.responsibility, reason: '仅验证了资源使用路径，不证明终局结果' })) };
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(initial) })
      .mockImplementationOnce(async (request: any) => {
        expect(exitProof).toHaveBeenCalledTimes(1);
        expect(request.prompt).toContain('QLT-003');
        expect(request.prompt).toContain('普通关门不能使对手失去正常开门能力');
        expect(request.prompt).toContain('不得把既有权限换对象后扩张');
        expect(request.prompt).toContain('允许调整本章行动次序和结果时点');
        expect(request.prompt).toContain('不拼造授权原文');
        expect(request.prompt).toContain('"failureReason":"普通关门不能使对手失去正常开门能力"');
        expect(request.prompt).toContain('应删除该中间结果及后续对它的依赖');
        return { content: JSON.stringify(repaired) };
      }).mockResolvedValueOnce({ content: JSON.stringify({ ...initial, conditionChecks: initial.conditionChecks.map(ch => ({
        ...ch, taskEvidence: ch.chapter === 2 ? repaired.chapterResponsibilities[1].responsibility : ch.taskEvidence,
        bridgeEvidence: ch.chapter === 2 ? repaired.chapterResponsibilities[1].responsibility : ch.bridgeEvidence })) }) });
    (service as any).generateInternal = generate;
    const exitProof = vi.spyOn(service as any, 'auditPlanningActions')
      .mockResolvedValueOnce({ verified: true, errors: [], issues: [{ chapterNumber: 2, summary: '普通关门不能使对手失去正常开门能力' }] })
      .mockResolvedValueOnce({ verified: true, errors: [], issues: [] });
    await (service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan));
    expect(exitProof.mock.calls[0][2]).toContain(last.exitState);
    expect(exitProof.mock.calls[0][1].planningSources).toEqual({});
    expect(exitProof.mock.calls[0][3]).toBe('exitState');
    expect(exitProof).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(3);
  });
  it('stops after one failed repair rather than looping downstream', async () => {
    const service = new RealLLMService({} as any);
    vi.spyOn(service as any, 'auditPlanningActions').mockResolvedValue({ verified: true, errors: [], issues: [] });
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify(audit([finding])) })
      .mockResolvedValueOnce({ content: JSON.stringify({ ...repaired, chapterResponsibilities: [first, last] }) })
      .mockResolvedValueOnce({ content: JSON.stringify(audit([finding])) });
    (service as any).generateInternal = generate;
    await expect((service as any).compileVerifiedResponsibilities(run, {}, JSON.stringify(plan))).rejects.toThrow('一次职责修订后仍未通过');
    expect(generate).toHaveBeenCalledTimes(3);
  });
});

describe('decisive planning action proof', () => {
  it('在交给小说修复前补齐场景漏查项，保留首轮已举证缺口，不另开模型循环', async () => {
    const chapter = {chapterNumber:4,chapterFunction:'climax',content:'他把编号写在本子上。',scenes:[{outcome:'老人手里有了记录。'},{outcome:'证人没有离开。'}],characterActions:[{action:'他把编号写在本子上。',result:'记录登记完成。'}]};
    const body=JSON.stringify([chapter]);
    const anchors=causalEvidenceAnchors(body,{}),catalog=causalChapterResultAnchors(anchors,0);
    const missing=catalog.find(anchor=>anchor.path==='0.scenes.0.outcome')!;
    const action=anchors.find(anchor=>anchor.path==='0.content'&&!anchor.id.includes(':c'))!;
    const rows=catalog.filter(anchor=>anchor.id!==missing.id).map(anchor=>({chapterNumber:4,actionAnchorId:action.id,resultAnchorId:anchor.id,bridgeAnchorId:anchor.path==='0.scenes.1.outcome'?'':action.id,status:anchor.path==='0.scenes.1.outcome'?'gap':'supported',reason:anchor.path==='0.scenes.1.outcome'?'没有呈现证人仍然在场的行为依据':'实际登记行动可支持登记完成的直接结果'}));
    const service=new RealLLMService({} as any);
    const generate=vi.fn().mockResolvedValueOnce({content:JSON.stringify({causalAudit:{status:'evaluated',reason:'首轮只检查了部分实际结果',transitions:rows}})})
      .mockResolvedValueOnce({content:JSON.stringify({repairs:[{index:rows.length,actionAnchorId:action.id,resultAnchorId:missing.id,bridgeAnchorId:'',status:'gap',reason:'记录在自己的本子上，未呈现交给老人的动作'}]})});
    (service as any).generateInternal=generate;
    const result=await (service as any).auditPlanningActions({id:'r',context:'{}'}, {}, JSON.stringify({volumes:[{chapters:[chapter]}]}));
    expect(result.verified).toBe(true);
    expect(result.issues).toHaveLength(2);
    expect(result.audit.transitions.find((row:any)=>row.resultAnchorId===missing.id)).toMatchObject({chapterNumber:4,status:'gap'});
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toContain('不能重审');
  });
  const bad = { chapterNumber: 4, chapterFunction: 'climax', content: '他关上门。对手无法开门。' };
  const run = { id: 'r', context: JSON.stringify({ rule: '门外插销落下后，只能从门外移开。' }) };
  const gap = { chapterNumber: 4, actionEvidence: '他关上门。', resultEvidence: '对手无法开门。', bridgeEvidence: '', status: 'gap', reason: '关门本身没有剥夺对手正常开门能力，缺少实际限制条件' };
  it('does not turn a responsibility intention into an already fulfilled exit result', async () => {
    const service = new RealLLMService({} as any);
    const chapter = { chapterNumber: 4, chapterFunction: 'climax', responsibility: '她拿出录音，为案件留证。',
      prerequisites: ['同伴看过录音后答应合作。'], exitState: '她和同伴结成同盟。' };
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ causalAudit: { status: 'evaluated',
      reason: '保留未来司法采纳的疑虑', transitions: [{ chapterNumber: 4, actionEvidence: '她拿出录音，为案件留证。',
        resultEvidence: '为案件留证。', status: 'gap', bridgeEvidence: '', reason: '缺少司法采纳手续，无法证明证据已经采纳' }] } }) });
    (service as any).generateInternal = generate;
    const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({ volumes: [{ chapters: [chapter] }] }), 'exitState');
    expect(result.verified).toBe(false);
    expect(result.errors.join('；')).toContain('实际exitState');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0].prompt).toContain('resultAnchorIds');
    expect(generate.mock.calls[0][0].prompt).toContain('完整章节结构');
    expect(generate.mock.calls[0][0].prompt).toContain('beforeStateAnchorId');
    generate.mockReset().mockResolvedValue({ content: JSON.stringify({ causalAudit: { status: 'evaluated',
      reason: '同伴看过录音并答应合作', transitions: [{ chapterNumber: 4, actionEvidence: '她拿出录音，为案件留证。',
        resultEvidence: chapter.exitState, resultAnchorId: causalExitResultAnchors(causalEvidenceAnchors(JSON.stringify([chapter]), {}), chapter.exitState)[0].id,
        actionAnchorId: 'body:v2', beforeStateAnchorId: 'body:v2', requiredCondition: '同伴看过录音后答应合作', bridgeAnchorId: 'body:v3', status: 'supported', basisSource: 'body',
        bridgeEvidence: chapter.prerequisites[0], reason: '同伴实际答应合作，结成同盟已兑现' }] } }) });
    expect(await (service as any).auditPlanningActions(run, {}, JSON.stringify({ volumes: [{ chapters: [chapter] }] }), 'exitState'))
      .toMatchObject({ verified: true, issues: [] });
  });
  it('repairs an omitted exit result in the existing second call and preserves the other verdict', async () => {
    const chapter = { chapterNumber: 1, chapterFunction: 'climax', responsibility: '她发出通知。执行人收到命令。',
      exitState: '执行暂缓。他仍困在屋里。' };
    const anchors = causalEvidenceAnchors(JSON.stringify([chapter]), {});
    const results = causalExitResultAnchors(anchors, chapter.exitState);
    const original = { chapterNumber: 1, beforeStateAnchorId: 'body:v2:c1', requiredCondition: '执行人收到命令后停止执行', actionAnchorId: 'body:v2:c1', resultAnchorId: results[0].id,
      bridgeAnchorId: 'body:v2:c2', status: 'supported', reason: '执行人收到命令后暂缓执行' };
    const service = new RealLLMService({} as any);
    const generate = vi.fn().mockResolvedValueOnce({ content: JSON.stringify({ causalAudit: {
      status: 'evaluated', reason: '只核对了一项实际结果', transitions: [original] } }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ causalAudit: {status: 'evaluated', reason: '独立核对两项结果和行动前状态', transitions: [original, { chapterNumber: 1,
        beforeStateAnchorId: 'body:v2:c1', requiredCondition: '有实际限制屋内开门能力的条件', actionAnchorId: 'body:v2:c1', resultAnchorId: results[1].id, bridgeAnchorId: '',
        status: 'gap', reason: '暂缓通知不能限制屋内人的开门能力' }] } }) });
    (service as any).generateInternal = generate;
    const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({ volumes: [{ chapters: [chapter] }] }), 'exitState');
    expect(result).toMatchObject({ verified: true, issues: [{ chapterNumber: 1, issueType: 'causality_gap' }] });
    expect(result.audit.transitions[0]).toMatchObject(original);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].systemPrompt).toContain('独立因果反证核查员');
  });
  it('does not accept a supported conclusion without an anchored prior state and necessary condition', async () => {
    const chapter = {chapterNumber: 4, chapterFunction: 'climax', responsibility: '她递交材料。', exitState: '调查员收到了材料。'};
    const resultAnchorId = causalExitResultAnchors(causalEvidenceAnchors(JSON.stringify([chapter]), {}), chapter.exitState)[0].id;
    const service = new RealLLMService({} as any);
    const row = {chapterNumber: 4, actionAnchorId: 'body:v2', resultAnchorId, bridgeAnchorId: 'body:v2',
      status: 'supported', reason: '递交行为使调查员收到相应的材料'};
    const generate = vi.fn().mockResolvedValueOnce({content: JSON.stringify({causalAudit: {
      status: 'evaluated', reason: '只给结论而未核算行动前状态', transitions: [row]}})})
      .mockResolvedValueOnce({content: JSON.stringify({causalAudit: {status: 'evaluated', reason: '仍然遗漏状态和必要条件的核算', transitions: [row]}})});
    (service as any).generateInternal = generate;
    const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({volumes: [{chapters: [chapter]}]}), 'exitState');
    expect(result.verified).toBe(false);
    expect(result.errors.join('；')).toContain('行动前完整状态');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('blocks a quoted but false first-pass conclusion through the bounded independent countercheck', async () => {
    const chapter = {chapterNumber: 1, chapterFunction: 'climax', responsibility: '他先按时完成任务，再折返。', exitState: '折返使已完成任务超时。'};
    const resultAnchorId = causalExitResultAnchors(causalEvidenceAnchors(JSON.stringify([chapter]), {}), chapter.exitState)[0].id;
    const service = new RealLLMService({} as any);
    const row = {chapterNumber: 1, beforeStateAnchorId: 'body:v2', requiredCondition: '折返时任务仍未完成',
      actionAnchorId: 'body:v2', resultAnchorId, bridgeAnchorId: 'body:v2', status: 'supported', reason: '先完成任务再折返因此任务超时'};
    const audit = (transition: any) => ({causalAudit: {status: 'evaluated', reason: '核对原文行动与实际结果顺序', transitions: [transition]}});
    const generate = vi.fn().mockResolvedValueOnce({content: JSON.stringify(audit(row))})
      .mockResolvedValueOnce({content: JSON.stringify(audit({...row, status: 'gap', bridgeAnchorId: '',
        reason: '任务已先按时完成，后续折返不能令该任务超时'}))});
    (service as any).generateInternal = generate;
    const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({volumes: [{chapters: [chapter]}]}), 'exitState');
    expect(result).toMatchObject({verified: true, issues: [{chapterNumber: 1, issueType: 'causality_gap'}]});
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].metrics.stepKey).toBe('framework_action_state_countercheck');
  });
  it('blocks creation persistence on proven gaps or incomplete audits, with no rewrite', async () => {
    for (const verified of [true, false]) {
      const metrics = { beginRun: vi.fn(() => run), finishRun: vi.fn(), blockRunValidation: vi.fn() };
      const service = new RealLLMService({} as any, metrics as any);
      const evidence = { status: verified ? 'evaluated' : 'not_evaluated', transitions: [gap] };
      const audit = vi.fn().mockResolvedValue({ verified, errors: ['引文合同未完成'], issues: verified ? [{ summary: gap.reason }] : [], audit: evidence });
      (service as any).auditPlanningActions = audit;
      await expect(service.validatePlanningActions('p', [bad], { analysis: '已确认章节责任' }))
        .rejects.toMatchObject({ gateRejection: true, planningActionAudit: evidence, report: { status: verified ? 422 : 503,
          prefix: verified ? '章纲行动结果未通过，当前章纲未保存' : '章纲行动结果评审未完成，当前章纲未保存' } });
      expect(audit).toHaveBeenCalledTimes(1);
      expect(metrics.finishRun).toHaveBeenCalledWith('r', 'failed', expect.any(Number), expect.any(String), expect.any(String));
      expect(metrics.blockRunValidation).toHaveBeenCalledWith('r', expect.any(String), evidence);
      await service.validatePlanningActions('p', [{ ...bad, chapterFunction: 'paving' }], {});
      expect(metrics.beginRun).toHaveBeenCalledTimes(1);
    }
  });
  it('retains the actual causal gap instead of accepting a result assertion as proof', async () => {
    const service = new RealLLMService({} as any);
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ causalAudit: { status: 'evaluated', reason: '独立核对关键行动及对手正常反应', transitions: [gap] } }) });
    (service as any).generateInternal = generate;
    const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({ volumes: [{ chapters: [bad] }] }));
    expect(result.verified).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('rejects a cross-chapter transition even when other rows cover every chapter', async () => {
    const other = { chapterNumber: 5, chapterFunction: 'resolution', content: '他提交材料。调查人员找到了线索。' };
    const rows = [gap, { chapterNumber: 5, actionEvidence: '他提交材料。', resultEvidence: '调查人员找到了线索。',
      bridgeEvidence: '', status: 'gap', reason: '提交的材料没有实际交代可供调查的来源' },
      { ...gap, resultEvidence: '调查人员找到了线索。' }];
    const service = new RealLLMService({} as any);
    const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ causalAudit: { status: 'evaluated', reason: '核对实际章号与必要行动结果', transitions: rows } }) });
    (service as any).generateInternal = generate;
    const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({ volumes: [{ chapters: [bad, other] }] }));
    expect(result.verified).toBe(false);
    expect(result.errors.join('；')).toContain('第3项因果审查的章号');
    expect(generate.mock.calls[0][0].prompt).toContain('章号与本章证据地址对应');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('accepts an established mechanism and rejects wrong-chapter proof within two calls', async () => {
    const good = { ...bad, content: '其他人已先撤出。他在门外落下插销。对手被留在屋内。' };
    for (const chapterNumber of [4, 99]) {
      const service = new RealLLMService({} as any);
      const generate = vi.fn().mockResolvedValue({ content: JSON.stringify({ causalAudit: { status: 'evaluated', reason: '必要条件有已确认限制和本章实际动作', transitions: [{ chapterNumber, actionEvidence: '他在门外落下插销。', resultEvidence: '对手被留在屋内。', basisSource: 'project_context', bridgeEvidence: '门外插销落下后，只能从门外移开。', status: 'supported', reason: '撤离在先，按既定插销限制锁住出口，结果由本章动作产生' }] } }) });
      (service as any).generateInternal = generate;
      const result = await (service as any).auditPlanningActions(run, {}, JSON.stringify({ volumes: [{ chapters: [good] }] }));
      expect(result.verified).toBe(chapterNumber === 4);
      expect(generate).toHaveBeenCalledTimes(chapterNumber === 4 ? 1 : 2);
    }
  });
});

it.each(['long-novel-flexible-outline', 'writing_climax'])('shares the frozen planning snapshot without exposing future facts to unrelated prose generation: %s', async (scenario) => {
  const constitution = readConstitution({ target_platform: 'fanqie', settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], genreFitNote: '现实城市职业与人际冲突推动人物选择', pov: '第三人称限知' } });
  const snapshot = JSON.stringify({ world: '须凭当单授权进楼', foreshadowings: ['前章埋设设备登录线索，后章揭示'] });
  const metrics = { beginRun: vi.fn(() => ({ id: 'r', constitution, context: snapshot, lessons: [] })), finishRun: vi.fn(), recordEvent: vi.fn() };
  const service = new RealLLMService({} as any, metrics as any);
  const generate = vi.fn().mockResolvedValue({ content: '候选', finishReason: 'stop' });
  (service as any).generateInternal = generate;
  await service.generate({ prompt: '候选生成', scenario, deferQualityGate: true });
  expect(generate.mock.calls[0][0].systemPrompt.includes(snapshot)).toBe(scenario === 'long-novel-flexible-outline');
});

it.each(['{invalid JSON', '{"dimensions":{"issues":[]}}'])('retains an invalid full review and requires a full re-review without rewriting: %s', async (firstResponse) => {
  const metrics = { runIsCurrent: vi.fn(() => true), saveRunScore: vi.fn(() => ({ passed: false, status: 'not_evaluated' })), selectRepairStrategy: vi.fn() };
  const service = new RealLLMService({} as any, metrics as any);
  const constitution = readConstitution({ target_platform: 'fanqie', settings: { category: '悬疑', storyTone: ['冷峻'], writingStyle: ['简练'], webNovelGenre: ['都市'], genreFitNote: '现实城市职业与人际冲突推动人物选择', pov: '第三人称限知' } });
  (service as any).generateInternal = vi.fn().mockResolvedValueOnce({ content: firstResponse }).mockResolvedValueOnce({ content: '{"scores":{}}' });
  let error: any;
  try { await (service as any).evaluateGeneratedRun({ id: 'r', projectId: 'p', stage: 'outline', constitution, context: '{}', previousChapters: [], characterNames: [] }, {}, '规划原文。'); } catch (value) { error = value; }
  expect(error.report.kinds).toEqual(['review_incomplete']);
  expect(error.report.status).toBe(503);
  expect(error.message).toContain('platform');
  const score = metrics.saveRunScore.mock.calls[0][2] as any;
  expect(score.assessmentDiagnostics).toHaveLength(2);
  expect(score.assessmentDiagnostics[0].rawResponse).toBe(firstResponse);
  expect(score.assessmentDiagnostics[0].error).toBeTruthy();
  expect(score.assessmentDiagnostics[1].missingDimensions).toContain('platform');
  expect((service as any).generateInternal.mock.calls[1][0].prompt).toContain('evidenceKind');
  expect((service as any).generateInternal.mock.calls[1][0].prompt).not.toContain('只补评这些维度');
  expect(metrics.selectRepairStrategy).not.toHaveBeenCalled();
});

it('reports the actual rejected candidate blocker while retaining the original body and gate',async()=>{
 const metrics={runIsCurrent:vi.fn(()=>true),saveRunScore:vi.fn(()=>({passed:false,status:'blocked'})),selectRepairStrategy:vi.fn(()=> 'scene_structure_patch'),recordRepair:vi.fn(()=> 'repair')};
 const service=new RealLLMService({} as any,metrics as any);
 const body='保留的既定正文。'.repeat(40)+'五个时间点。';
 const issue=(ruleId:string,message:string)=>({id:ruleId,ruleId,message,status:'open',severity:'blocking',evaluation:'evidenced'});
 const before={status:'evaluated',issues:[issue('constitution.logic','时间点计数错误')],dimensions:{}};
 const after={status:'evaluated',issues:[issue('constitution.timeline','同一已确认事件历时与起止钟点不兼容')],dimensions:{}};
 (service as any).assessGeneratedRun=vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
 (service as any).generateInternal=vi.fn().mockResolvedValue({content:JSON.stringify({patches:[{original:'五个时间点。',replacement:'六个时间点。'}]})});
 let error:any;try{await (service as any).evaluateGeneratedRun({id:'run',projectId:'p',stage:'chapter',constitution:{},context:'{}'}, {},body);}catch(value){error=value;}
 expect(error.gateRejection).toBe(true);expect(error.generatedContent).toBe(body);
 expect(error.message).toContain('修复候选未采用');expect(error.message).toContain('constitution.timeline');expect(error.message).toContain('原稿保留');
 expect(metrics.recordRepair.mock.calls[0][6]).toBe(false);expect(metrics.saveRunScore).toHaveBeenCalledTimes(1);
});

describe('RealLLMService structured output guard', () => {
  it('forwards json_object mode to the provider call', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' });

    // The transport now carries explicit thinking override and abort signal.
    expect(callModel.mock.calls[0][0]).toBe('deepseek-flash');
    expect(callModel.mock.calls[0][1]).toBe('输出JSON对象');
    expect(typeof callModel.mock.calls[0][2]).toBe('string');
    expect(callModel.mock.calls[0].slice(3, 8)).toEqual([
      0.4, 4096, 600_000, 'json_object', undefined,
    ]);
    expect(callModel.mock.calls[0][8]).toBeUndefined();
    expect(callModel.mock.calls[0][9]).toBeInstanceOf(AbortSignal);
    expect(response.content).toBe('{"ok":true}');
    expect(response.finishReason).toBe('stop');
    expect(String(callModel.mock.calls[0][2] || '')).not.toContain('执行前置规则');
  });

  it('rejects an empty structured response instead of passing it to the parser', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '   ', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' }))
      .rejects.toThrow('模型返回空内容');
    // 三次物理调用：同配置补发两次仍空，最后一次关闭思考补发（执行标准「模型空内容三档恢复」）
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls.map(call => call[8])).toEqual([undefined, undefined, true]);
  });

  it('rejects a length-truncated structured response for a clean retry', async () => {
    const service = createService();
    (service as any).callModel = vi.fn().mockResolvedValue({ content: '{"partial":', finishReason: 'length' });

    await expect(service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object' }))
      .rejects.toThrow('结构化生成因输出长度被截断');
  });

  it('recovers a single-chapter JSON truncation at the ceiling without changing model, prompt or contract', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '{"title":"半截', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"title":"完整章纲"}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '完整单章合同', scenario: 'outline', responseFormat: 'json_object',
      maxTokens: 32768, metrics: { stepKey: 'creation_chapter_detail', projectId: 'test-project' },
    });

    expect(response.content).toBe('{"title":"完整章纲"}');
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0].slice(0, 7)).toEqual(callModel.mock.calls[1].slice(0, 7));
    expect(callModel.mock.calls[1][8]).toBe(true);
  });

  it.each([false, true])('recovers a single local repair at the ceiling, including network retry=%s', async (network) => {
    const service = createService();
    const callModel = vi.fn();
    if (network) callModel.mockRejectedValueOnce(new Error('ECONNRESET'));
    callModel.mockResolvedValueOnce({content:'{"patches":[',finishReason:'length'})
      .mockResolvedValueOnce({content:'{"patches":[]}',finishReason:'stop'});
    (service as any).callModel = callModel;
    const response = await service.generate({prompt:'保留完整上下文与修复契约',scenario:'refinement',
      responseFormat:'json_object',maxTokens:32768,structuredRepairIssueCount:1,
      metrics:{stepKey:'outline_local_repair_2'}});
    expect(response.content).toBe('{"patches":[]}');
    const calls = callModel.mock.calls;
    expect(calls.at(-1)!.slice(0,7)).toEqual(calls.at(-2)!.slice(0,7));
    expect(calls.at(-1)![8]).toBe(true);
    expect(callModel).toHaveBeenCalledTimes(network ? 3 : 2);
  }, 10000);

  it.each([1, 2])('stops after one recovery or rejects a multi-issue repair: count=%s', async (count) => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({content:'{"patches":[',finishReason:'length'});
    (service as any).callModel = callModel;
    await expect(service.generate({prompt:'不得接受半截补丁',scenario:'refinement',
      responseFormat:'json_object',maxTokens:32768,structuredRepairIssueCount:count,
      metrics:{stepKey:'outline_local_repair_2'}})).rejects.toMatchObject({structuredOutputTruncated:true});
    expect(callModel).toHaveBeenCalledTimes(count === 1 ? 2 : 1);
  });

  it('expands an empty length-truncated response before treating it as a generic empty response', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"ideas":[]}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object', maxEmptyRetries: 1,
    });

    expect(response.content).toBe('{"ideas":[]}');
    expect(callModel.mock.calls[0][4]).toBe(4096);
    expect(callModel.mock.calls[1][4]).toBe(8192);
  });

  it('honors a caller-provided output budget instead of replacing it with the scenario default', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '{"foreshadowings":[]}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object', maxTokens: 7200,
    });

    // The transport now carries explicit thinking override and abort signal.
    expect(callModel.mock.calls[0][0]).toBe('deepseek-flash');
    expect(callModel.mock.calls[0][1]).toBe('输出JSON对象');
    expect(typeof callModel.mock.calls[0][2]).toBe('string');
    expect(callModel.mock.calls[0].slice(3, 8)).toEqual([
      0.4, 7200, 600_000, 'json_object', undefined,
    ]);
    expect(callModel.mock.calls[0][8]).toBeUndefined();
    expect(callModel.mock.calls[0][9]).toBeInstanceOf(AbortSignal);
  });

  it('keeps the expanded budget and explicit temperature during a network retry', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object',
      maxTokens: 32768, temperature: 0,
    });

    expect(response.content).toBe('{"ok":true}');
    expect(callModel.mock.calls[1][3]).toBe(0);
    expect(callModel.mock.calls[1][4]).toBe(32768);
  }, 10_000);

  it('retries a disconnected empty-output recovery with the same thinking mode', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockRejectedValueOnce(new Error('UND_ERR_SOCKET: other side closed'))
      .mockResolvedValueOnce({ content: '完整正文', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({ prompt: '生成正文', scenario: 'writing_climax', maxTokens: 32768 });

    expect(response.content).toBe('完整正文');
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls.map(call => call[8])).toEqual([undefined, true, true]);
    expect(callModel.mock.calls[2].slice(0, 8)).toEqual(callModel.mock.calls[1].slice(0, 8));
  }, 10_000);

  it('gives a neutral retry action for a closed socket', () => {
    const service = createService();
    const diagnosis = (service as any).describeNetworkError({
      message: 'Connection error', cause: { code: 'UND_ERR_SOCKET', message: 'other side closed' },
    });
    expect(diagnosis.guidance).toContain('重试当前操作');
    expect(diagnosis.guidance).not.toContain('项目看板');
  });

  it('does not silently lower the configured model reasoning level', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '正文...', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await service.generate({ prompt: '生成正文', scenario: 'daily' });

    // The transport now carries explicit thinking override and abort signal.
    expect(callModel.mock.calls[0][0]).toBe('deepseek-flash');
    expect(callModel.mock.calls[0][1]).toBe('生成正文');
    expect(typeof callModel.mock.calls[0][2]).toBe('string');
    expect(callModel.mock.calls[0].slice(3, 8)).toEqual([
      0.4, 4096, 600_000, undefined, undefined,
    ]);
    expect(callModel.mock.calls[0][8]).toBeUndefined();
    expect(callModel.mock.calls[0][9]).toBeInstanceOf(AbortSignal);
  });

  it('rejects an empty plain-text (body generation) response instead of returning it empty', async () => {
    const service = createService();
    const callModel = vi.fn().mockResolvedValue({ content: '', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '生成正文', scenario: 'daily' }))
      .rejects.toThrow('模型返回空内容');
    // 三次物理调用：同配置补发两次仍空，最后一次关闭思考补发（执行标准「模型空内容三档恢复」）
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls.map(call => call[8])).toEqual([undefined, undefined, true]);
  });

  it('keeps temperature stable when an empty response is补发', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '', finishReason: 'stop' })
      .mockResolvedValueOnce({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    await service.generate({ prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object', temperature: 0.2 });

    expect(callModel.mock.calls.map(call => call[3])).toEqual([0.2, 0.2]);
  });

  it('expands an empty length-truncated response inside the network-retry branch (regression: 空内容+length 在重试分支直接判死)', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('Connection error: other side closed'))
      .mockResolvedValueOnce({ content: '', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '正文内容...', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '生成正文', scenario: 'daily', maxEmptyRetries: 1,
    });

    expect(response.content).toBe('正文内容...');
    // 三次调用：网络失败 → 空+length（应扩容）→ 扩容后成功
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls[1][4]).toBe(4096);
    expect(callModel.mock.calls[2][4]).toBe(8192);
  });

  // ⚠️ 口径变更（防复发）：网络重试分支过去遇到 "空内容+length" 只补发一轮，
  // 与主循环"翻倍到硬顶"的口径不一致，还会把截断误报成"模型返回空内容"。
  // 现在与主循环共用同一个扩容口径（nextExpandedMaxTokens），一直翻倍到硬顶，
  // 仍不足才以【结构化截断】失败 —— 调用方据此判定"该缩小单批规模"，而不是当成模型故障重试。
  it('keeps expanding to the ceiling in the network-retry branch, then fails as 结构化截断', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({ content: '', finishReason: 'length' });
    (service as any).callModel = callModel;

    await expect(service.generate({ prompt: '生成正文', scenario: 'daily', maxEmptyRetries: 1 }))
      .rejects.toThrow('结构化生成因输出长度被截断');
    // 末次物理调用必须已经用满硬顶，而不是停在第一档扩容就判死
    const budgets = callModel.mock.calls.map(call => call[4] as number);
    expect(Math.max(...budgets)).toBe(32768);
  });

  // ⚠️ 回归测试（防复发）：截断扩容与"空内容重试"必须是两个独立预算。
  // 历史缺陷：扩容条件写作 `attempt < maxEmptyRetries`，于是 maxEmptyRetries=1 时
  // 只允许"一轮"扩容——配置 4096 的调用点最多扩到 8192 就被判定"已扩容仍不足"。
  it('does not let the empty-response retry budget cap truncation expansion (regression)', async () => {
    const service = createService();
    const callModel = vi.fn()
      .mockResolvedValueOnce({ content: '{"partial":', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"partial":', finishReason: 'length' })
      .mockResolvedValueOnce({ content: '{"ok":true}', finishReason: 'stop' });
    (service as any).callModel = callModel;

    const response = await service.generate({
      prompt: '输出JSON对象', scenario: 'outline', responseFormat: 'json_object',
      maxTokens: 4096, maxEmptyRetries: 1,
    });

    expect(response.content).toBe('{"ok":true}');
    expect(callModel.mock.calls.map(call => call[4])).toEqual([4096, 8192, 16384]);
  });
});

 it('preserves scores and repairs when the dimensions closing brace is missing', () => {
  const dimensions={category:{score:88,reason:'作者确认定位',evidence:['同一原文']}};
  const repairs=[{index:0,evidenceAnchorId:'body:p1'}];
  const malformed=JSON.stringify({dimensions}).slice(0,-2)+',"repairs":'+JSON.stringify(repairs)+'}';
  expect(parseScoreReviewJson(malformed)).toEqual({value:{dimensions,repairs},normalized:true});
  expect(() => parseScoreReviewJson(malformed.slice(0,-3))).toThrow();
  expect(() => parseScoreReviewJson(JSON.stringify({dimensions:{...dimensions,repairs},repairs:[]}))).toThrow();
 });

it('applies saved-generation output sizing at the actual model-call boundary',async()=>{
 const service=createService(),callModel=vi.fn().mockResolvedValue({content:'{"ok":true}',finishReason:'stop',usage:{promptTokens:5,completionTokens:5,totalTokens:10}});
 (service as any).callModel=callModel;
 await service.generate({prompt:'本地协议检查',scenario:'idea_generate',responseFormat:'json_object',maxTokens:32768,deferQualityGate:true});
 expect(callModel).toHaveBeenCalledOnce();expect(callModel.mock.calls[0][4]).toBe(131072);
});
