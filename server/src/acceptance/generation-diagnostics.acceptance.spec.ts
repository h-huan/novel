import * as concurrency from '../chain/discovery-concurrency';
import * as generationBudgets from '../config/generation-budgets';
import {currentGenerationSignal,GenerationCancelledError} from '../common/generation-cancellation';
import {dimensionGuide} from '../../shared/src';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
// Fixed host headroom keeps exact physical-call assertions reproducible;
// low/high-headroom scheduling is covered separately in review-grouping.spec.
beforeEach(() => { vi.spyOn(concurrency, 'adaptiveDiscoveryConcurrency').mockImplementation(count => Math.max(1, Math.min(count, 2))); });
afterEach(() => { standardDirectiveCache.clear(); vi.restoreAllMocks(); });

// 这里曾有只填平台/分类的旧版灵感请求，结果绕过四维创作设定；验收样例必须和正式入口同一硬门。
const discoveryStandards = {
  storyTone: ['悬疑'], writingStyle: ['白描/朴素'], webNovelGenre: ['悬疑'], plotTags: ['探案'], pov: '第三人称限知',
};

const samplePremiseCores = ["【处境触发】失语气象员发现台风前的浮标全部报出逆风。【主动选择】他决定乘船核对维修合同和海浪方向。【必要条件】港务主管取得真实风速日志才能调整撤离航道。【反转兑现】走私船藏在错误风向背后，他揭露后失去同僚支持。【分类流派机制】海岛灾难悬疑以撤离选择和职业代价推进。","【处境触发】营养师发现社区餐盒里的配料与过敏病例不一致。【主动选择】她决定保留留样追查代餐券背后的供货方。【必要条件】食安人员检测留样并核对签字后才能定责。【反转兑现】真正被操纵的是监护文件，她举报却失去食堂资格。【分类流派机制】社区现实悬疑以老人权益和家属关系推进。","【处境触发】提词员发现剧团的老戏突然缺少最后七句唱词。【主动选择】她决定查验旧演出录像与演员的口型。【必要条件】收养档案与原始台本经核对才能确认身份。【反转兑现】唱词藏着一次身份顶替，她揭露后失去师父信任。【分类流派机制】剧团身份悬疑以师徒抉择和舞台证据推进。","【处境触发】训导员发现退役检疫犬总对空货箱示警。【主动选择】他决定查阅犬只芯片编号和货车冷链记录。【必要条件】口岸安检核实车辆监控与检疫记录才能扣查。【反转兑现】药材是合法诱饵，活体繁育犬才是目标，他丢了旧友。【分类流派机制】边境物流悬疑以动物身份与同事情谊推进。","【处境触发】测绘员发现旧城区一条有人居住的窄巷从新版地图消失。【主动选择】她决定用井盖距离和居民门牌核对现场。【必要条件】住房部门取得测绘底图才能重审拆迁补偿。【反转兑现】消失的巷子关联旧身份交换，她查明真相却伤害邻里。【分类流派机制】城市测绘悬疑以安置权益和身份争夺推进。"];
const makePremiseSelectionFixture = (count = 5) => ({
  pool: Array.from({ length: count }, (_, index) => ({
    premiseId: `P${index + 1}`,
    workingTitle: `候选题材${index + 1}`,
    storyCore: samplePremiseCores[index],
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
    causalPlan: [{
      action: { field: 'activeChoice', quote: '主角必须亲自决定是否公开会改变关系与利益分配的证据' },
      conditions: [{ field: 'escalation', quote: '每次核验都会让时间压力、职业风险与关系代价继续升级' }],
      result: { field: 'payoff', quote: '终局兑现证据真相、人物选择与关系变化三项阅读承诺' },
    }],
  })),
});

function promptArray(prompt: string, marker: string, terminator: string, optional = false): any[] {
  const markerAt = prompt.indexOf(marker);
  if (markerAt < 0) {
    if (optional) return [];
    throw new Error('review fixture missing prompt marker: ' + marker);
  }
  const start = prompt.indexOf('[', markerAt + marker.length);
  const end = prompt.indexOf(terminator, start);
  if (start < 0 || end < 0) throw new Error('review fixture cannot locate prompt array: ' + marker);
  return JSON.parse(prompt.slice(start, end).trim());
}

