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
describe('模型 ID 纪律：使用提供商返回的准确 ID', () => {
  beforeAll(() => {
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-route-'));
  });

  it('ModelRouter 将已退役的 Flash 别名收敛为当前 API ID，其它名称原样透传', async () => {
    const router = new ModelRouterService({ get: () => undefined } as any);
    await router.onModuleInit();
    (router as any).currentMode = 'economy';
    router.setCustomScenes({
      'daily:economy': 'deepseek-v4-flash',
      'outline:economy': 'deepseek-v4-flash',
      'writing:economy': 'deepseek-my-proxy-name',
    });
    const daily = await router.getModelForScenario('daily');
    expect(daily.modelName).toBe('deepseek-flash');
    expect(daily.modelVersion).toBe('deepseek-flash');
    const outline = await router.getModelForScenario('outline');
    expect(outline.modelVersion).toBe('deepseek-flash');
    // 任意代理自定义版本名也原样透传
    const writing = await router.getModelForScenario('writing');
    expect(writing.modelVersion).toBe('deepseek-my-proxy-name');
    expect(JSON.stringify([daily, outline, writing])).not.toContain('deepseek-chat');
  });

  it('routes auxiliary and unknown scenes only to the configured daily model', async () => {
    const router = new ModelRouterService({ get: () => undefined } as any);
    await router.onModuleInit();
    (router as any).currentMode = 'economy';
    (router as any).customScenes = {
      'daily:economy': 'daily-exact-model',
      'writing:economy': 'writing-exact-model',
    };
    expect(router.getModelForScenario('summary').modelName).toBe('daily-exact-model');
    expect(router.getModelForScenario('state_extraction').modelName).toBe('daily-exact-model');
    expect(router.getModelForScenario('unregistered_internal_task').modelName).toBe('daily-exact-model');
  });

  it('仅存在一个模式的已保存配置时恢复该模式，不误用进程默认模式', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-route-mode-'));
    fs.writeFileSync(path.join(dataDir, 'custom-scenes.json'), JSON.stringify({
      'idea_generate:economy': 'deepseek-v4-flash',
      'daily:economy': 'deepseek-v4-flash',
    }));
    process.env.DATA_DIR = dataDir;
    const router = new ModelRouterService({ get: () => undefined } as any);
    await router.onModuleInit();

    expect(router.getWritingMode()).toBe('economy');
    expect(router.getModelForScenario('idea_generate').modelVersion).toBe('deepseek-flash');
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'custom-scenes.json'), 'utf8'))['daily:economy']).toBe('deepseek-flash');
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'writing-mode.json'), 'utf8'))).toEqual({ mode: 'economy' });
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
    expect(() => resolve('deepseek')).toThrow(/具体模型 ID/);
  });

  it('加载 BYOK 时清理输入空格，并让具体 DeepSeek 模型读取提供商 Key', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-route-key-'));
    fs.writeFileSync(path.join(dataDir, 'user-keys.json'), JSON.stringify([{
      projectId: 'global', modelName: ' deepseek ', apiKey: ' secret-key ',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }]));
    process.env.DATA_DIR = dataDir;
    const router = new ModelRouterService({ get: () => undefined } as any);
    await router.onModuleInit();
    const llm = new RealLLMService(router, {} as any);
    const runtime = (llm as any).resolveRuntimeModel('deepseek-v4-flash');

    expect(router.getUserKey('global', 'deepseek')?.apiKey).toBe('secret-key');
    expect((llm as any).getApiKey(runtime)).toBe('secret-key');
  });
});
