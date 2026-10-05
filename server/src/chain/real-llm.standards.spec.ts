import { afterEach, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { SEED_MODULE_STANDARDS, CHAPTER_COORDINATE_CONTRACT, SEED_BASELINE_VERSION } from '../modules/module-standards/module-standards.seed';
afterEach(() => standardDirectiveCache.clear());

it('loads coordinate and evaluation discipline from the execution standard for every generation scene', async () => {
  standardDirectiveCache.rebuild(SEED_MODULE_STANDARDS.map(s=>({ ...s, version: 1, seed_baseline_version: SEED_BASELINE_VERSION,
    steps_json: JSON.stringify(s.steps), requirements_json: JSON.stringify(s.requirements), rules_json: JSON.stringify(s.rules) })));
  const service = new RealLLMService({ getConfig: () => ({ defaults: { maxTokens: 4096 } }),
    getModelForScenario: () => ({ modelName: 'fixture', modelVersion: 'fixture', temperature: 0 }) } as any);
  const call = vi.fn(async () => ({ content: '{}', finishReason: 'stop' }));
  (service as any).callModel = call;
  for(const scenario of ['outline','review','writing','writing_climax','foreshadowing','timeline']) {
    await service.generate({prompt:'通用任务',scenario});
    const system = (call.mock.calls.at(-1) as any)[2] as string;
    expect(system.split(CHAPTER_COORDINATE_CONTRACT)).toHaveLength(2);
    expect(system).toContain('不得对报告执行正文精修');
    expect(system).toContain('同一地点的地址/楼层/房号与空间连通');
    if (['review','writing','writing_climax'].includes(scenario)) {
      expect(system).toContain('缺少语气词、沉默、动作或打断');
      expect(system).toContain('完整语义评审仍必须检查没有信息/关系/风险/选择推进');
    }
    if(scenario==='review') {
      expect(system).toContain('从本章详细合同提取具体必需事件');
      expect(system).toContain('完整语言语义验收必须明确给出prosePassed');
      expect(system).toContain('终章收尾可以是闭环或余韵');
    }
  }
});

it('never runs chapter prose gates on review JSON, while drafted prose still receives its gate', async () => {
  for(const projectId of ['project-a','project-b']) for(const chapterIndex of [1,4]) {
    const metrics = {beginRun:vi.fn(()=>({id:'run',stage:'refinement',constitution:{revision:1}})),finishRun:vi.fn()};
    const service = new RealLLMService({} as any,metrics as any);
    const report='{"pass":true,"requiredEvents":[],"contradictions":[]}';
    const generate=vi.spyOn(service as any,'generateInternal').mockResolvedValue({content:report});
    const gate=vi.spyOn(service as any,'evaluateGeneratedRun').mockImplementation(async(_run:any,_request:any,content:any)=>content);
    const reviewed=await service.generate({prompt:'评审正文',scenario:'review',responseFormat:'json_object',metrics:{projectId,chapterIndex,stepKey:'alignment_review'}});
    expect(reviewed.content).toBe(report);expect(gate).not.toHaveBeenCalled();expect(generate).toHaveBeenCalledTimes(1);
    await service.generate({prompt:'生成正文',scenario:'writing',metrics:{projectId,chapterIndex,stepKey:'body_first'}});
    expect(gate).toHaveBeenCalledTimes(1);
  }
});
it('injects the active standard into provider requests, and honors the injectStandard opt-out', async () => {
  standardDirectiveCache.rebuild([{ module_key: 'inspiration', module_name: '灵感', category: 'creation', scenarios: ['idea_generate'],
    version: 2, seed_baseline_version: 4, purpose: '测试当前生效规则', steps_json: '[]', requirements_json: '[]', rules_json: '[]', quality_bar: '' }]);
  const service = new RealLLMService({ getConfig: () => ({ defaults: { maxTokens: 4096 } }),
    getModelForScenario: () => ({ modelName: 'fixture', modelVersion: 'fixture', temperature: 0 }) } as any);
  const call = vi.fn(async () => ({ content: '结果', finishReason: 'stop' }));
  (service as any).callModel = call;
  await service.generate({ prompt: '题材', scenario: 'idea_generate' });
  const withStandard = (call.mock.calls[0] as any)[2] as string;
  expect(withStandard).toContain('测试当前生效规则');
  await service.generate({ prompt: '题材', scenario: 'idea_generate', injectStandard: false });
  const withoutStandard = (call.mock.calls[1] as any)[2] as string;
  expect(withoutStandard).toContain('执行前置规则');
  expect(withoutStandard).not.toContain('测试当前生效规则');
});

it('injects only standards declared for the normalized functional scene', () => {
  standardDirectiveCache.rebuild([
    { module_key: 'quality_loop', module_name: '质量闭环', category: 'crosscut', scenarios: ['writing', 'review'],
      version: 1, seed_baseline_version: 5, purpose: '闭环规则', steps_json: '[]', requirements_json: '[]', rules_json: '[]', quality_bar: '' },
    { module_key: 'title', module_name: '标题', category: 'creation', scenarios: ['idea_generate', 'outline'],
      version: 1, seed_baseline_version: 5, purpose: '标题规则', steps_json: '[]', requirements_json: '[]', rules_json: '[]', quality_bar: '' },
  ]);
  expect(standardDirectiveCache.get('chapter_synthesis')).toContain('闭环规则');
  expect(standardDirectiveCache.get('summary')).toBe('');
  expect(standardDirectiveCache.get('review')).toContain('闭环规则');
  expect(standardDirectiveCache.get('review')).not.toContain('标题规则');
  expect(standardDirectiveCache.get('daily', 'body_first')).toContain('闭环规则');
  expect(standardDirectiveCache.snapshot('daily', true, 'body_first').modules).toContainEqual({
    key: 'quality_loop', version: 1, baseline: 5,
  });
  expect(standardDirectiveCache.get('daily', 'summary')).toBe('');
});

it('keeps the daily model route but injects writing standards for body steps', async () => {
  standardDirectiveCache.rebuild([{ module_key: 'writing', module_name: '正文', category: 'creation', scenarios: ['writing'],
    version: 1, seed_baseline_version: 27, purpose: '六维正文执行', steps_json: '[]', requirements_json: '[]', rules_json: '[]', quality_bar: '' }]);
  const service = new RealLLMService({ getConfig: () => ({ defaults: { maxTokens: 4096 } }),
    getModelForScenario: () => ({ modelName: 'fixture', modelVersion: 'fixture', temperature: 0 }) } as any);
  const call = vi.fn(async () => ({ content: '合格正文', finishReason: 'stop' }));
  (service as any).callModel = call;
  await service.generate({ prompt: '正文', scenario: 'daily', metrics: { stepKey: 'body_first' } });
  expect((call.mock.calls[0] as any)[2]).toContain('六维正文执行');
  expect(standardDirectiveCache.snapshot('daily', true, 'body_first').available).toBe(true);
});
