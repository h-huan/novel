import { Injectable } from '@nestjs/common';
import { SHORT_IDEA_HOOK_MIN_SIGNALS } from './idea-discovery-contract';

type StoryType = 'short_story' | 'long_novel';
type DensityMode = '短篇集中兑现' | '长篇分阶段波动';

export interface IdeaAppealSignals {
  titleAnchored: boolean;
  hookHasAnomaly: boolean;
  hookHasPressure: boolean;
  hookHasAgency: boolean;
  hookHasRelationship: boolean;
  descriptionProgressions: number;
  openingDeliversPromise: boolean;
  reversalConsequential: boolean;
  payoffPromise: boolean;
  concretePremiseAnchor: boolean;
  counterExpectation: boolean;
  forcedTradeoff: boolean;
  secondOrderConsequence: boolean;
  simpleMoralMechanismRisk: boolean;
  distinctivenessScore: number;
}

export interface ReaderExperienceEvidence {
  lifeAnchor: boolean;
  aspiration: boolean;
  socialFriction: boolean;
  struggleAgency: boolean;
  painPotential: boolean;
  catharsisPotential: boolean;
  sustainedSuspense: boolean;
  emotionalContrastGroups: number;
  stackingRisk: boolean;
}

export interface ReaderExperienceProfile {
  version: 1;
  storyType: StoryType;
  pace: '偏快但保留呼吸段';
  densityMode: DensityMode;
  principles: {
    lifeGrounding: string;
    aspiration: string;
    socialCritique: string;
    struggle: string;
    reversals: string;
    emotionalPain: string;
    emotionalWave: string;
    catharsis: string;
    suspense: string;
    restraint: string;
  };
  evidence: ReaderExperienceEvidence;
}

export interface IdeaAppealAssessment {
  passed: boolean;
  issues: string[];
  warnings: string[];
  signals: IdeaAppealSignals;
  readerExperienceProfile: ReaderExperienceProfile;
}

const GENERIC_TITLE = /^(?:命运之|重生之|.*的人生$|.*之路$|.*传奇$|爱与救赎$)/;
const ANOMALY = /(突然|异常|消失|失踪|不存在|多出|少了|多一|少一|倒计时|重复|重置|回拨|重生|回到.{0,8}(?:年前|过去)|名单|遗嘱|秘密|真相|陌生|不认识|死亡|葬礼|尸体|证据|监控|规则|每次|每天|每周|竟然|原来|却|不.{0,8}只.{0,8}|每.{0,12}(?:就|会).{0,18}(?:忘|失|消|变|转|痛|伤|恢复|好转)|会.{0,24}(?:忘|消|少|多|变|出现|收到|梦见|显示|拼|撞|预告|映|跳)|(?:交换|转移).{0,16}(?:记忆|痛|伤|听力|触觉)|(?:明天|次日|七天后|十年后).{0,24}(?:会|就|少|多|失|死))/;
const PRESSURE = /(必须|否则|只剩|之前|截止|期限|倒计时|代价|失去|死亡|辞退|开除|破产|债|欠|追责|坐牢|举报|威胁|危险|救|保住|夺回|不能|来不及|一旦|手术|学费|违约金|赔偿|退学|退役|停播|停职|资格|档案|失聪|失明|忘记|遗忘|限.{0,8}(?:天|小时|还|签|卖)|[一二三四五六七八九十百零两\d]+(?:天|小时|分钟)(?:内|后|前)|扣|洗不掉|少一笔|后退|忘掉|被.{0,8}(?:接走|抱走|收走))/;
const AGENCY = /(查|调查|追|找|救|保|阻止|揭|证明|反击|举报|逃|夺回|争|守|破解|选择|决定|行动|潜入|对抗|偿还|起诉|报名|报上|公开)/;
const FIRST_PERSON_ACTION = /(?:我|主角).{0,16}(?:当场|偷偷|直接|立刻|马上|决定|选择|开始|点|按|推|贴|拆|打开|发布|写|喂|喝|盖|拿|翻|送|关|倒|签|拒|追|去|改|试|撕|删|扔|带|抱|接|坐|开|把|照做)/;
const CONCRETE_ACTION = /(?:我|她|他|主角|[\u4e00-\u9fff]{2,4}).{0,18}(?:撕|报名|报上|签下|删除|删|发布|发出|交出|焊|修好|寄出|取件|下单|停手|训练|拖延|隐瞒|拒绝|公开|报警|反锁|照做)/;
const HOOK_CHOICE = /(?:必须|只能|决定|选择).{0,24}(?:查清|弄明白|阻止|救|保住|留下|离开|继续|停止|停手|公开|删除|删|发布|发出|交出|报名)|(?:不删|删了|不发|发了|不交|交出).{0,24}(?:赔|失去|退|毁|保|换|否则)/;
const RELATIONSHIP = /(父|母|爸|妈|儿|女|妻|夫|丈夫|老婆|恋人|前任|暗恋|青梅|兄|弟|姐|妹|同事|老板|朋友|邻居|家人|亲人|师|学长|学弟|同学|同班|队友|队长|教练|室友|搭档|对手|夫妻|家庭|家属|顾客)/;
const PROGRESSION = /(起初|最初|第一|随后|接着|之后|第二|第三|却|反而|直到|进一步|升级|失控|恶化|暴露|发现|揭开|逼迫|迫使|最终|最后|真相|代价|反转|转而|同时)/g;
const CONSEQUENCE = /(因此|导致|迫使|不得不|转而|从此|目标|敌人|盟友|关系|身份|代价|失去|死亡|生死|真相|胜负|规则|条件|救|保|夺回|反击|举报|起诉|辞退|破产|翻盘|改变|改为|改成|转向|退役|退学|停职|辞职|解散|取消资格|共犯|决裂|顶罪|从.{1,20}(?:变成|转为)|不是.{0,30}(?:而是|是))/;
const PAYOFF = /(最终|最后|结局|收束|付出代价|承担|偿还|揭开真相|真相大白|救回|保住|夺回|赢|失败|和解|分开|离开|选择|选了|兑现|翻盘|当众|公开|拆掉|倒掉|退学|退役|辞职|停职|解散|取消资格|失聪|恢复|康复|顶罪)/;

