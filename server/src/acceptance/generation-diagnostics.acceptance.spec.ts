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

const makePremiseSelectionFixture = (count = 5) => ({
  pool: Array.from({ length: count }, (_, index) => ({
    premiseId: `P${index + 1}`,
    workingTitle: `候选题材${index + 1}`,
    storyCore: `普通人在限时压力中发现异常证据并主动追查，最终必须承担选择造成的关系后果${index + 1}`,
  })),
  selectedPremises: Array.from({ length: count }, (_, index) => ({
    premiseId: `P${index + 1}`,
    protagonistSituation: '普通人正面临具体生活压力，并有必须守住的人或事',
    openingEvent: '一份与日常工作直接相关的异常证据迫使主角立即行动',
    coreConflict: '主角的现实目标与主动阻挠者在有限时间内持续对撞',
    activeChoice: '主角必须亲自决定是否公开会改变关系与利益分配的证据',
    escalation: '每次核验都会让时间压力、职业风险与关系代价继续升级',
    reversalEffect: '关键反转会改变责任归属、主角目标以及最终选择的代价',
    payoff: '终局兑现证据真相、人物选择与关系变化三项阅读承诺',
    irreplaceableCarrier: '职业现场的方法直接决定证据能否成立，换掉载体故事便无法推进',
    secondOrderConsequence: '证据公开后会重新分配责任与利益，并迫使关键关系重新站队',
    readerQuestion: '主角能否在截止时间前证明异常，同时承担公开证据造成的后果',
    differentiation: `第${index + 1}个候选使用独立职业载体、证据链与关系代价，不复用其他题材机制`,
  })),
});

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