function makePremiseReviewFixture(prompt: string) {
  const sourceCatalog = promptArray(prompt, '【逐字段来源核查目录】', '\n目录中每个ref');
  const categoryCatalog = promptArray(prompt, '【与完整卡同口径的前置分类审核】', '；categoryChecks', true);
  const payoffCatalog = promptArray(prompt, '【必返payoffChecks目录】', '\n【逐环节因果计划目录');
  const causalCatalog = promptArray(prompt, '【逐环节因果计划目录；行动与条件原文见待锁定胚子的causalPlan，不重复发送】', '\n先核对每个causalPlan环节');
  const genreCatalog = promptArray(prompt, '【额外必返genreChecks】', '；每个ref返回status=fulfilled|missing|unknown', true);
  const genreEvidence = promptArray(prompt, '【流派证据目录：只含已选展开】', '\n【genreChecks单项形状】', true);
  return {
    sourceChecks: sourceCatalog.map(row => ({
      ref: row.ref, status: 'preserved',
      reason: '原池与已选字段事实兼容，必要条件和结果方向保持一致。',
    })),
    categoryChecks: categoryCatalog.map(row => ({
      ref: row.ref, status: 'fulfilled',
      evidenceRef: row.ref.slice(0, row.ref.indexOf('.') + 1) + 'coreConflict',
      reason: '核心冲突与人物主动选择落实了该分类机制，并非只依赖标签。',
    })),
    payoffChecks: payoffCatalog.map(row => {
      const prefix = row.ref.slice(0, row.ref.indexOf('.') + 1);
      return {
        ref: row.ref, status: 'supported',
        actionEvidenceRef: prefix + 'activeChoice',
        conditionEvidenceRef: prefix + 'escalation',
        reversalCheck: {status:'supported',actionEvidenceRef:prefix+'activeChoice',reason:'本题材已先采取具体行动，并由升级条件触发反转变化'},
        reason: '行动、必要条件与兑现结果在本题材因果计划中逐项对应。',
        links: causalCatalog.filter(link => String(link.ref).startsWith(prefix)).map(link => ({
          ref: link.ref, status: 'supported',
          reason: '本环节的行动与必要条件均已在同一题材字段中建立并支撑结果。',
        })),
      };
    }),
    genreChecks: genreCatalog.map(row => {
      const prefix = row.ref.slice(0, row.ref.indexOf('.') + 1);
      const evidence = genreEvidence.find(item => item.id === prefix + 'coreConflict')
        || genreEvidence.find(item => String(item.id).startsWith(prefix));
      return {
        ref: row.ref, status: 'fulfilled', evidenceRef: evidence?.id,
        reason: '本题材的核心冲突与主动选择体现了所选流派的实际行动机制。',
      };
    }),
  };
}

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

