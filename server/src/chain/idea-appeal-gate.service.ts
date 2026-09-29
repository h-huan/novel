import { Injectable } from '@nestjs/common';

export interface IdeaAppealAssessment {
  passed: boolean;
  issues: string[];
  signals: {
    hookSignalGroups: number;
    progressionSignals: number;
    titleAnchored: boolean;
    openingPromise: boolean;
    payoffPromise: boolean;
  };
}

const compact = (value: unknown) => String(value || '').replace(/[《》「」\s，、,。！？!?；;：“”'‘’（）()【】\[\]]/g, '');

const bigrams = (value: unknown) => {
  const text = compact(value);
  const result = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) result.add(text.slice(i, i + 2));
  return result;
};

const sharesBigram = (left: unknown, right: unknown) => {
  const a = bigrams(left);
  const b = bigrams(right);
  for (const gram of a) if (b.has(gram)) return true;
  return false;
};

const GENERIC_TITLE = /^(?:命运之.+|重生之.+|.+的人生|.+之路|.+传奇|爱与救赎)$/;
const PRESSURE = /(必须|否则|只剩|期限|倒计时|最后\d|每次|每当|一旦|代价|失去|欠债|债务|追债|死|杀|被抓|坐牢|开除|破产|暴露|举报|追杀|淘汰|赎金|偿还|赔偿|罚款|封杀)/;
const ANOMALY = /(却|竟|突然|发现|失踪|消失|不存在|重复|复活|死而复生|陌生|名单|真相|秘密|异常|反常|只有|无人|所有人|另一个|未来|过去|倒退|抹除|重置|循环|变成)/;
const AGENCY = /(调查|查出|寻找|找到|逃|救|抢|夺|骗|追|阻止|证明|选择|交易|复仇|报警|举报|反击|揭开|破解|争夺|赢|杀|救下|偷|换|拆穿|潜入)/;
const RELATION = /(母亲|父亲|妈妈|爸爸|丈夫|妻子|女儿|儿子|姐姐|哥哥|弟弟|妹妹|恋人|前任|未婚|同事|老板|债主|朋友|家人|孩子|老师|学生|邻居|搭档)/;
const PROGRESSION = /(先|随后|接着|第二|再次|每次|与此同时|直到|却|反而|更|没想到|紧接着|迫使|导致|最终|最后)/g;
const REVERSAL_CONSEQUENCE = /(身份|目标|关系|敌友|胜负|真相|原来|其实|必须|迫使|代价|选择|反转|凶手|幕后|名单|证据|规则|阵营|利益|生死)/;
const PAYOFF = /(最终|最后|结局|真相|揭开|揭露|兑现|代价|选择|反杀|获救|救下|失去|偿还|离开|留下|赢|输|死亡|活下来|解决|证明|清算)/;
const OPENING = /(第一章|首章|开篇|开局|一开始|起手|当场|立即|刚开始|第一幕)/;

/**
 * 只做可解释、确定性的“是否值得展示”检查，不伪造点击率/完读率数字。
 * 它不是文学评分器：只淘汰字段齐全但缺少第一眼冲突、行动压力、升级链或兑现承诺的弱题材。
 */
@Injectable()
export class IdeaAppealGateService {
  assess(candidate: any, storyType: 'short_story' | 'long_novel', platform: string): IdeaAppealAssessment {
    const issues: string[] = [];
    const title = String(candidate?.title || '').replace(/[《》「」]/g, '').trim();
    const hook = String(candidate?.hook || '').trim();
    const description = String(candidate?.description || '').trim();
    const uniquePoint = String(candidate?.uniquePoint || '').trim();
    const reversal = String(candidate?.mainReversal || '').trim();
    const conflict = String(candidate?.coreConflict || '').trim();
    const coreText = [hook, description, uniquePoint, conflict, reversal].join(' ');

    if (GENERIC_TITLE.test(title)) issues.push('标题属于可套用到任意故事的空泛模板');
    const titleAnchored = title.length >= 4 && sharesBigram(title, coreText);
    if (!titleAnchored) issues.push('标题与故事核心没有可识别的具体关联，第一眼信息利用率不足');

    const hookSignalGroups = [PRESSURE, ANOMALY, AGENCY, RELATION].filter(re => re.test(hook)).length;
    if (hook.length < 35) issues.push('钩子过短，未形成完整的异常/困境/代价入口');
    if (!PRESSURE.test(hook)) issues.push('钩子缺少具体代价、时限或失去风险');
    if (hookSignalGroups < 2) issues.push('钩子缺少足够的异常、行动或关系张力');

    const progressionSignals = new Set(description.match(PROGRESSION) || []).size;
    if (progressionSignals < 2) issues.push('概要缺少至少两次可识别的升级/转折，容易变成单一冲突反复');

    const openingPromise = OPENING.test(uniquePoint) || sharesBigram(uniquePoint, hook);
    if (!openingPromise) issues.push('独特卖点与开篇钩子脱节，无法证明第一章即可兑现核心卖点');

    if (reversal.length < 14 || !REVERSAL_CONSEQUENCE.test(reversal)) {
      issues.push('核心反转没有明确改变目标、关系、胜负条件或认知');
    }

    const payoffPromise = PAYOFF.test(`${description} ${reversal}`);
    if (storyType === 'short_story' && !payoffPromise) {
      issues.push('短篇缺少可识别的中后段回报/终局兑现承诺');
    }

    // 番茄短篇默认要求更强的第一眼密度；不是平台“官方分数”，只是本系统的展示门槛。
    if (platform === 'fanqie' && storyType === 'short_story' && hookSignalGroups < 3) {
      issues.push('番茄短篇的首屏冲突密度不足：异常/压力/行动/关系至少命中三类');
    }

    return {
      passed: issues.length === 0,
      issues,
      signals: { hookSignalGroups, progressionSignals, titleAnchored, openingPromise, payoffPromise },
    };
  }

  select(
    ideas: any[],
    desiredCount: number,
    storyType: 'short_story' | 'long_novel',
    platform: string,
  ) {
    const assessed = (Array.isArray(ideas) ? ideas : []).map((idea, index) => ({
      idea,
      index,
      assessment: this.assess(idea, storyType, platform),
    }));
    const accepted = assessed
      .filter(item => item.assessment.passed)
      .sort((a, b) => {
        const sa = a.assessment.signals.hookSignalGroups + a.assessment.signals.progressionSignals;
        const sb = b.assessment.signals.hookSignalGroups + b.assessment.signals.progressionSignals;
        return sb - sa || a.index - b.index;
      })
      .slice(0, desiredCount)
      .map(item => item.idea);
    return { accepted, assessed };
  }
}
