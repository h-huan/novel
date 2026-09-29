import { afterEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { Migrator } from '../database/migrator';
import { GenerationMetricsService, chapterResponsibilityIssueSignature } from '../modules/generation-metrics/generation-metrics.service';
import { PlatformAnalyticsService } from '../modules/platform-analytics/platform-analytics.service';
import { ModuleStandardsService } from '../modules/module-standards/module-standards.service';
import { SEED_BASELINE_VERSION } from '../modules/module-standards/module-standards.seed';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { RealLLMService } from '../chain/real-llm.service';
import { ChainController } from '../chain/chain.controller';
import { IdeaAppealGateService } from '../chain/idea-appeal-gate.service';
import { updateConstitution } from '../modules/project/creative-constitution';
import { HttpException } from '@nestjs/common';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
afterEach(() => standardDirectiveCache.clear());

// 这里曾有只填平台/分类的旧版灵感请求，结果绕过四维创作设定；验收样例必须和正式入口同一硬门。
const discoveryStandards = {
  storyTone: ['悬疑'], writingStyle: ['白描/朴素'], webNovelGenre: ['悬疑'], plotTags: ['探案'], pov: '第三人称限知',
};

it('learns partial chapter-responsibility progress for future strategy ordering', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const now = new Date().toISOString();
    const constitution = updateConstitution({}, {
      type: 'short_story', targetPlatform: 'fanqie', webNovelGenre: ['规则怪谈'], targetWords: 16000,
    } as any);
    db.prepare(`INSERT INTO projects (id,type,title,status,target_words,current_words,platform_style,settings,created_at,updated_at,target_platform)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      'p-learning', 'short_story', '学习样本', 'active', 16000, 0, 'fanqie',
      JSON.stringify({ creativeConstitution: constitution }),
      now, now, 'fanqie',
    );
    const metrics = new GenerationMetricsService({ getDb: () => db } as any);
    const before = ['CR-1 能力授权边界：现实记录被超自然改写，未获逐字授权', 'CR-1 能力授权边界：痕迹被扩展出规则未授予的主动诱导能力'];
    metrics.recordChapterResponsibilityRepairAttempt('p-learning', before, 'constraint_matrix', false, [before[1]]);
    const row = db.prepare(`SELECT attempts,accepted,rollbacks,improvement_sum,introduced_issue_count
      FROM repair_strategy_stats WHERE rule_id=?`).get(chapterResponsibilityIssueSignature(before)) as any;
    expect(row).toMatchObject({ attempts: 1, accepted: 0, rollbacks: 0, introduced_issue_count: 0 });
    expect(row.improvement_sum).toBeCloseTo(0.5);
    expect(chapterResponsibilityIssueSignature(before)).toContain('capability_scope');
    expect(chapterResponsibilityIssueSignature(before)).toContain('reality_boundary');
  } finally { db.close(); }
});

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
    Object.assign(controller, { realLLM: llm, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });
    const result = await controller.ideaDiscover({ storyType: 'short_story', platform: 'fanqie', storyCategory: '悬疑灵异', count: 5, ...discoveryStandards });
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
  const premises = [
    { setting: '海岛气象站', hero: '失语气象员', description: '台风登陆前，失语气象员发现近海浮标连续报出不可能的逆风数据。他用手绘云图追查维修船，逐站核验潮位与航迹，却被同事催促发布撤离结论。每改正一个数据，走私船就失去一条安全航路；他最终必须在公开错误预报和放走被困渔民之间选择。', conflict: '主角要公开真实风场组织撤离，走私船队要维持假数据穿过封锁海域', point: '第一章用三张手绘云图证明电子风向整体被反写', reversal: '被认定失灵的旧浮标其实记录了维修船故意绕行的航迹' },
    { setting: '社区食堂', hero: '负债营养师', description: '社区食堂连续出现老人过敏，负债营养师从留样盒、进货克数和服药时间排除食材问题。供货商以欠款逼她签认责任，老人家属又拒绝交出监护文件。她沿着代餐券流向查到有人借免费餐控制独居老人财产，最后必须牺牲食堂经营资格换取完整账本。', conflict: '主角要保住老人自主权并查清过敏源，中介要借供餐记录制造失能证明', point: '第一章用每份餐少掉的七克盐定位被单独换过的餐盒', reversal: '过敏并非投毒，而是中介故意调换医嘱制造失能表象' },
    { setting: '县城剧团', hero: '替补提词员', description: '县剧团首演前，替补提词员发现老戏最后七句被人从所有台本剪掉，台上演员却坚持那段从未存在。她对照口型录像、道具走位和观众旧录音，一步步找回缺失唱词。团长用停演威胁所有人沉默，她只能让错误台词在直播中暴露一名演员被顶替多年的身份。', conflict: '主角要让缺失唱词重回舞台，被冒名者要在直播前销毁最后一份口传版本', point: '第一章通过演员无声口型还原被剪掉的第一句唱词', reversal: '失踪唱词不是政治禁词，而是一份被写进戏文的收养证明' },
    { setting: '跨境货车', hero: '退役检疫犬训导员', description: '封关倒计时开始后，退役训导员在货车夹层闻到检疫犬训练时才用的标记剂，却找不到违禁品。他必须沿冷链温度、犬只反应和收费站时间重建换货路径。同行要求他替年轻司机认下走私，他则发现整车无标签药材只是诱饵，真正被偷运的是一只没有芯片记录的繁育犬。', conflict: '主角要在封关前找回被偷运的繁育犬，车队老板要用药材案件掩盖活体交易', point: '第一章让一只已退役且拒绝工作的检疫犬只对空夹层示警', reversal: '人人看守的药材不是赃物，而是为了吸引检查资源的合法诱饵' },
    { setting: '旧城测绘队', hero: '色盲测绘员', description: '拆迁签字前，色盲测绘员发现新版地图删掉一条仍有人居住的窄巷，现场门牌却在系统中属于另一户。他不用颜色图层，改以井盖距离、墙缝朝向和旧地契尺寸复核边界。开发方催他确认测量误差，巷中老人也拒绝实名，他最终发现整片街区用一条不存在的道路完成过身份置换。', conflict: '主角要在签字前证明窄巷及住户存在，开发方要利用图层错误完成无主拆迁', point: '第一章通过五个井盖之间不可能的等距发现地图删掉了整条巷子', reversal: '地图误差并非为多占土地，而是为掩盖二十年前互换身份的安置名单' },
  ];
  const makeIdea = (index: number) => ({
    title: `危城倒计时${index}`,
    alternateTitles: [`危机备选${index}甲`, `危机备选${index}乙`],
    storyType: 'short_story',
    angle: `${premises[index - 1].setting}里的${premises[index - 1].hero}危机`,
    hook: `第${index}位主角在截止日前发现关键证据异常，若不能及时查清，他会失去工作、重要关系和最后的申诉机会。`,
    description: `${premises[index - 1].description}随着截止时间逼近，${premises[index - 1].hero}还要用该职业独有的现场方法验证每个结论，并为最后的公开选择承担不可撤回的关系代价。`,
    setting: premises[index - 1].setting, protagonist: premises[index - 1].hero, characters: ['主角', '对手', '证人'],
    styleTags: ['现实', '悬疑'], ...discoveryStandards,
    targetPlatform: 'fanqie', tone: '冲突直接且适合移动阅读', estimatedWords: 20_000, plannedChapters: 4,
    scopeBreakdown: [{ arc: '危机与追查', chapters: 4, reason: '完成调查、选择、反转与收束' }],
    scopeReason: '四章分别承担危机、追查、选择与反转收束',
    coreConflict: premises[index - 1].conflict,
    uniquePoint: premises[index - 1].point,
    mainReversal: premises[index - 1].reversal,
    noveltyProof: {
      familiarShell: '限时职业悬疑',
      uncommonCombination: `${premises[index - 1].setting}与${premises[index - 1].hero}的专属验证手段`,
      avoidedPatterns: `避开其余题材的场景、职业和证据机制${index}`,
      irreplaceableWhy: `去掉${premises[index - 1].setting}或${premises[index - 1].hero}的职业验证方式，关键证据链和最终选择都无法成立`,
      secondOrderConsequence: '证据公开后不只解决眼前异常，还会重新分配责任与利益，并迫使主角与同事或家属的关系发生不可逆变化',
      readerQuestion: `主角能否在截止日前证明${premises[index - 1].setting}里的异常，同时承担公开证据带来的关系代价`,
    },
  });
  const realLLM = {
    assertScenarioModelConfigured: vi.fn(() => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash' })),
    generate: vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { content: JSON.stringify({ ideas: [1, 2, 3, 4, 5].map(makeIdea) }) };
    }),
  };
  const controller = Object.create(ChainController.prototype);
  const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) };
  Object.assign(controller, { realLLM, db: { getDb: () => db }, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  const request = { storyType: 'short_story' as const, platform: 'fanqie', storyCategory: '悬疑灵异', count: 5, ...discoveryStandards };

  const [first, duplicate] = await Promise.all([controller.ideaDiscover(request), controller.ideaDiscover(request)]) as any[];
  expect(first).toMatchObject({ success: true, totalIdeas: 5 });
  expect(duplicate).toEqual(first);
  expect(realLLM.generate).toHaveBeenCalledTimes(1);
  expect(realLLM.generate).toHaveBeenCalledWith(expect.objectContaining({
    scenario: 'idea_generate', responseFormat: 'json_object', maxEmptyRetries: 1,
  }));
});

it('uses read-only code standards and records their exact code version on generation runs', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await new Migrator(db).runMigrations();
    const database = { getDb: () => db } as any;
    const metrics = new GenerationMetricsService(database);
    const standards = new ModuleStandardsService();
    standards.loadToCache();

    // 运行期标准数据库已经删除：切换机器/模型/对话不能再从旧表恢复另一套 hard rules。
    const legacyTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'
      AND name IN ('module_standards','module_standard_versions','standard_summarization_runs') ORDER BY name`).all();
    expect(legacyTables).toEqual([]);
    expect(standards.status()).toMatchObject({
      standardSource: 'code_seed',
      seedBaselineVersion: SEED_BASELINE_VERSION,
      dirtyCount: 0,
      running: [],
    });
    expect(standardDirectiveCache.get('idea_generate')).toContain('灵感发现·执行标准');
    expect(standardDirectiveCache.get('writing')).toContain('Creative Constitution');

    const run = metrics.beginRun(undefined, 'idea_generate', '测试');
    const snapshot = JSON.parse(db.prepare('SELECT standards_snapshot FROM generation_runs WHERE id=?').get(run.id).standards_snapshot);
    expect(snapshot.modules).toContainEqual({
      key: 'inspiration', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
    expect(snapshot.modules).toContainEqual({
      key: 'quality_loop', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });

    const noStandards = metrics.beginRun(undefined, 'daily', '测试', undefined, undefined, undefined, false);
    expect(JSON.parse(db.prepare('SELECT standards_snapshot FROM generation_runs WHERE id=?').get(noStandards.id).standards_snapshot).enabled).toBe(false);
  } finally { db.close(); }
});

it('blocks idea discovery without a platform/category execution standard instead of silently generating on generic web-fiction defaults', async () => {
  const database = { getDb: () => ({ prepare: () => ({ all: () => [] }) }) } as any;
  const realLLM = { assertScenarioModelConfigured: vi.fn(), generate: vi.fn(async () => ({ content: '{}' })) };
  const controller = Object.create(ChainController.prototype);
  Object.assign(controller, { realLLM, db: database, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });

  const blocked = async (payload: Record<string, unknown>, expected: string) => {
    const error = await controller.ideaDiscover(payload as any).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(422);
    expect((error as HttpException).message).toContain(expected);
  };
  // 没选平台：generic 等价于没选，不得按通用网文基准生成
  await blocked({ storyType: 'short_story', platform: '', storyCategory: '现实悬疑' }, '未选择具体目标平台');
  await blocked({ storyType: 'short_story', platform: 'generic', storyCategory: '现实悬疑' }, '未选择具体目标平台');
  await blocked({ storyType: 'short_story', platform: 'rules_horror', storyCategory: '现实悬疑' }, '规则怪谈是题材标签');
  // 选了自定义平台却没写说明：系统不掌握该平台基准，这份说明就是标准本身
  await blocked({ storyType: 'short_story', platform: 'custom', storyCategory: '现实悬疑' }, '自定义平台说明');
  // 自定义平台没有可用分类字典时，不能从别的平台借用分类。
  await blocked({ storyType: 'short_story', platform: 'custom', customPlatformNote: '短故事每篇以一次明确的冲突与回报收束。', storyCategory: '   ' }, '没有可用的分类候选');
  // 阻断必须发生在花掉模型调用之前，标准不齐备不能靠一次模型调用蒙混过去
  expect(realLLM.assertScenarioModelConfigured).not.toHaveBeenCalled();
  expect(realLLM.generate).not.toHaveBeenCalled();
});

it('injects the user-declared custom platform standard into the idea prompt as the platform authority', async () => {
  const prompts: string[] = [];
  const realLLM = {
    assertScenarioModelConfigured: vi.fn(() => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash' })),
    generate: vi.fn(async (input: any) => {
      prompts.push(String(input.prompt));
      return { content: JSON.stringify({ ideas: [] }) };
    }),
  };
  const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) };
  const controller = Object.create(ChainController.prototype);
  Object.assign(controller, { realLLM, db: { getDb: () => db }, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });

  const result: any = await controller.ideaDiscover({
    storyType: 'short_story', platform: 'custom', storyCategory: '现实悬疑',
    customPlatformNote: '每章末尾必须留一个可验证的实物线索；回报以关系变化为主，不用打脸爽点。',
    ...discoveryStandards,
  });
  // 说明已进入 prompt（上面断言），后续质量 Gate 才有资格判定这批题材不合格
  expect(result.success).toBe(false);
  expect(String(result.error)).toContain('缺少有效的 ideas 数组');
  expect(realLLM.generate).toHaveBeenCalledTimes(1);
  const prompt = prompts.join('\n');
  expect(prompt).toContain('每章末尾必须留一个可验证的实物线索');
  expect(prompt).toContain('用户填写的「自定义平台说明」是该平台节奏、回报类型、段落与对话区间的唯一事实源');
  expect(prompt).toContain('不是该平台的既定基准');
});