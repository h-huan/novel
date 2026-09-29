import { Injectable } from '@nestjs/common';

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
}

export interface ReaderExperienceEvidence {
  /** 是否落到读者能理解的人生利益：家庭、工作、钱、尊严、健康、归属、责任、生存等。 */
  lifeAnchor: boolean;
  /** 主角是否有明确想得到、守住、夺回或改变的东西。 */
  aspiration: boolean;
  /** 批判是否落到具体规则、权力、资源、身份或关系摩擦，而不是口号。 */
  socialFriction: boolean;
  /** 是否存在主动抗争/争取/保护/揭露等行动可能。 */
  struggleAgency: boolean;
  /** 是否存在可在建立情感投入后兑现的失去、背叛、牺牲、遗憾等情感代价。 */
  painPotential: boolean;
  /** 是否存在反击、翻盘、守住、夺回、真相揭开等释放压力的回报。 */
  catharsisPotential: boolean;
  /** 是否存在能跨阶段持续追问的未知、真相、身份、规则或结果。 */
  sustainedSuspense: boolean;
  /** 不是要求喜怒哀乐逐项出现，只统计目前能识别的不同情绪功能组。 */
  emotionalContrastGroups: number;
  /** 仅作警告：高强度元素过密可能产生“每段都爆”的疲劳，不作为鼓励叠加的目标。 */
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
const ANOMALY = /(突然|异常|消失|失踪|不存在|多出|少了|倒计时|重复|重置|回拨|名单|遗嘱|秘密|真相|陌生|不认识|死亡|葬礼|尸体|证据|监控|规则|每次|每天|每周|第\d|竟然|原来|却)/;
const PRESSURE = /(必须|否则|只剩|之前|截止|期限|倒计时|代价|失去|死亡|辞退|开除|破产|债|欠|追责|坐牢|举报|威胁|危险|救|保住|夺回|不能|来不及|一旦)/;
const AGENCY = /(查|调查|追|找|救|保|阻止|揭|证明|反击|举报|逃|夺回|争|守|破解|选择|决定|行动|潜入|对抗|偿还|起诉)/;
const RELATIONSHIP = /(父|母|爸|妈|儿|女|妻|夫|丈夫|老婆|恋人|前任|兄|弟|姐|妹|同事|老板|朋友|邻居|家人|亲人|师|同学|搭档|夫妻|家庭)/;
const PROGRESSION = /(起初|最初|第一|随后|接着|之后|第二|第三|却|反而|直到|进一步|升级|失控|恶化|暴露|发现|揭开|逼迫|迫使|最终|最后|真相|代价|反转|转而|同时)/g;
const CONSEQUENCE = /(因此|导致|迫使|不得不|转而|从此|目标|敌人|盟友|关系|身份|代价|失去|死亡|生死|真相|胜负|规则|条件|救|保|夺回|反击|举报|起诉|辞退|破产|翻盘|改变)/;
const PAYOFF = /(最终|最后|结局|收束|付出代价|承担|偿还|揭开真相|真相大白|救回|保住|夺回|赢|失败|和解|分开|离开|选择|兑现|翻盘)/;

// “贴近生活”不等于只能写现实题材。幻想/悬疑同样需要把超常机制压到人能理解的生活利益与情感关系上。
const LIFE_ANCHOR = /(生活|日子|家|家庭|父|母|爸|妈|儿|女|妻|夫|恋人|亲人|朋友|同事|工作|上班|职业|工资|钱|存款|房|租|贷款|债|学费|学校|考试|医院|病|健康|养老|婚|孩子|邻居|尊严|体面|名声|机会|前途|责任|归属|自由|安全|生存|吃饭|失业|辞退|开除)/;
const ASPIRATION = /(想要|希望|盼|梦想|目标|为了|守住|保住|保护|救|夺回|拿回|找回|改变|证明|赢|活下去|自由|尊严|回家|团聚|查清|揭开|摆脱|偿还|考上|留下|成为|阻止)/;
const SOCIAL_FRICTION = /(规则|制度|权力|资源|利益|阶层|贫富|公司|老板|职场|学校|医院|家庭|婚姻|房|债|资格|名额|户口|身份|合同|考核|晋升|举报|责任|公平|不公|偏见|歧视|剥削|压榨|垄断|关系户|人情|舆论|平台|算法|资本|组织|管理|规定|处罚|赔偿|诉讼|起诉)/;
const STRUGGLE = /(反击|反抗|对抗|争取|竞争|守住|保护|救|证明|揭露|揭开|举报|阻止|夺回|拿回|赢|破解|逃离|摆脱|追查|调查|起诉|偿还)/;
const PAIN = /(失去|背叛|牺牲|告别|葬礼|死亡|离开|放弃|误解|决裂|遗憾|来不及|代价|消失|失踪|破裂|错过|失业|破产|病|失败)/;
const CATHARSIS = /(反击|揭露|清算|赢|证明|救回|保住|翻盘|夺回|拿回|举报|起诉|偿还|自由|保护|实现|团聚|真相大白|揭开真相|摆脱|逆转)/;
const SUSPENSE = /(秘密|真相|背后|究竟|到底|谁|为何|为什么|消失|失踪|名单|证据|身份|规则|异常|每次|每天|每周|倒计时|直到|最终|最后|结局|未知|谜|线索)/;
const HOPE = /(希望|盼|梦想|守住|保住|救|回家|团聚|自由|尊严|机会|前途|改变|赢|实现)/;
const PRESSURE_EMOTION = /(怕|恐惧|危险|威胁|逼迫|压力|绝望|焦虑|来不及|倒计时|失去|死亡)/;

const normalized = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const textOf = (idea: any): string => [
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
].map(normalized).filter(Boolean).join('；');

function markerCount(text: string, regex: RegExp): number {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return [...text.matchAll(new RegExp(regex.source, flags))].length;
}

@Injectable()
export class IdeaAppealGateService {
  assess(idea: any, storyType: StoryType): IdeaAppealAssessment {
    const title = normalized(idea?.title);
    const hook = normalized(idea?.hook);
    const description = normalized(idea?.description);
    const uniquePoint = normalized(idea?.uniquePoint || idea?.uniqueSelling || idea?.storyCore);
    const coreConflict = normalized(idea?.coreConflict || idea?.conflict);
    const mainReversal = normalized(idea?.mainReversal);
    const all = textOf(idea);

    const titleAnchors = [hook, description, uniquePoint, coreConflict, mainReversal]
      .join('')
      .includes(title.replace(/[《》“”'"，。！？：；、\s]/g, '').slice(0, 2));
    const titleAnchored = title.length >= 4 && !GENERIC_TITLE.test(title) && titleAnchors;
    const hookHasAnomaly = ANOMALY.test(hook);
    const hookHasPressure = PRESSURE.test(hook);
    const hookHasAgency = AGENCY.test(hook);
    const hookHasRelationship = RELATIONSHIP.test(hook);
    const descriptionProgressions = (description.match(PROGRESSION) || []).length;

    const promiseText = `${uniquePoint}；${coreConflict}；${mainReversal}`;
    const promiseTokens = promiseText
      .split(/[，。！？；：、\s]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 12);
    const openingText = `${hook}；${description.slice(0, Math.min(description.length, 260))}`;
    const openingDeliversPromise = promiseTokens.length > 0
      && promiseTokens.some((token) => openingText.includes(token.slice(0, Math.min(token.length, 4))));
    const reversalConsequential = mainReversal.length >= 12 && CONSEQUENCE.test(mainReversal);
    const payoffPromise = PAYOFF.test(description) || PAYOFF.test(mainReversal);

    const lifeAnchor = LIFE_ANCHOR.test(all);
    const aspiration = ASPIRATION.test(all);
    const socialFriction = SOCIAL_FRICTION.test(all);
    const struggleAgency = STRUGGLE.test(all);
    const painPotential = PAIN.test(all);
    const catharsisPotential = CATHARSIS.test(all) || payoffPromise;
    const sustainedSuspense = SUSPENSE.test(`${hook}；${description}；${mainReversal}`);
    const emotionalContrastGroups = [
      PRESSURE_EMOTION.test(all),
      HOPE.test(all),
      PAIN.test(all),
      CATHARSIS.test(all),
    ].filter(Boolean).length;

    // 这是风险提示，不是“越多越好”的打分。短文本塞入过多高强度词，通常意味着元素堆砌而非自然节奏。
    const intensityHits = markerCount(all, /(反转|死亡|牺牲|背叛|真相|翻盘|绝望|反击|倒计时|失去)/);
    const stackingRisk = all.length > 0 && intensityHits >= (storyType === 'short_story' ? 9 : 12)
      && intensityHits / Math.max(1, all.length / 100) >= 4;

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
    if (!hookHasAnomaly) issues.push('核心钩子缺少一眼可识别的异常/信息差');
    if (!hookHasPressure) issues.push('核心钩子缺少明确代价、时限或失去风险');
    if (!hookHasAgency) issues.push('核心钩子没有迫使主角采取具体行动');
    const hookSignalCount = [hookHasAnomaly, hookHasPressure, hookHasAgency, hookHasRelationship].filter(Boolean).length;
    if (storyType === 'short_story' && hookSignalCount < 3) issues.push('短篇首屏钩子信息过弱：异常/压力/行动/关系至少应形成三个有效信号');
    if (descriptionProgressions < (storyType === 'short_story' ? 2 : 3)) issues.push('故事推进只有一个点子，缺少可持续升级链');
    if (!openingDeliversPromise) issues.push('开篇钩子与核心卖点/冲突脱节，阅读承诺不能尽早兑现');
    if (!reversalConsequential) issues.push('核心反转只是在补充信息，没有改变目标、关系、胜负条件或代价');
    if (storyType === 'short_story' && !payoffPromise) issues.push('短篇只有吊胃口，没有明确的中后段/终局兑现承诺');

    // 用户要求的“贴近生活/现实批判”落成底层人类利益和具体摩擦，而不是强迫每本都写工资房价。
    if (!lifeAnchor) issues.push('缺少可代入的人生利益或关系锚点：题材机制尚未落到家庭、工作、钱、尊严、健康、归属、责任或生存等具体代价');
    if (!aspiration) issues.push('主角缺少清晰的生活期盼/欲望：读者不知道他真正想得到、守住、夺回或改变什么');
    if (!socialFriction) issues.push('现实批判没有落到具体规则、权力、资源、身份或关系摩擦，容易变成空泛说教');
    if (!sustainedSuspense) issues.push('缺少可贯穿阶段的核心追问，故事没有稳定的“还想知道什么”');

    // 热血、刀点、喜怒哀乐、爽感是体验曲线，不是题材卡逐项打卡。缺失时给下游规划提示，不用在发现阶段强塞。
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
      },
      readerExperienceProfile,
    };
  }

  select(ideas: any[], storyType: StoryType, desiredCount: number) {
    const assessed = ideas.map((idea) => ({ idea, assessment: this.assess(idea, storyType) }));
    const accepted = assessed
      .filter((item) => item.assessment.passed)
      .slice(0, desiredCount)
      .map((item) => ({
        ...item.idea,
        // 随 selectedIdea 原样进入 Creative Constitution.confirmedStory；后续世界观/章纲/正文共享同一份体验策略。
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