it.each(['baseline','refill','streaming','prepare','prepare_rejected','prepare_error','prepare_cancel','prepare_source_tail'] as const)('generates a complete idea batch through preselection plus structuring and reuses an identical in-flight request; mode=%s', async mode => {
  const refillOverlap=mode==='refill',streaming=mode==='streaming',prepare=mode.startsWith('prepare');
  if(streaming){
    const configured=generationBudgets.readGenerationBudgets();
    vi.spyOn(generationBudgets,'readGenerationBudgets').mockReturnValue({...configured,presentationBatchSize:1});
    vi.mocked(concurrency.adaptiveDiscoveryConcurrency).mockImplementation(count=>Math.max(1,Math.min(count,8)));
  }
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
  const makeIdea = (index: number, titleSuffix = '') => ({
    sourcePremiseId: `P${index}`,
    title: `${premises[index - 1].title}${titleSuffix}`,
    alternateTitles: [`${premises[index - 1].title}·备选甲`, `${premises[index - 1].title}·备选乙`],
    storyType: 'short_story',
    angle: `${premises[index - 1].setting}里的${premises[index - 1].hero}危机`,
    hook: premises[index - 1].hook,
    description: `${premises[index - 1].description}随着截止时间逼近，${premises[index - 1].hero}还要用该职业独有的现场方法验证每个结论，并为最后的公开选择承担不可撤回的关系代价。`,
    setting: premises[index - 1].setting, protagonist: premises[index - 1].hero, characters: ['主角', '对手', '证人'],
    styleTags: ['现实', '悬疑'], ...discoveryStandards,
    targetPlatform: 'fanqie', tone: '冲突直接且适合移动阅读', estimatedWords: 20_000, plannedChapters: 4,
    scopeBreakdown: [{ arc: '危机与追查', chapters: 4, reason: '完成调查、选择、反转与收束', outcome: '主角取得可验证的证据并完成主动选择，关系和责任发生明确变化' }],
    ending: '主角公开已查证的关键材料，合法渠道确认责任并采取实际行动，相关人员承担具体后果；主角保留选择的现实代价，关系因此改变。',
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
  let releaseRefill!:()=>void,signalRefillStarted!:()=>void,refillSourceReturned=false;
  const refillHeld=new Promise<void>(done=>{releaseRefill=done;}),refillStarted=new Promise<void>(done=>{signalRefillStarted=done;});
  let releaseLaterCards!:()=>void,signalFirstReview!:()=>void,laterCardsReleased=false;
  const laterCardsHeld=new Promise<void>(done=>{releaseLaterCards=done;}),firstReviewStarted=new Promise<void>(done=>{signalFirstReview=done;});
  let releaseInitialReview!:()=>void,signalPreparationStarted!:()=>void,signalPreparationReady!:()=>void;
  let releaseSourceTail!:()=>void,signalSourceTail!:()=>void,signalPreparedGeneration!:()=>void;
  let sourceTailHeldOnce=false,sourceTailReturned=false;
  const sourceTailHeld=new Promise<void>(done=>{releaseSourceTail=done;}),
    sourceTailEntered=new Promise<void>(done=>{signalSourceTail=done;}),
    preparedGeneration=new Promise<void>(done=>{signalPreparedGeneration=done;});
  let initialReviewReleased=false,initialReviewEntered=false,refillGeneratedBeforeRelease=false,preparationAborted=false;
  const initialReviewHeld=new Promise<void>(done=>{releaseInitialReview=done;}),
    preparationStarted=new Promise<void>(done=>{signalPreparationStarted=done;}),
    preparationReady=new Promise<void>(done=>{signalPreparationReady=done;});
  const fixtureWait=async(pending:Promise<void>)=>{
    const signal=currentGenerationSignal();let onAbort!:()=>void;
    const cancelled=new Promise<never>((_resolve,reject)=>{
      onAbort=()=>reject(new GenerationCancelledError());
      if(signal?.aborted)onAbort();else signal?.addEventListener('abort',onAbort,{once:true});
    });
    try{await Promise.race([pending,cancelled]);}finally{signal?.removeEventListener('abort',onAbort);}
  };
  const structureAttempts = new Map<string, number>();
  const realLLM = {
    assertScenarioModelConfigured: vi.fn(() => ({ modelName: 'deepseek-flash', modelVersion: 'deepseek-flash' })),
    generate: vi.fn(async (input: any) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      const step = input.metrics?.stepKey;
      const partialFixture = String(input.prompt).includes('__partial_delivery_test__');
      if(['idea_premise_pool_generation','idea_premise_selection','idea_premise_source_drift_review'].includes(step)){
        for(const [dimension,label] of [['tone','悬疑'],['style','白描/朴素']]){
          const guide=dimensionGuide(dimension,label);expect(guide.length).toBeGreaterThan(8);
          expect(input.prompt).toContain(guide);
        }
      }
      if(prepare&&step==='idea_premise_pool_reselection')return {content:JSON.stringify({replacements:[]})}; // bounded protocol rejection isolates the already evidenced bad identities
      if(prepare&&step==='idea_premise_refill_selection'){
        signalPreparationStarted();
        if(mode==='prepare_error'||mode==='prepare_cancel'){
          try{await fixtureWait(new Promise<void>(()=>{}));}catch(error){preparationAborted=true;throw error;}
        }
      }
      if (step === 'idea_premise_pool_generation') {
        expect(input.prompt).toContain('【每项分类核心机制：生成与选优使用与审核相同的标准】');
        expect(input.prompt).toContain('分类不能靠结尾点题或改标签补救');
        return { content: JSON.stringify({ pool: makePremiseSelectionFixture(partialFixture ? 4 : 5).pool }) };
      }
      if (step === 'idea_premise_selection' || step === 'idea_premise_refill_selection') {
        expect(input.prompt).toContain('【每项分类核心机制：生成与选优使用与审核相同的标准】');
        return { content: JSON.stringify({ selectedPremises: refillOverlap||prepare
          ?makePremiseSelectionFixture(5).selectedPremises.filter((_,index)=>step==='idea_premise_refill_selection'?index>=3:index<3)
          :makePremiseSelectionFixture(partialFixture ? 4 : 5).selectedPremises }) };
      }
      if (step === 'idea_premise_source_drift_review'){
        const review=makePremiseReviewFixture(String(input.prompt));
        if(prepare){
          const owners=promptArray(String(input.prompt),'【与完整卡同口径的前置分类审核】','；categoryChecks',true);
          for(const row of review.categoryChecks||[]){
            const owner=owners.find(item=>item.ref===row.ref)?.premiseId;
            if(['P2','P3'].includes(owner)||(mode==='prepare_rejected'&&['P4','P5'].includes(owner)))
              Object.assign(row,{status:'missing',reason:'该候选核心关系及关键选择未落实作者已锁定分类，不能补写或按标签放行'});
          }
        }
        return {content:JSON.stringify(review)};
      }
      if (step === 'idea_premise_overlap_review') return { content: JSON.stringify({ passed: true, issues: [] }) };
      if (step === 'idea_card_structure') {
        const prompt = String(input.prompt);
        const partial = prompt.includes('__partial_delivery_test__');
        const requestGroup = partial ? 'partial-delivery' : prompt.includes('排除题材乙') ? 'different-exclusions' : 'default';
        const attempts = (structureAttempts.get(requestGroup) || 0) + 1;
        structureAttempts.set(requestGroup, attempts);
        if (attempts > 5) throw Error('同一请求不应重复结构化');
        const selectedMarker = '【已选题材胚子（内部标识已由服务器移除）】';
        const selectedAt = prompt.indexOf(selectedMarker);
        const selectedStart = selectedAt < 0 ? -1 : prompt.indexOf('{', selectedAt + selectedMarker.length);
        const selectedEnd = selectedStart < 0 ? -1 : prompt.indexOf('\n【同批差异参照', selectedStart);
        if (selectedStart < 0 || selectedEnd < 0) throw Error('测试夹具无法解析服务器提供的当前已选胚子');
        const selected = JSON.parse(prompt.slice(selectedStart, selectedEnd).trim());
        const selectedIndex = Number(String(selected.workingTitle || '').match(/候选题材(\d+)/)?.[1]);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > 5) throw Error('测试夹具无法识别当前已选胚子');
        if(refillOverlap&&[2,3].includes(selectedIndex))throw Error('首轮成卡失败，仅用于检验补位调度');
        if(refillOverlap&&selectedIndex>=4)signalRefillStarted();
        if(streaming&&selectedIndex!==1)await laterCardsHeld;
        if(prepare&&selectedIndex>=4&&!initialReviewReleased)refillGeneratedBeforeRelease=true;
        if(mode==='prepare_source_tail'&&selectedIndex>=4)signalPreparedGeneration();
        if (partial && selectedIndex === 2) throw Error('测试夹具模拟第2张完整卡结构化失败');
        return { content: JSON.stringify({ ideas: [makeIdea(selectedIndex, partial ? '·局部' : '')] }) };
      }
      if (step === 'idea_presentation_review') {
        if(streaming)signalFirstReview();
        const prompt = String(input.prompt);
        const marker = '【实际待审题材卡与完整卡差异参考（参考可含同批待审卡，不代表其已通过）】';
        const markerAt = prompt.indexOf(marker);
        const jsonStart = markerAt < 0 ? -1 : markerAt + marker.length;
        const jsonEnd = jsonStart < 0 ? -1 : prompt.indexOf('\n若存在standardLines', jsonStart);
        if (jsonStart < 0 || jsonEnd < 0) throw Error('测试夹具无法解析完整卡独立审核输入');
        const packed = JSON.parse(prompt.slice(jsonStart, jsonEnd).trim());
        const cards = Array.isArray(packed.cards) ? packed.cards : [];
        if(prepare&&cards.some((card:any)=>String(card.title)===premises[0].title)){
          initialReviewEntered=true;
          await fixtureWait(initialReviewHeld);
          if(mode==='prepare_error')throw Error('夹具首轮终审协议中止，必须取消并等待正在执行的补位准备');
        }
        return { content: JSON.stringify({
          reviews: cards.map((card: any, index: number) => {
            const position = Number(card.position) || index + 1;
            const title = String(card.title || '');
            const goal = (field: string) => ({ status: 'supported', evidenceRef: `C${position}.${field}`,
              reason: '由具体风险、主动选择与可验证结果形成完整阅读期待和实际关系变化。' });
            return {
              position, title, titleCompelling: true, openingCompelling: true,
              distinctFromBatch: true, storyCoherent: true, payoffCredible: true, platformFit: true,
              storyEvidenceRef: `C${position}.hook`, payoffEvidenceRef: `C${position}.ending`,
              platformEvidenceRef: `C${position}.description`,
              payoffBridge: { status: 'supported', actionEvidenceRef: `C${position}.description`,
                resultEvidenceRef: `C${position}.ending`, conditionEvidenceRef: `C${position}.setting`,
                reason: '实际行动通过既有现场条件取得可核验证据，随后依法确认责任并兑现关系代价。' },
              qualityReason: '以本题材实际开篇压力、行动条件及具体责任兑现核对平台与阅读目标。',
              readerQuestion: '主角能否证实当前异常并承担公开材料后的真实关系后果？',
              readerGoals: { click: goal('hook'), completion: goal('description'),
                sharing: goal('ending'), immersion: goal('hook') },
              issues: [],
            };
          }),
        }) };
      }
      throw new Error('unexpected idea generation step: '+String(step));
    }),
  };
  const controller = Object.create(ChainController.prototype);
  const db = { prepare: vi.fn(() => ({ all: vi.fn(() => []) })) };
  Object.assign(controller, { realLLM, db: { getDb: () => db }, ideaAppealGate: new IdeaAppealGateService(), logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } });
  const request = { storyType: 'short_story' as const, platform: 'fanqie', storyCategory: '悬疑灵异', count: 5, ...discoveryStandards };

  if(prepare){
    if(mode==='prepare_source_tail'){
      const originalReview=(controller as any).reviewPremiseSelection.bind(controller);
      (controller as any).reviewPremiseSelection=async(...args:any[])=>{
        const result=await originalReview(...args);
        if(args[2]==='source_drift'&&!sourceTailHeldOnce&&args[0].selected.some((item:any)=>['P4','P5'].includes(item.premiseId))){
          sourceTailHeldOnce=true;signalSourceTail();await sourceTailHeld;sourceTailReturned=true;
        }
        return result;
      };
    }
    const original=(controller as any).reconcilePremiseSelection.bind(controller);
    (controller as any).reconcilePremiseSelection=async(...args:any[])=>{
      const result=await original(...args);
      if(args[0].selected.some((item:any)=>['P4','P5'].includes(item.premiseId)))signalPreparationReady();
      return result;
    };
    const requestId='fixture-'+mode;
    const pending=controller.ideaDiscover({...request,count:2,discoveryRequestId:requestId});
    const observe=async(event:Promise<void>)=>{
      let timer:ReturnType<typeof setTimeout>|undefined;
      try{return await Promise.race([event.then(()=>true),new Promise<boolean>(done=>{timer=setTimeout(()=>done(false),2000);})]);}
      finally{if(timer)clearTimeout(timer);}
    };
    let started=false,prepared=false,releasedBeforeSourceTail=false,result:any;
    try{
      started=await observe(preparationStarted);
      if(started&&(mode==='prepare'||mode==='prepare_rejected')){
        prepared=await observe(preparationReady);await new Promise<void>(done=>setImmediate(done));
        expect(initialReviewEntered,'夹具必须确实阻塞首轮完整卡终审，不能用未传入审核视图的内部ID识别').toBe(true);
      }
      if(mode==='prepare_source_tail')expect(await observe(sourceTailEntered)).toBe(true);
      expect(refillGeneratedBeforeRelease,'首轮身份核对前不能派发补位完整卡').toBe(false);
      if(mode==='prepare_cancel')controller.cancelIdeaDiscovery(requestId);
      initialReviewReleased=true;releaseInitialReview();
      if(mode==='prepare_source_tail'){
        releasedBeforeSourceTail=await observe(preparedGeneration);
        expect(sourceTailReturned).toBe(false);releaseSourceTail();
      }
      result=await pending;
    }finally{initialReviewReleased=true;releaseInitialReview();releaseSourceTail();}
    expect(started,'已知前置缺额必须在初始终审阻塞期间开始同一补位准备 '+JSON.stringify({error:result?.error,reason:result?.appealGate?.stopReason,steps:realLLM.generate.mock.calls.map(([call]:any[])=>call.metrics?.stepKey)})).toBe(true);
    if(mode==='prepare'||mode==='prepare_rejected')expect(prepared).toBe(true);
    if(mode==='prepare'||mode==='prepare_source_tail'){
      if(mode==='prepare_source_tail')expect(releasedBeforeSourceTail,'已过审补位身份在首轮核对后必须先成卡，不等其它来源汇总').toBe(true);
      expect(result).toMatchObject({success:true,totalIdeas:2});
      expect(result.ideas).toHaveLength(2);
      expect(result.ideas.every((card:any)=>!['P2','P3'].includes(card.sourcePremiseId))).toBe(true);
      expect(result.appealGate.presentationPhysicalCallsUsed).toBeLessThanOrEqual(result.appealGate.presentationPhysicalCallLimit);
      expect(result.appealGate.fulfillment.sourceCallsRemaining).toBeGreaterThanOrEqual(0);
    }else if(mode==='prepare_rejected'){
      expect(result.success).toBe(false);expect(result.ideas).toHaveLength(0);
      expect(result.qualifiedIdeas).toHaveLength(1);
      expect(result.qualifiedIdeas[0].sourcePremiseId).toBe('P1');
      expect(realLLM.generate.mock.calls.some(([call]:any[])=>call.metrics?.stepKey==='idea_card_structure'&&String(call.prompt).includes('候选题材4'))).toBe(false);
    }else{
      expect(result.success).toBe(false);expect(preparationAborted,'初始失败或取消必须取消并等待补位准备').toBe(true);
      expect(realLLM.generate.mock.calls.filter(([call]:any[])=>call.metrics?.stepKey==='idea_card_structure')).toHaveLength(1);
    }
    expect(realLLM.generate.mock.calls.filter(([call]:any[])=>call.metrics?.stepKey==='idea_premise_refill_selection')).toHaveLength(1);
    return;
  }
  if(streaming){
    const pending=controller.ideaDiscover(request);
    let timer:ReturnType<typeof setTimeout>|undefined;
    const observed=await Promise.race([firstReviewStarted.then(()=>true),new Promise<boolean>(done=>{timer=setTimeout(()=>done(false),2000);})]);
    const reviewedBeforeLaterCards=!laterCardsReleased;
    if(timer)clearTimeout(timer);laterCardsReleased=true;releaseLaterCards();
    const result:any=await pending;
    expect(observed,'已预留逐卡额度时，第一张完整卡必须在其余四张准备完之前进入终审').toBe(true);
    expect(reviewedBeforeLaterCards).toBe(true);
    expect(result).toMatchObject({success:true,totalIdeas:5});
    expect(result.ideas).toHaveLength(5);
    expect(realLLM.generate.mock.calls.filter(([call]:any[])=>call.metrics?.stepKey==='idea_card_structure')).toHaveLength(5);
    expect(realLLM.generate.mock.calls.filter(([call]:any[])=>call.metrics?.stepKey==='idea_presentation_review')).toHaveLength(5);
    expect(realLLM.generate.mock.calls.length).toBeLessThanOrEqual(24);
    return;
  }
  if(refillOverlap){
    const original=(controller as any).reviewPremiseSelection.bind(controller);
    (controller as any).reviewPremiseSelection=async(...args:any[])=>{
      const result=await original(...args);
      if(args[2]==='source_drift'&&args[0].selected.some((item:any)=>['P4','P5'].includes(item.premiseId))){await refillHeld;refillSourceReturned=true;}
      return result;
    };
    const pending=controller.ideaDiscover({...request,count:2});
    let timer:ReturnType<typeof setTimeout>|undefined;
    const observed=await Promise.race([refillStarted.then(()=>true),new Promise<boolean>(done=>{timer=setTimeout(()=>done(false),2000);})]);
    const beforeSourceReturned=!refillSourceReturned;
    if(timer)clearTimeout(timer);releaseRefill();const result:any=await pending;
    expect(observed,'补位成卡必须在其余来源汇总返回前启动').toBe(true);expect(beforeSourceReturned).toBe(true);
    expect(result).toMatchObject({success:true,totalIdeas:2});
    expect(new Set(result.ideas.map((idea:any)=>idea.sourcePremiseId)).size).toBe(2);
    expect(realLLM.generate.mock.calls.filter(([call]:any[])=>call.metrics?.stepKey==='idea_card_structure')).toHaveLength(5);
    expect(realLLM.generate.mock.calls.some(([call]:any[])=>call.metrics?.stepKey==='idea_premise_pool_refill')).toBe(false);
    expect(result.appealGate.fulfillment.actions.some((action:any)=>action.phase==='refill_from_lightweight')).toBe(true);
    return;
  }
  const differentRequest = { ...request, excludeDetails: [{ title: '排除题材乙', hook: '本请求独有的排除依据' }] };
  const partialRequest = { ...request, genreFitNote: '__partial_delivery_test__' };
  const [first, duplicate, distinctResult, partialResult] = await Promise.all([
    controller.ideaDiscover(request),
    controller.ideaDiscover(request),
    controller.ideaDiscover(differentRequest),
    controller.ideaDiscover(partialRequest),
  ]) as any[];
  expect(first, 'idea discovery failed: ' + JSON.stringify({ error: first.error, appealGate: first.appealGate })).toMatchObject({ success: true, totalIdeas: 5 });
  expect(first.appealGate).toMatchObject({
    premisePoolSize: 5,
    premisePoolTarget: 15,
    premisePoolTargetMet: false,
    premiseSelected: 5,
  });
  expect(duplicate).toEqual(first);
  expect(distinctResult.appealGate).toMatchObject({ premisePoolSize: 5, premisePoolTarget: 15, premiseSelected: 5, generated: 5, returned: 5 });
  // 同配置并发请求仅共享一条生成链；五张卡的独立语义复核按原有批大小并发，仍以其它卡为对照。
  expect(distinctResult, 'a request with different excludeDetails must not reuse the first result')
    .toMatchObject({ success: true, totalIdeas: 5 });
  // A short original pool and one deliberately broken card must not erase the
  // other three independently verified full cards. Their quality gates are
  // unchanged and the UI can use the explicit partial-success response.
  expect(partialResult, 'three approved cards must be retained for recovery, not counted as a successful five-card request')
    .toMatchObject({ success: false, status: 'incomplete', totalIdeas: 0 });
  expect(partialResult.ideas).toHaveLength(0);
  expect(partialResult.qualifiedIdeas).toHaveLength(3);
  expect(partialResult.qualifiedIdeas.map((idea:any)=>idea.sourcePremiseId).sort()).toEqual(['P1','P3','P4']);
  expect(partialResult.warning).toContain('缺额 2');
  expect(partialResult.appealGate).toMatchObject({
    premisePoolTarget: 15, premisePoolSize: 4, premisePoolTargetMet: false,
    premiseSelected: 4, generated: 3, qualified: 3, returned: 0, requested: 5,
    minimumDeliverableCount: 5, partial: true,
  });
  expect(partialResult.appealGate.selectionAudit.poolGeneration).toMatchObject({
    supplementAttempted: false, supplementAdded: 0, batchCount: 2,
  });
  expect(partialResult.appealGate.structuringErrors).toHaveLength(1);
  expect(partialResult.appealGate.structuringErrors[0].sourcePremiseId).toBe('P2');
  // Each distinct request preserves two initial pools plus one selector; no fourth initial call.
  // The simulated provider rejects unknown refill operations; the server must
  // keep the three passed cards and never regenerate those passed premises.
  // Keep all verdicts while preserving aggregate review of a remainder under four cards.
  // Two complete requests need 2 reviews each; the three-card partial request needs 1.
  expect(realLLM.generate).toHaveBeenCalledTimes(39);
  expect(realLLM.generate.mock.calls.map(([call]: any[]) => call.metrics?.stepKey).sort()).toEqual([
    ...Array(6).fill('idea_premise_pool_generation'),
    ...Array(3).fill('idea_premise_selection'),
    ...Array(6).fill('idea_premise_source_drift_review'),
    ...Array(3).fill('idea_premise_overlap_review'),
    ...Array(14).fill('idea_card_structure'),
    ...Array(5).fill('idea_presentation_review'),
    ...Array(2).fill('idea_premise_pool_refill'),
  ].sort());
  expect(partialResult.appealGate.fulfillment.actions.some((action:any)=>
    action.phase==='lightweight_pool_refill_failed')).toBe(true);
  expect(first.appealGate).toMatchObject({
    structuringProtocol: 'one_selected_premise_per_call_server_owned_identity',
    generated: 5,
    returned: 5,
  });
});

