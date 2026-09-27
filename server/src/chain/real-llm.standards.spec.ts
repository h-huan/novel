import { afterEach, expect, it, vi } from 'vitest';
import { RealLLMService } from './real-llm.service';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
afterEach(() => standardDirectiveCache.clear());
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