const LIFE_ANCHOR = /(生活|日子|家|家庭|父|母|爸|妈|儿|女|妻|夫|恋人|亲人|朋友|同事|工作|上班|职业|工资|钱|存款|房|租|贷款|债|学费|学校|考试|医院|病|健康|养老|婚|孩子|邻居|尊严|体面|名声|机会|前途|责任|归属|自由|安全|生存|吃饭|失业|辞退|开除)/;
const ASPIRATION = /(想要|想把|想让|想给|希望|盼|梦想|目标|为了|守住|保住|保护|救|夺回|拿回|找回|改变|证明|赢|活下去|自由|尊严|回家|团聚|查清|揭开|摆脱|偿还|考上|留下|成为|阻止)/;
const SOCIAL_FRICTION = /(规则|制度|权力|资源|利益|阶层|贫富|公司|老板|职场|学校|校长|医院|院长|家庭|婚姻|房|债|资格|名额|户口|身份|合同|考核|晋升|举报|责任|公平|不公|偏见|歧视|剥削|压榨|垄断|关系户|人情|舆论|平台|算法|资本|组织|管理|规定|处罚|赔偿|诉讼|起诉|总部|经理|供货|加盟|维权|抚养权|高利贷|医托|养老院|驾校|市场|数据|黑产)/;
const STRUGGLE = /(反击|反抗|对抗|争取|竞争|守住|保护|救|证明|揭露|揭开|举报|阻止|夺回|拿回|赢|破解|逃离|摆脱|追查|调查|起诉|偿还|拆掉|公开|直播)/;
const PAIN = /(失去|背叛|牺牲|告别|葬礼|死亡|离开|放弃|误解|决裂|遗憾|来不及|代价|消失|失踪|破裂|错过|失业|破产|病|失败|忘|失忆)/;
const CATHARSIS = /(反击|揭露|清算|赢|证明|救回|保住|翻盘|夺回|拿回|举报|起诉|偿还|自由|保护|实现|团聚|真相大白|揭开真相|摆脱|逆转|公开|拆掉|倒掉|当众)/;
const SUSPENSE = /(秘密|真相|背后|究竟|到底|谁|为何|为什么|消失|失踪|名单|证据|身份|规则|异常|每次|每天|每周|倒计时|直到|最终|最后|结局|未知|谜|线索)/;
const HOPE = /(希望|盼|梦想|守住|保住|救|回家|团聚|自由|尊严|机会|前途|改变|赢|实现)/;
const PRESSURE_EMOTION = /(怕|恐惧|危险|威胁|逼迫|压力|绝望|焦虑|来不及|倒计时|失去|死亡|忘)/;
const CONCRETE_PREMISE = /(合同|遗嘱|工号|病历|账单|订单|直播|账号|工资|房贷|租约|房本|钥匙|名单|录音|监控|聊天记录|考核|名额|证件|快递|药方|手术|保险|借条|票据|档案|门牌|排班|学籍|成绩|二维码|银行卡|手机|群聊|户口|赔偿|保单|奖金|绩效|社保|病例|收据|发票|录取|论文|举报信|工资单|摊位|货架|电子屏|APP|公交线|烧烤|喜被|公平秤|奶茶|驾校|养老院|驿站|粥摊)/i;
const COUNTER_EXPECTATION = /(却|反而|看似|实际上|实际是|并非|不是.{0,30}(?:而是|是)|越.{1,10}越|原来|真正|偏偏|本以为|没想到)/;
const FORCED_TRADEOFF = /(在.{2,24}与.{2,24}之间|二选一|只能.{2,24}(?:或|还是)|保住.{0,14}(?:却要|必须|就得).{0,14}(?:失去|放弃)|公开.{0,14}(?:会|就会)|救.{0,10}(?:却要|代价)|代价是|换来|牺牲.{0,12}(?:才能|换取)|要.{0,18}(?:又|却|同时).{0,18}(?:失去|放弃|承担|保住)|越.{0,12}越.{0,12}(?:失去|危险|难))/;
const SECOND_ORDER = /(转嫁|反噬|牵连|连带|迫使.{0,18}(?:从|改)|敌友.{0,8}改写|关系.{0,10}改写|目标.{0,10}改变|身份.{0,10}改变|规则.{0,10}改变|谁受益|谁承担|收益.{0,10}归|责任.{0,10}转|失去.{0,10}资格)/;
// noveltyProof.secondOrderConsequence 是模型被要求显式填写的语义字段，可用更宽的影响词识别；
// 普通 description/mainReversal 仍使用上面的严格模式，避免“平台/市场”等背景词把单层寓言误判成二阶后果。
const SECOND_ORDER_EVIDENCE = /(受益|受损|关系|目标|身份|规则|客流|收入|饭碗|抚养权|供货|价格|市场|调查对象|迁怒|重排|改写|被迫|反噬|牵连|连带|停工|中断|站队|资格|责任|队友|机会|退学|退役|辞退|停职|解散)/;
const MORAL_TRIGGER = /(说谎|撒谎|欺骗|贪心|作弊|偷懒|造假|网暴|炫富|贪婪|自私|恶意)/;
const DIRECT_PUNISHMENT = /(消失|死亡|失去|惩罚|报应|倒霉|变穷|被抹除|失忆|受伤|破产|扣除)/;

