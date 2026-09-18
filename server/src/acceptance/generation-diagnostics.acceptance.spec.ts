import { afterEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { PlatformAnalyticsService } from '../modules/platform-analytics/platform-analytics.service';
import { ModuleStandardsService } from '../modules/module-standards/module-standards.service';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { RealLLMService } from '../chain/real-llm.service';
import { ChainController } from '../chain/chain.controller';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
afterEach(() => standardDirectiveCache.clear());

it('reports one model configuration failure and shows it on the workbench before a project exists', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const metrics = new GenerationMetricsService(database);
    const router = { getModelForScenario: vi.fn(() => { throw new Error('灵感场景未配置模型，请前往设置'); }) };
    const llm = new RealLLMService(router as any, metrics);
    const generate = vi.spyOn(llm, 'generate');
    const controller = Object.create(ChainController.prototype);
    Object.assign(controller, { realLLM: llm, logger: { log: vi.fn(), error: vi.fn() } });
    const result = await controller.ideaDiscover({ storyType: 'short_story', platform: 'fanqie', count: 5 });
    expect(result).toMatchObject({ success: false, ideas: [], error: '灵感场景未配置模型，请前往设置' });
    expect(generate).not.toHaveBeenCalled();
    expect(router.getModelForScenario).toHaveBeenCalledTimes(1);
    const analytics = new PlatformAnalyticsService(database);
    const overview = analytics.overview();
    expect(overview.generationRuns).toMatchObject({ available: true, total: 1, failed: 1 });
    expect(overview.generationRuns.recent[0].error).toContain('未配置模型');
    expect(overview.kpis.llmCalls).toBe(0);
    expect(analytics.overview({ projectId: 'another-project' }).generationRuns.total).toBe(0);
  } finally { db.close(); }
});

it('generates a complete idea batch with one configured-model call and reuses an identical in-flight request', async () => {
  const makeIdea = (index: number) => ({
    title: `危城倒计时${index}`,
    alternateTitles: [`危机备选${index}甲`, `危机备选${index}乙`],
    storyType: 'short_story',
    angle: `职业危机${index}`,
    hook: `第${index}位主角在截止日前发现唯一证据被调包，若不能当晚找回，他会失去工作、家人信任和最后的申诉机会。`,
    description: `主角先发现一份会改变命运的关键材料被人替换，为保住工作与家人的信任，他必须在当晚追查经手人。调查不断暴露新的利益关系，对手也主动销毁证据并误导同事。主角被迫公开自己的旧错换取线索，随后作出无法撤回的选择，最终利用前文留下的细节改变双方胜负条件，并承担选择带来的关系代价。`,
    setting: '当代城市职业环境', protagonist: '有旧错的基层从业者', characters: ['主角', '对手', '证人'],
    styleTags: ['现实', '悬疑'], storyTone: ['悬疑'], writingStyle: ['白描'], webNovelGenre: ['现实/无流派'],
    targetPlatform: 'fanqie', tone: '冲突直接且适合移动阅读', estimatedWords: 20_000, plannedChapters: 4,
    scopeBreakdown: [{ arc: '危机与追查', chapters: 4, reason: '完成调查、选择、反转与收束' }],
    scopeReason: '四章分别承担危机、追查、选择与反转收束',
    coreConflict: '主角要在时限内公开真相，对手要销毁证据保住既得利益',
    uniquePoint: '第一章即让关键证据在主角眼前被调包',
    mainReversal: '主角的旧错其实是识破调包手法的唯一钥匙',
  });
  const realLLM = {
    assertScenarioModelConfigured: vi.fn(() => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash' })),
    generate: vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { content: JSON.stringify({ ideas: [1, 2, 3, 4, 5].map(makeIdea) }) };
    }),
  };
  const controller = Object.create(ChainController.prototype);
  Object.assign(controller, { realLLM, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  const request = { storyType: 'short_story' as const, platform: 'fanqie', count: 5 };

  const [first, duplicate] = await Promise.all([controller.ideaDiscover(request), controller.ideaDiscover(request)]) as any[];

  expect(first).toMatchObject({ success: true, totalIdeas: 5 });
  expect(duplicate).toEqual(first);
  expect(realLLM.generate).toHaveBeenCalledTimes(1);
  expect(realLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
    scenario: 'idea_generate', responseFormat: 'json_object', maxEmptyRetries: 1,
  }));
});

it('upgrades current standards, keeps an internal audit snapshot, and records active versions on generation runs', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const metrics = new GenerationMetricsService(database);
    const standards = new ModuleStandardsService(database, {} as any, metrics);
    standards.ensureSeeded();
    db.prepare("UPDATE module_standards SET seed_baseline_version=3,requirements_json='[\"旧要求\"]' WHERE module_key='inspiration'").run();
    standards.ensureSeeded(); standards.loadToCache();
    expect(db.prepare("SELECT COUNT(*) n FROM module_standard_versions WHERE module_key='inspiration' AND trigger='seed_upgrade'").get().n).toBe(1);
    expect(standardDirectiveCache.get('idea_generate')).toContain('一次操作最多两次逻辑调用');
    expect(standardDirectiveCache.get('idea_generate')).toContain('长篇总字数不少于100000字');
    expect(standardDirectiveCache.get('writing')).toContain('Creative Constitution');
    const run = metrics.beginRun(undefined, 'idea_generate', '测试');
    const snapshot = JSON.parse(db.prepare('SELECT standards_snapshot FROM generation_runs WHERE id=?').get(run.id).standards_snapshot);
    expect(snapshot.modules).toContainEqual({ key: 'inspiration', version: 2, baseline: 7 });
    expect(snapshot.modules).toContainEqual({ key: 'quality_loop', version: 1, baseline: 7 });
    const noStandards = metrics.beginRun(undefined, 'daily', '测试', undefined, undefined, undefined, false);
    expect(JSON.parse(db.prepare('SELECT standards_snapshot FROM generation_runs WHERE id=?').get(noStandards.id).standards_snapshot).enabled).toBe(false);
  } finally { db.close(); }
});