it('uses read-only Registry rules and records their exact ruleset version on generation runs', async () => {
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
      standardSource: 'system_workflow_rule_registry',
      seedBaselineVersion: SEED_BASELINE_VERSION,
      dirtyCount: 0,
      running: [],
    });
    const ideaDirective = standardDirectiveCache.get('idea_generate');
    expect(ideaDirective).toContain('【系统规则 GEN-002');
    expect(ideaDirective).toContain('【系统规则 QLT-006');
    expect(standardDirectiveCache.get('writing')).toContain('Creative Constitution');

    const run = metrics.beginRun(undefined, 'idea_generate', '测试');
    const snapshot = JSON.parse(db.prepare('SELECT standards_snapshot FROM generation_runs WHERE id=?').get(run.id).standards_snapshot);
    expect(snapshot.rulesetVersion).toBe(SEED_BASELINE_VERSION);
    expect(snapshot.modules).toContainEqual({
      key: 'GEN-002', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
    expect(snapshot.modules).toContainEqual({
      key: 'QLT-006', version: SEED_BASELINE_VERSION, baseline: SEED_BASELINE_VERSION,
    });
    expect(snapshot.modules).not.toContainEqual(expect.objectContaining({ key: 'inspiration' }));
    expect(snapshot.modules).not.toContainEqual(expect.objectContaining({ key: 'quality_loop' }));

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
      if (input.metrics?.stepKey === 'idea_premise_pool_generation') {
        return { content: JSON.stringify({ pool: makePremiseSelectionFixture(5).pool }) };
      }
      if (input.metrics?.stepKey === 'idea_premise_selection') {
        return { content: JSON.stringify({ selectedPremises: makePremiseSelectionFixture(5).selectedPremises }) };
      }
      if (input.metrics?.stepKey === 'idea_premise_source_drift_review')
        return { content: JSON.stringify(makePremiseReviewFixture(String(input.prompt))) };
      if (input.metrics?.stepKey === 'idea_premise_overlap_review')
        return { content: JSON.stringify({ passed: true, issues: [] }) };
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
  expect(realLLM.generate).toHaveBeenCalledTimes(13);
  // The bounded refill is attempted only because zero complete cards passed;
  // a malformed supplemental reply cannot turn any failed card into a pass.
  expect(realLLM.generate.mock.calls.filter(([call]:any[])=>
    call.metrics?.stepKey==='idea_premise_pool_refill')).toHaveLength(2);
  expect(result.appealGate).toMatchObject({ requested: 5, returned: 0, shortfall: 5, repairAttempted: true });
  expect(result.appealGate.structuringErrors).toHaveLength(5);
  const prompt = prompts.join('\n');
  expect(prompt).toContain('每章末尾必须留一个可验证的实物线索');
  expect(prompt).toContain('用户填写的「自定义平台说明」是该平台节奏、回报类型、段落与对话区间的唯一事实源');
  expect(prompt).toContain('不是该平台的既定基准');
});