const normalized = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

function noveltyOf(idea: any) {
  const novelty = idea?.noveltyProof && typeof idea.noveltyProof === 'object' ? idea.noveltyProof : {};
  return {
    familiarShell: normalized(novelty?.familiarShell),
    uncommonCombination: normalized(novelty?.uncommonCombination),
    avoidedPatterns: normalized(novelty?.avoidedPatterns),
    irreplaceableWhy: normalized(novelty?.irreplaceableWhy),
    secondOrderConsequence: normalized(novelty?.secondOrderConsequence),
    readerQuestion: normalized(novelty?.readerQuestion),
  };
}

const textOf = (idea: any): string => {
  const novelty = noveltyOf(idea);
  return [
    idea?.title,
    idea?.hook,
    idea?.description,
    idea?.protagonist,
    idea?.coreConflict,
    idea?.conflict,
    idea?.uniquePoint,
    idea?.uniqueSelling,
    idea?.mainReversal,
    idea?.storyCore,
    novelty.familiarShell,
    novelty.uncommonCombination,
    novelty.irreplaceableWhy,
    novelty.secondOrderConsequence,
    novelty.readerQuestion,
  ].map(normalized).filter(Boolean).join('；');
};

function markerCount(text: string, regex: RegExp): number {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return [...text.matchAll(new RegExp(regex.source, flags))].length;
}