it('generates a complete idea batch through preselection plus structuring and reuses an identical in-flight request', async () => {
  const premises = [
    {
      title: '逆风浮标的维修合同', setting: '海岛气象站', hero: '失语气象员',
      hook: '台风登陆前三小时，海岛气象站三只浮标同时报出逆风，我发现同事签过的维修合同编号也异常。只剩三小时，我必须追查维修船并核验风场，否则近海渔民会被错误撤离路线困住。',
      description: '台风登陆前，失语气象员发现近海浮标连续报出不可能的逆风数据。他用手绘云图追查维修船，逐站核验潮位、航迹和维修合同，却被同事催促发布撤离结论。看似仪器集体故障，实际是有人借维修合同反写风向；每改正一个数据，走私船就失去一条安全航路。最终他必须在公开错误预报与保住签字同事的职业资格之间选择；公开证据会把责任转嫁链揭开，迫使他与同事关系彻底改写。',
      conflict: '主角要在台风前用维修合同和实测风场证明数据被改写，走私船队要维持假数据穿过封锁海域',
      point: '维修合同编号与三张手绘云图共同证明电子风向被整体反写',
      reversal: '被认定失灵的旧浮标实际记录了维修船故意绕行的航迹，迫使主角从纠正预报转为揭开责任转嫁链并保护签字同事',
    },
    {
      title: '七克餐盒与代餐券', setting: '社区食堂', hero: '负债营养师',
      hook: '社区食堂同一桌老人连续出现异常过敏，我发现每个问题餐盒都少七克盐，而母亲常用的代餐券也在名单里。今晚结算前，我必须查清被换过的餐盒，否则食堂资格和老人财产都会被锁死。',
      description: '社区食堂连续出现老人过敏，负债营养师从留样盒、进货克数和服药时间排除食材问题。供货商拿欠款和供货合同逼她签认责任，老人家属又拒绝交出监护文件。看似食品安全事故，实际有人沿代餐券和监护名单制造老人失能记录；她追查餐盒编号后发现有人借免费餐控制独居老人财产。最终她必须在举报中介与保住食堂经营资格之间选择；公开账本会让原本由食堂承担的责任转嫁回中介，也会让她与老人家属的关系重新站队。',
      conflict: '主角要用供货合同、餐盒编号和代餐券保住老人自主权，中介要借供餐记录制造失能证明并转移财产',
      point: '每份问题餐少掉的七克盐与代餐券名单共同定位被单独调换的餐盒',
      reversal: '过敏并非投毒，而是中介故意调换医嘱制造失能表象，迫使主角从自证清白转为公开监护利益链',
    },
    {
      title: '失踪七句的收养档案', setting: '县城剧团', hero: '替补提词员',
      hook: '县剧团首演前，所有台本同时少了最后七句，师父却坚持那段从未存在。我只剩首演前两小时，必须从口型录像和收养档案找回唱词，否则一名演员被顶替多年的身份会永远锁死。',
      description: '县剧团首演前，替补提词员发现老戏最后七句被人从所有台本剪掉，台上演员却坚持那段从未存在。她对照口型录像、道具走位和观众旧录音，一步步找回缺失唱词，又在旧收养档案中发现同样的七句。看似有人删改剧本，实际唱词是一份被藏进戏文的身份凭证。最终她必须在直播公开唱词与保住师父名声之间选择；公开会让被顶替演员的身份改变，也迫使整个剧团的师徒关系重新站队。',
      conflict: '主角要让缺失唱词和收养档案重回公开记录，被冒名者要在直播前销毁最后一份口传版本',
      point: '演员无声口型与收养档案里的七句文字互相印证，证明被剪唱词真实存在',
      reversal: '失踪唱词不是禁词而是收养证明，迫使主角从修复演出转为决定是否公开一场延续多年的身份替换',
    },
    {
      title: '空夹层里的检疫档案', setting: '跨境货车', hero: '退役检疫犬训导员',
      hook: '封关只剩两小时，退役检疫犬却对空货车夹层连续示警，我在检疫档案里发现同事登记过一只不存在的繁育犬。我必须沿冷链记录追查换货，否则年轻司机会替真正的交易者承担走私责任。',
      description: '封关倒计时开始后，退役训导员在货车夹层闻到训练标记剂，却找不到违禁品。他沿冷链温度、犬只反应、收费站时间和检疫档案重建换货路径，同事却要求他替年轻司机认下走私。看似整车无标签药材才是赃物，实际药材只是吸引检查资源的合法诱饵，真正被偷运的是一只没有芯片记录的繁育犬。最终他必须在立即报警与保住年轻司机执照之间选择；证据公开会把责任转嫁回车队老板，并让他与旧同事的关系彻底决裂。',
      conflict: '主角要在封关前凭检疫档案和冷链记录找回繁育犬，车队老板要用药材案件让年轻司机承担责任',
      point: '退役检疫犬只对空夹层示警，而检疫档案里恰好多出一只不存在的繁育犬编号',
      reversal: '人人看守的药材不是赃物而是合法诱饵，迫使主角从查药材转为揭开活体交易和责任转嫁',
    },
    {
      title: '消失窄巷的拆迁合同', setting: '旧城测绘队', hero: '色盲测绘员',
      hook: '拆迁签字只剩一天，新版地图里整条窄巷突然消失，我发现邻居门牌和户口档案却被登记到另一户。我必须用井盖距离和旧档案证明巷子存在，否则老人会失去最后的安置资格。',
      description: '拆迁签字前，色盲测绘员发现新版地图删掉一条仍有人居住的窄巷，现场门牌却在系统中属于另一户。他不用颜色图层，改以井盖距离、墙缝朝向、户口档案和拆迁合同复核边界。看似普通测量误差，实际整片街区曾用一条不存在的道路完成身份置换。最终他必须在提交真实地图与保住邻居老人现有安置资格之间选择；真实边界一旦公开，会让历史责任重新分配，也会改变多户居民的身份与利益关系。',
      conflict: '主角要在签字前用户口档案和拆迁合同证明窄巷住户存在，开发方要利用图层错误完成无主拆迁',
      point: '五个井盖之间不可能的等距与户口档案共同证明地图删掉了整条窄巷',
      reversal: '地图误差并非为多占土地，而是为掩盖二十年前互换身份的安置名单，迫使主角重新选择保护哪一批住户',
    },
  ];
  const makeIdea = (index: number) => ({
    sourcePremiseId: `P${index}`,
    title: premises[index - 1].title,
    alternateTitles: [`${premises[index - 1].title}·备选甲`, `${premises[index - 1].title}·备选乙`],
    storyType: 'short_story',
    angle: `${premises[index - 1].setting}里的${premises[index - 1].hero}危机`,
    hook: premises[index - 1].hook,
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
  let generationCall = 0;
  const realLLM = {
    assertScenarioModelConfigured: vi.fn(() => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash' })),
    generate: vi.fn(async () => {
      generationCall += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      if (generationCall === 1) {
        return { content: JSON.stringify(makePremiseSelectionFixture(5)) };
      }
      const cardIndex = generationCall - 1;
      if (cardIndex >= 1 && cardIndex <= 5) {
        return { content: JSON.stringify({ ideas: [makeIdea(cardIndex)] }) };
      }
      throw new Error(`unexpected idea generation call: ${generationCall}`);
    }),
  };
  const controller = Object.create(ChainController.prototype);
  const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) };
  Object.assign(controller, { realLLM, db: { getDb: () => db }, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  const request = { storyType: 'short_story' as const, platform: 'fanqie', storyCategory: '悬疑灵异', count: 5, ...discoveryStandards };

  const [first, duplicate] = await Promise.all([controller.ideaDiscover(request), controller.ideaDiscover(request)]) as any[];
  expect(first).toMatchObject({ success: true, totalIdeas: 5 });
  expect(first.appealGate).toMatchObject({
    premisePoolSize: 5,
    premisePoolTarget: 15,
    premisePoolTargetMet: false,
    premiseSelected: 5,
  });
  expect(duplicate).toEqual(first);
  // 同一请求只执行一条共享主链：1 次创建前筛选 + 5 个不同 premise 各 1 次完整卡结构化。
  expect(realLLM.generate).toHaveBeenCalledTimes(6);
  for (let call = 1; call <= 6; call += 1) {
    expect(realLLM.generate).toHaveBeenNthCalledWith(call, expect.objectContaining({
      scenario: 'idea_generate', responseFormat: 'json_object', maxEmptyRetries: 1,
    }));
  }
  expect(first.appealGate).toMatchObject({
    structuringProtocol: 'one_selected_premise_per_call_server_owned_identity',
    generated: 5,
    returned: 5,
  });
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
  let generationCall = 0;
  const realLLM = {
    assertScenarioModelConfigured: vi.fn(() => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash' })),
    generate: vi.fn(async (input: any) => {
      generationCall += 1;
      prompts.push(String(input.prompt));
      if (generationCall === 1) {
        return { content: JSON.stringify(makePremiseSelectionFixture(5)) };
      }
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
  // 每个已选题材都继承自定义平台；全部空卡时给出各题材结构错误，不调用无对象的修复。
  expect(result.success).toBe(false);
  expect(String(result.error)).toContain('第 1/5 个已选题材结构化失败');
  expect(String(result.error)).toContain('返回 0 张，期望恰好 1 张');
  expect(realLLM.generate).toHaveBeenCalledTimes(6);
  expect(result.appealGate).toMatchObject({ requested: 5, returned: 0, shortfall: 5, repairAttempted: false });
  expect(result.appealGate.structuringErrors).toHaveLength(5);
  const prompt = prompts.join('\n');
  expect(prompt).toContain('每章末尾必须留一个可验证的实物线索');
  expect(prompt).toContain('用户填写的「自定义平台说明」是该平台节奏、回报类型、段落与对话区间的唯一事实源');
  expect(prompt).toContain('不是该平台的既定基准');
});