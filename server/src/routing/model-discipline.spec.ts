import { describe, it, expect, beforeAll } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ModelRouterService } from './model-router.service';
import { RealLLMService } from '../chain/real-llm.service';

/**
 * 模型名纪律回归测试（红线：设置里配什么模型版本，就原样使用什么名称，
 * 不做别名映射、不降级、不偷偷改成任何固定默认版本）。
 * 防止 deepseek-chat 之类“内置默认模型名”问题再次出现。
 */
describe('模型名纪律：配什么版本就原样使用什么名称', () => {
  beforeAll(() => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-route-'));
  });

  it('ModelRouter 场景配置原样透传，不做版本映射', async () => {
    const router = new ModelRouterService({ get: () => undefined } as any);
    await router.onModuleInit();
    (router as any).currentMode = 'economy';
    (router as any).customScenes = {
      'daily:economy': 'deepseek-v4-flash',
      'outline:economy': 'deepseek-v4-flash',
      'writing:economy': 'deepseek-my-proxy-name',
    };
    const daily = await router.getModelForScenario('daily');
    expect(daily.modelName).toBe('deepseek-v4-flash');
    expect(daily.modelVersion).toBe('deepseek-v4-flash');
    const outline = await router.getModelForScenario('outline');
    expect(outline.modelVersion).toBe('deepseek-v4-flash');
    // 任意代理自定义版本名也原样透传
    const writing = await router.getModelForScenario('writing');
    expect(writing.modelVersion).toBe('deepseek-my-proxy-name');
    expect(JSON.stringify([daily, outline, writing])).not.toContain('deepseek-chat');
  });

  it('RealLLM 运行时：deepseek-* 原样透传，笼统 deepseek 直接报错', () => {
    const llm = new RealLLMService({
      getConfig: () => ({ defaults: { maxTokens: 4096 }, scenarios: {} }),
      getModelInfo: () => undefined,
    } as any);
    const resolve = (m: string) => (llm as any).resolveRuntimeModel(m);
    for (const name of ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-my-proxy-name']) {
      const rt = resolve(name);
      expect(rt.provider).toBe('deepseek');
      expect(rt.apiModel).toBe(name);
    }
    expect(() => resolve('deepseek')).toThrow(/具体版本/);
  });
});