function titleHasStoryAnchor(title: string, evidence: string): boolean {
  if (title.length < 4 || GENERIC_TITLE.test(title)) return false;
  const cleanTitle = title.replace(/[《》“”'"，。！？：；、\s]/g, '');
  const cleanEvidence = evidence.replace(/[\s\p{P}\p{S}]/gu, '');
  if (cleanTitle.length < 2) return false;
  for (let i = 0; i <= cleanTitle.length - 2; i += 1) {
    const gram = cleanTitle.slice(i, i + 2);
    if (cleanEvidence.includes(gram)) return true;
  }
  return false;
}

@Injectable()
export class IdeaAppealGateService {
  assess(idea: any, storyType: StoryType): IdeaAppealAssessment {
    const title = normalized(idea?.title);
    const hook = normalized(idea?.hook);
    const description = normalized(idea?.description);
    const protagonist = normalized(idea?.protagonist);
    const uniquePoint = normalized(idea?.uniquePoint || idea?.uniqueSelling || idea?.storyCore);
    const coreConflict = normalized(idea?.coreConflict || idea?.conflict);
    const mainReversal = normalized(idea?.mainReversal);
    const novelty = noveltyOf(idea);
    const noveltyEvidence = [novelty.uncommonCombination, novelty.irreplaceableWhy, novelty.secondOrderConsequence, novelty.readerQuestion].filter(Boolean).join('；');
    const all = textOf(idea);

    const titleAnchored = titleHasStoryAnchor(title, `${hook}；${description}；${uniquePoint}；${coreConflict}；${mainReversal}；${noveltyEvidence}`);
    const hookHasAnomaly = ANOMALY.test(hook);
    const hookHasPressure = PRESSURE.test(hook);
    const hookHasAgency = AGENCY.test(hook) || FIRST_PERSON_ACTION.test(hook) || CONCRETE_ACTION.test(hook) || HOOK_CHOICE.test(hook);
    const hookHasRelationship = RELATIONSHIP.test(hook);
    const descriptionProgressions = (description.match(PROGRESSION) || []).length;

    const promiseText = `${uniquePoint}；${coreConflict}；${mainReversal}`;
    const promiseTokens = promiseText
      .split(/[，。！？；：、\s]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 12);
    const openingText = `${hook}；${description.slice(0, Math.min(description.length, 260))}`;
    const openingNormalized = openingText.replace(/[\s\p{P}\p{S}]/gu, '');
    const genericPromiseAnchors = new Set(['主角必须', '主角发现', '必须在三', '最后必须', '最终必须', '发现真相', '揭开真相', '为了保住', '一个普通']);
    const promiseAnchors = promiseTokens.flatMap((token) => {
      const clean = token.replace(/[\s\p{P}\p{S}]/gu, '');
      if (clean.length < 4) return clean.length >= 2 ? [clean] : [];
      const anchors: string[] = [];
      for (let index = 0; index <= clean.length - 4; index += 1) anchors.push(clean.slice(index, index + 4));
      return anchors;
    }).filter((anchor) => !genericPromiseAnchors.has(anchor));
    const openingDeliversPromise = promiseAnchors.length > 0
      && promiseAnchors.some((anchor) => openingNormalized.includes(anchor));

    const lifeAnchor = LIFE_ANCHOR.test(all);
    const aspiration = ASPIRATION.test(all) || /(?:想|要|希望|盼).{1,20}/.test(protagonist);
    const socialFriction = SOCIAL_FRICTION.test(all);
    const painPotential = PAIN.test(all);
    const sustainedSuspense = SUSPENSE.test(`${hook}；${description}；${mainReversal}`)
      || (novelty.readerQuestion.length >= 8 && /[？?]$/.test(novelty.readerQuestion));

    const intensityHits = markerCount(all, /(反转|死亡|牺牲|背叛|真相|翻盘|绝望|反击|倒计时|失去)/);
    const stackingRisk = all.length > 0 && intensityHits >= (storyType === 'short_story' ? 9 : 12)
      && intensityHits / Math.max(1, all.length / 100) >= 4;

    const distinctiveText = `${title}；${hook}；${uniquePoint}；${coreConflict}；${mainReversal}；${description}；${noveltyEvidence}`;
    const structuredPremiseEvidence = novelty.uncommonCombination.length >= 12 && novelty.irreplaceableWhy.length >= 16;
    const concretePremiseAnchor = CONCRETE_PREMISE.test(`${title}；${hook}；${uniquePoint}；${novelty.uncommonCombination}`)
      || /\d+[天小时分钟年月次条份人章]/.test(distinctiveText)
      || structuredPremiseEvidence;
    const counterExpectation = COUNTER_EXPECTATION.test(`${uniquePoint}；${mainReversal}；${description}；${novelty.uncommonCombination}`);
    const forcedTradeoff = FORCED_TRADEOFF.test(`${coreConflict}；${mainReversal}；${description}；${novelty.secondOrderConsequence}`);
    const explicitSecondOrder = novelty.secondOrderConsequence.length >= 16 && SECOND_ORDER_EVIDENCE.test(novelty.secondOrderConsequence);
    const baseReversalConsequence = mainReversal.length >= 12 && CONSEQUENCE.test(mainReversal);
    const reversalConsequential = baseReversalConsequence
      || (mainReversal.length >= 12 && explicitSecondOrder && COUNTER_EXPECTATION.test(mainReversal));
    const secondOrderConsequence = explicitSecondOrder
      || SECOND_ORDER.test(`${mainReversal}；${description}`)
      || (reversalConsequential && forcedTradeoff);
    const payoffPromise = PAYOFF.test(description)
      || PAYOFF.test(mainReversal)
      || (reversalConsequential && (forcedTradeoff || secondOrderConsequence));
    const struggleAgency = STRUGGLE.test(all) || hookHasAgency;
    const catharsisPotential = CATHARSIS.test(all) || payoffPromise;
    const emotionalContrastGroups = [
      PRESSURE_EMOTION.test(all),
      HOPE.test(all),
      PAIN.test(all),
      CATHARSIS.test(all),
    ].filter(Boolean).length;

    const simpleMoralMechanismRisk = MORAL_TRIGGER.test(`${title}；${hook}；${uniquePoint}`)
      && DIRECT_PUNISHMENT.test(`${title}；${hook}；${uniquePoint}`)
      && !forcedTradeoff && !secondOrderConsequence;
    const distinctivenessScore = Math.max(0, Math.min(10,
      (concretePremiseAnchor ? 2 : 0)
      + (counterExpectation ? 2 : 0)
      + (forcedTradeoff ? 2 : 0)
      + (secondOrderConsequence ? 2 : 0)
      + (hookHasRelationship ? 1 : 0)
      + (openingDeliversPromise ? 1 : 0)
      - (simpleMoralMechanismRisk ? 4 : 0)
      - (stackingRisk ? 1 : 0)));

    const readerExperienceProfile = this.buildReaderExperienceProfile(storyType, {
      lifeAnchor,
      aspiration,
      socialFriction,
      struggleAgency,
      painPotential,
      catharsisPotential,
      sustainedSuspense,
      emotionalContrastGroups,
      stackingRisk,
    });

    const issues: string[] = [];
    const warnings: string[] = [];
    if (!titleAnchored) issues.push('标题没有稳定锚定本故事的具体人物/规则/关系/异常，或仍是可替换套名');
    const hookSignalCount = [hookHasAnomaly, hookHasPressure, hookHasAgency, hookHasRelationship].filter(Boolean).length;
    if (storyType === 'short_story') {
      if (!hookHasAgency) issues.push('核心钩子没有迫使主角采取具体行动或明确选择');
      if (hookSignalCount < SHORT_IDEA_HOOK_MIN_SIGNALS) issues.push(`短篇首屏钩子信息过弱：异常/压力/行动/关系至少应形成 ${SHORT_IDEA_HOOK_MIN_SIGNALS} 个有效信号`);
      if (!hookHasAnomaly) warnings.push('核心钩子未直接展示异常/信息差；若故事主要靠现实两难成立，可由压力、行动和关系共同承担首屏吸引力');
      if (!hookHasPressure) warnings.push('核心钩子未直接展示代价或时限；若故事已有强行动、关系与信息差，可在后续卡片字段承接明确后果');
    } else {
      if (!hookHasPressure) issues.push('核心钩子缺少明确代价、时限或失去风险');
      if (!hookHasAgency) issues.push('核心钩子没有迫使主角采取具体行动');
      if (!hookHasAnomaly) warnings.push('核心钩子未直接展示异常/信息差；长篇允许由现实压力与持续追问承担开篇吸引力');
    }
    if (descriptionProgressions < (storyType === 'short_story' ? 2 : 3)) issues.push('故事推进只有一个点子，缺少可持续升级链');
    if (!openingDeliversPromise) issues.push('开篇钩子与核心卖点/冲突脱节，阅读承诺不能尽早兑现');
    if (!reversalConsequential) issues.push('核心反转只是在补充信息，没有改变目标、关系、胜负条件或代价');
    if (storyType === 'short_story' && !payoffPromise) issues.push('短篇只有吊胃口，没有明确的中后段/终局兑现承诺');
    if (!lifeAnchor) issues.push('缺少可代入的人生利益或关系锚点：题材机制尚未落到家庭、工作、钱、尊严、健康、归属、责任或生存等具体代价');
    if (!aspiration) issues.push('主角缺少清晰的生活期盼/欲望：读者不知道他真正想得到、守住、夺回或改变什么');
    if (!socialFriction) warnings.push('当前题材没有明显社会规则/资源/身份摩擦；这不是所有故事的必选项，若题材主轴不是现实批判，不作为淘汰理由');
    if (!sustainedSuspense) issues.push('缺少可贯穿阶段的核心追问，故事没有稳定的“还想知道什么”');
    if (simpleMoralMechanismRisk) issues.push('题材仍是“某种行为→直接受到超常惩罚/报应”的单层寓言机制，缺少会改写利益、关系或选择的第二层后果');
    const minDistinctiveness = storyType === 'short_story' ? 6 : 5;
    if (distinctivenessScore < minDistinctiveness) issues.push(`题材差异度不足（${distinctivenessScore}/10）：具体生活载体、反预期、两难选择和二阶后果至少要形成稳定组合，而不是字段齐全即可通过`);

    if (!struggleAgency) warnings.push('抗争/争取空间偏弱：后续章纲应让主角通过选择和行动获得热血感，而不是被动承受');
    if (!painPotential) warnings.push('题材卡尚未显出自然的情感代价；后续只能在建立关系/愿望投入后安排“刀点”，禁止为了虐而虐');
    if (!catharsisPotential) warnings.push('当前回报/释放压力的路径偏弱；后续需设计与前置压力对应的阶段兑现，禁止凭空开挂');
    if (emotionalContrastGroups < 2) warnings.push('情绪功能目前较单一；后续按情节因果形成起伏，不要求喜怒哀乐逐项轮播');
    if (stackingRisk) warnings.push('高强度元素密度过高，有反转/刀点/爽点盲目叠加风险；后续必须拉开呼吸段和因果铺垫');

    return {
      passed: issues.length === 0,
      issues,
      warnings,
      signals: {
        titleAnchored,
        hookHasAnomaly,
        hookHasPressure,
        hookHasAgency,
        hookHasRelationship,
        descriptionProgressions,
        openingDeliversPromise,
        reversalConsequential,
        payoffPromise,
        concretePremiseAnchor,
        counterExpectation,
        forcedTradeoff,
        secondOrderConsequence,
        simpleMoralMechanismRisk,
        distinctivenessScore,
      },
      readerExperienceProfile,
    };
  }

  select(ideas: any[], storyType: StoryType, desiredCount: number) {
    const assessed = ideas.map((idea) => ({ idea, assessment: this.assess(idea, storyType) }));
    const accepted = assessed
      .filter((item) => item.assessment.passed)
      .sort((left, right) =>
        right.assessment.signals.distinctivenessScore - left.assessment.signals.distinctivenessScore
        || right.assessment.signals.descriptionProgressions - left.assessment.signals.descriptionProgressions
        || Number(right.assessment.signals.hookHasRelationship) - Number(left.assessment.signals.hookHasRelationship))
      .slice(0, desiredCount)
      .map((item) => ({
        ...item.idea,
        ideaAppealGate: {
          passed: true as const,
          distinctivenessScore: item.assessment.signals.distinctivenessScore,
        },
        readerExperienceProfile: item.assessment.readerExperienceProfile,
      }));
    return { assessed, accepted };
  }

  private buildReaderExperienceProfile(storyType: StoryType, evidence: ReaderExperienceEvidence): ReaderExperienceProfile {
    const isShort = storyType === 'short_story';
    return {
      version: 1,
      storyType,
      pace: '偏快但保留呼吸段',
      densityMode: isShort ? '短篇集中兑现' : '长篇分阶段波动',
      principles: {
        lifeGrounding: '无论现实、悬疑或幻想，冲突最终都要落到普通人能感到的生活利益、关系、尊严、责任、机会或生存代价，避免只剩设定奇观。',
        aspiration: '始终让读者知道人物在盼什么、守什么、怕失去什么；爽感和痛感都必须从这个生活期盼生长出来。',
        socialCritique: '现实批判通过具体规则、权力、资源、身份和利益冲突自然呈现，让人物承担后果；禁止作者站出来连续说教。',
        struggle: isShort
          ? '热血来自关键节点的主动选择、反击或守护，集中在少数真正改变局势的场面，不连续拔高。'
          : '热血沿阶段目标逐层升级：小胜、受挫、再选择、阶段突破交替出现；允许低压章积累关系和判断。',
        reversals: isShort
          ? '反转少而重，集中在真正改变目标、关系、真相或代价的位置；不追求反转数量，更不能每段翻一次。'
          : '反转按卷/阶段分布，主反转有前置证据并改变后续行动；普通章节可只推进信息或关系，禁止每章固定一个反转。',
        emotionalPain: isShort
          ? '“刀点”先建立人物关系或愿望，再用一个或少数核心代价命中；痛后必须留下选择、余韵或回甘，禁止为了虐而虐。'
          : '重大失去、背叛、牺牲或遗憾必须经过长期投入后兑现，并让后果跨章持续；两次高强度情感打击之间保留恢复和关系发展。',
        emotionalWave: isShort
          ? '在有限篇幅内形成清晰的压迫—希望—受挫/转折—释放或余韵波形，不要求喜怒哀乐逐项打卡。'
          : '喜怒哀乐按人物弧和卷目标形成长波与短波；高压、轻松、温情、失落由因果自然切换，禁止机械轻重交替。',
        catharsis: isShort
          ? '前段尽早给可感知的小兑现，终局必须兑现主要阅读承诺；爽点必须由前置压力和行动换来。'
          : '采用小回报—阶段回报—大兑现的层级，让长期压力定期获得释放；不能长期只压不还，也不能无代价连续开挂。',
        suspense: isShort
          ? '一条核心追问贯穿全篇，中小悬念只服务这条主线；结尾以回答核心问题和余味为主。'
          : '保留一条可贯穿全书的核心悬念，同时用卷级/阶段级问题接力；旧悬念应阶段兑现后再扩展，避免只挖不填。',
        restraint: '节奏整体偏快，但快指有效变化更密，不是事件更吵。追逐/争执/反转可快；调查、关系、恢复、蓄力可慢，只要持续产生新事实、判断、关系或状态变化。任何热血、反转、刀点、爽点都不得按固定间隔盲目叠加。',
      },
      evidence,
    };
  }
}
