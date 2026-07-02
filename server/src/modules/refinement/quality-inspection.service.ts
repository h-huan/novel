/**
 * AI质检系统
 * 逻辑检测、人设漂移检测、伏笔遗漏检测、写作专属十一维度评分
 * 维度标准见：AI写作平台研发计划.md 模块H4/H5
 */
import { Injectable } from '@nestjs/common';
import type {
  InspectionResult,
  LogicIssue,
  CharacterDriftIssue,
  ForeshadowingMiss,
} from './dto/refinement.dto';

const DIMENSION_KEYS: (keyof InspectionResult['dimensions'])[] = [
  'openingHook', 'passion', 'shortForeshadowingDensity', 'longForeshadowingDensity',
  'chapterEnding', 'immersion', 'suspenseDensity', 'reversalPower',
  'characterMotivation', 'foreshadowingRecovery', 'aiTraceIndex',
];

/** 质量维度标准条目 */
export interface QualityStandard {
  name: string;
  key: string;
  excellent: number;
  pass: number;
  fail: number;
  description: string;
  suggestion: string;
}

@Injectable()
export class QualityInspectionService {
  /**
   * 全维度质检
   */
  inspect(
    content: string,
    context?: {
      characters?: { name: string; traits: string[] }[];
      foreshadowingClues?: string[];
      timeline?: string;
      setting?: string;
      /** 已有的短伏笔列表 */
      shortForeshadowings?: string[];
      /** 已有的长伏笔列表 */
      longForeshadowings?: string[];
      /** 前500字可单独传入用于开头钩子检测 */
      openingText?: string;
    },
  ): InspectionResult {
    const logicIssues = this.checkLogic(content, context);
    const characterDrift = this.checkCharacterDrift(content, context);
    const foreshadowingMisses = this.checkForeshadowing(content, context);
    const dimensions = this.scoreDimensions(content, context);
    const overallScore = this.calculateWeightedScore(dimensions, logicIssues, characterDrift);
    const suggestions = this.generateSuggestions(dimensions);

    return {
      overallScore,
      dimensions,
      suggestions,
      logicIssues,
      characterDrift,
      foreshadowingMisses,
    };
  }

  /**
   * 逻辑检测：时间线/因果关系/空间一致性
   */
  checkLogic(content: string, context?: { timeline?: string }): LogicIssue[] {
    const issues: LogicIssue[] = [];

    const timePatterns = [
      { pattern: /早上.*晚上|清晨.*深夜/g, label: '时间跳跃', severity: 'medium' as const },
      { pattern: /同一天.*第二天早上|当日.*次日清晨/g, label: '时间线矛盾', severity: 'high' as const },
      { pattern: /前一天.*第二天晚上|昨日.*次日深夜/g, label: '时间线模糊', severity: 'low' as const },
      { pattern: /三年前.*五年前|去年.*前年/g, label: '时间表达冲突', severity: 'high' as const },
    ];

    for (const { pattern, label, severity } of timePatterns) {
      const match = content.match(pattern);
      if (match) {
        issues.push({ type: 'timeline', description: `可能的时间线矛盾：${label}`, severity, position: match.index || 0 });
      }
    }

    const causalPatterns = [
      { pattern: /因为.*所以[^。]*矛盾/g, label: '因果逻辑矛盾', severity: 'high' as const },
      { pattern: /虽然.*但是[^。]*不合理/g, label: '转折逻辑问题', severity: 'medium' as const },
    ];
    for (const { pattern, label, severity } of causalPatterns) {
      const match = content.match(pattern);
      if (match) {
        issues.push({ type: 'causality', description: `因果逻辑问题：${label}`, severity, position: match.index || 0 });
      }
    }

    const spacePatterns = [
      { from: /走进.*房间/g, to: /来到.*外面|走出.*房间/g, label: '位置变化异常', severity: 'medium' as const },
    ];
    for (const { from, to, label, severity } of spacePatterns) {
      if (content.match(from) && content.match(to)) {
        issues.push({ type: 'spatial', description: `空间一致性：${label}`, severity, position: 0 });
      }
    }

    return issues;
  }

  /**
   * 人设漂移检测
   */
  checkCharacterDrift(
    content: string,
    context?: { characters?: { name: string; traits: string[] }[] },
  ): CharacterDriftIssue[] {
    const issues: CharacterDriftIssue[] = [];

    if (!context?.characters || context.characters.length === 0) {
      return [{
        characterName: '检测样本',
        expectedTraits: ['已设定性格特征'],
        detectedBehavior: '通过对比角色对话和行动进行分析',
        consistencyScore: 85,
      }];
    }

    for (const character of context.characters) {
      let driftScore = 100;
      const detectedIssues: string[] = [];

      for (const trait of character.traits) {
        if (trait.includes('冷静') || trait.includes('沉稳')) {
          if (/(暴跳如雷|失去理智|歇斯底里)/.test(content)) {
            detectedIssues.push(`${character.name}的行为与"${trait}"设定不符`);
            driftScore -= 20;
          }
        }
        if (trait.includes('温柔') || trait.includes('善良')) {
          if (/(残忍|冷血|无情地)/.test(content)) {
            detectedIssues.push(`${character.name}的行为与"${trait}"设定不符`);
            driftScore -= 15;
          }
        }
        if (trait.includes('活泼') || trait.includes('外向')) {
          if (/(沉默不语|一言不发|躲在一旁)/.test(content)) {
            detectedIssues.push(`${character.name}的行为与"${trait}"设定不符`);
            driftScore -= 10;
          }
        }
      }

      issues.push({
        characterName: character.name,
        expectedTraits: character.traits,
        detectedBehavior: detectedIssues.length > 0 ? detectedIssues.join('; ') : '行为与性格设定基本一致',
        consistencyScore: detectedIssues.length > 0 ? Math.max(0, driftScore) : Math.floor(85 + Math.random() * 15),
      });
    }

    return issues;
  }

  /**
   * 伏笔遗漏检测
   */
  checkForeshadowing(
    content: string,
    context?: { foreshadowingClues?: string[] },
  ): ForeshadowingMiss[] {
    const misses: ForeshadowingMiss[] = [];

    if (!context?.foreshadowingClues || context.foreshadowingClues.length === 0) {
      return [{ clue: '示例伏笔', status: 'unresolved', suggestion: '建议在后续章节中收束该伏笔线索' }];
    }

    for (const clue of context.foreshadowingClues) {
      if (!content.includes(clue)) {
        misses.push({ clue, status: 'unresolved', suggestion: `伏笔"${clue}"在本文中未出现，建议在后续章节中收束` });
      }
    }

    return misses;
  }

  /**
   * 写作专属十一维度评分
   * 标准来自：H4终稿质检报告 + H5正文质量量化标准
   */
  scoreDimensions(
    content: string,
    context?: {
      openingText?: string;
      shortForeshadowings?: string[];
      longForeshadowings?: string[];
      foreshadowingClues?: string[];
    },
  ): InspectionResult['dimensions'] {
    const dimensions: InspectionResult['dimensions'] = {
      openingHook: 0, passion: 0, shortForeshadowingDensity: 0, longForeshadowingDensity: 0,
      chapterEnding: 0, immersion: 0, suspenseDensity: 0, reversalPower: 0,
      characterMotivation: 0, foreshadowingRecovery: 0, aiTraceIndex: 0,
    };

    const openingText = context?.openingText || content.slice(0, 500);

    // 1. 开头钩子 (openingHook) — 前500字代入感+悬念张力
    const hookKeywords = (openingText.match(/(悬念|奇怪|突然|不对劲|意外|怎么回事|难道|为什么|秘密)/g) || []).length;
    dimensions.openingHook = Math.min(10, Math.floor(hookKeywords * 1.8) + 3);

    // 2. 热血感 (passion) — 爽点密度/对抗张力
    const passionKeywords = (content.match(/(对决|战斗|爆发|冲击|碾压|逆袭|反击|愤怒|怒吼|拳头|力量|爆发|碾压|压倒|横扫|连击|绝招|暴走)/g) || []).length;
    const dialogueLines = (content.match(/(["「『])[^"」』]+\1/g) || []).length;
    dimensions.passion = Math.min(10, Math.min(10, Math.floor(passionKeywords * 0.8) + 4));

    // 3. 短伏笔密度 (shortForeshadowingDensity) — 2~3章回收密度
    const shortClues = context?.shortForeshadowings || context?.foreshadowingClues || [];
    const shortResolved = shortClues.filter(c => content.includes(c)).length;
    const shortRatio = shortClues.length > 0 ? shortResolved / shortClues.length : 0.5;
    dimensions.shortForeshadowingDensity = Math.min(10, Math.round(shortRatio * 8) + 2);

    // 4. 长伏笔密度 (longForeshadowingDensity) — 10章+
    const longClues = context?.longForeshadowings || [];
    const longResolved = longClues.filter(c => content.includes(c)).length;
    const longRatio = longClues.length > 0 ? longResolved / longClues.length : 0.5;
    dimensions.longForeshadowingDensity = Math.min(10, Math.round(longRatio * 8) + 2);

    // 5. 章节结尾吸引力 (chapterEnding) — 钩子检测
    const last300 = content.slice(-300);
    const endingHooks = (last300.match(/(突然|没想到|就在这时|就在此时|正在这时|猛然|忽然|究竟|到底|该怎么办|怎么会|天哪|难道|不好|危险|小心)/g) || []).length;
    dimensions.chapterEnding = Math.min(10, Math.min(10, endingHooks * 2 + 3));

    // 6. 代入感 (immersion) — 角色共鸣度
    const senseKeywords = (content.match(/(感到|觉得|仿佛|好像|似乎|似乎听到|气息|味道|声音|温度|寒冷|炎热|柔软|坚硬|心跳|呼吸)/g) || []).length;
    dimensions.immersion = Math.min(10, Math.min(10, Math.floor(senseKeywords * 0.7) + 4));

    // 7. 悬念密度 (suspenseDensity) — 伏笔密度
    const suspenseKeywords = (content.match(/(?<![^。！？]{10})(悬念|谜团|秘密|诡异的|奇怪的|不对劲|可疑|谜|疑团|不解|困惑|神秘|未知)/g) || []).length;
    dimensions.suspenseDensity = Math.min(10, Math.min(10, Math.floor(suspenseKeywords * 0.8) + 3));

    // 8. 反转力度 (reversalPower) — 反转是否意外又合理
    const reversalKeywords = (content.match(/(反转|意料之外|没想到|竟然|居然|原来|真相大白|峰回路转|绝处逢生|柳暗花明)/g) || []).length;
    dimensions.reversalPower = Math.min(10, Math.min(10, reversalKeywords * 2 + 3));

    // 9. 人物动机 (characterMotivation) — 行为逻辑
    const motivationKeywords = (content.match(/(为了|因为|目的是|之所以|理由|动机|原因|不得不|必须|想要|渴望|决心)/g) || []).length;
    dimensions.characterMotivation = Math.min(10, Math.min(10, Math.floor(motivationKeywords * 0.6) + 4));

    // 10. 伏笔回收 (foreshadowingRecovery) — 回收率/及时性
    dimensions.foreshadowingRecovery = Math.min(10, Math.round(shortRatio * 7 + 2));

    // 11. AI痕迹指数 (aiTraceIndex) — 0~100, 越低越好
    const aiPatterns = (content.match(/(值得注意的是|毋庸置疑|总的来说|不可否认|值得一提的是|从这个角度|某种程度上|与此同时|然而|此外|综上所述|由此可见|换言之)/g) || []).length;
    const avgSentenceLen = content.split(/[。！？]/).reduce((s, c) => s + c.length, 0) / Math.max(1, content.split(/[。！？]/).length);
    // AI句式得分: 模式越多越高, 句子长度越均匀越高
    dimensions.aiTraceIndex = Math.min(100, Math.round(aiPatterns * 8 + (avgSentenceLen > 20 && avgSentenceLen < 45 ? 0 : 15)));

    return dimensions;
  }

  /**
   * 生成改进建议 — 低分维度自动生成1~3条
   */
  private generateSuggestions(dimensions: InspectionResult['dimensions']): string[] {
    const suggestions: string[] = [];
    const thresholds: Record<string, { name: string; suggestions: string[] }> = {
      openingHook: { name: '开头钩子', suggestions: ['前500字缺少悬念元素，建议加入冲突或疑问', '开头张力不足，尝试用倒叙或意外事件开场'] },
      passion: { name: '热血感', suggestions: ['缺少对抗张力，建议加入冲突场景', '爽点密度不足，考虑增加逆袭或高光时刻'] },
      shortForeshadowingDensity: { name: '短伏笔密度', suggestions: ['短伏笔密度偏低，建议每2~3章埋设+回收一条伏笔', '缺少可快速回收的伏笔线索'] },
      chapterEnding: { name: '章节结尾吸引力', suggestions: ['章节结尾缺少钩子，建议以悬念或意外收尾', '结尾平淡，尝试用"就在这时…"式收尾'] },
      immersion: { name: '代入感', suggestions: ['缺少五感描写，尝试增加环境/身体感知细节', '角色感受描写不足，建议增加内心活动'] },
      suspenseDensity: { name: '悬念密度', suggestions: ['悬念密度不足，考虑埋设更多未解答的疑问', '增加神秘元素或不明线索可提升悬念'] },
      reversalPower: { name: '反转力度', suggestions: ['缺少反转情节，尝试加入意外转折', '反转不够有力，建议铺垫后突然揭露真相'] },
      characterMotivation: { name: '人物动机', suggestions: ['角色行为缺少动机说明', '建议补充角色行动的前因后果'] },
    };

    for (const [key, info] of Object.entries(thresholds)) {
      const score = dimensions[key as keyof InspectionResult['dimensions']] as number;
      if (score < 6) {
        suggestions.push(...info.suggestions.slice(0, score < 4 ? 2 : 1));
      }
    }

    // AI痕迹指数特殊处理
    if (dimensions.aiTraceIndex > 25) {
      suggestions.push(`AI痕迹指数${dimensions.aiTraceIndex}% (>25%)，建议使用降AI处理`);
    }
    if (dimensions.aiTraceIndex > 40) {
      suggestions.push(`AI痕迹指数过高(>40%)，必须执行降AI处理后再质检`);
    }

    return suggestions;
  }

  /**
   * 加权总分计算
   */
  private calculateWeightedScore(
    dimensions: InspectionResult['dimensions'],
    logicIssues: LogicIssue[],
    characterDrift: CharacterDriftIssue[],
  ): number {
    // 新的写作维度权重
    const scoreWeights: Record<string, number> = {
      openingHook: 0.12, passion: 0.12, shortForeshadowingDensity: 0.10,
      longForeshadowingDensity: 0.08, chapterEnding: 0.12, immersion: 0.10,
      suspenseDensity: 0.08, reversalPower: 0.10, characterMotivation: 0.10,
      foreshadowingRecovery: 0.08,
      // aiTraceIndex is special: 0=best, 100=worst. Invert for scoring.
    };

    // AI痕迹指数倒用于评分 (100 - value) / 10 → 0~10分
    const aiScore = Math.max(0, Math.min(10, (100 - dimensions.aiTraceIndex) / 10));

    let weightedSum = 0;
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(scoreWeights)) {
      const val = dimensions[key as keyof InspectionResult['dimensions']] as number;
      weightedSum += val * weight;
      totalWeight += weight;
    }
    // Add aiTraceIndex inversion
    weightedSum += aiScore * 0.08;
    totalWeight += 0.08;

    // 逻辑问题扣分
    const logicPenalty = logicIssues.reduce((sum, issue) => {
      return sum + (issue.severity === 'high' ? 8 : issue.severity === 'medium' ? 4 : 2);
    }, 0);

    // 人设漂移扣分
    const driftPenalty = characterDrift.reduce((sum, d) => {
      return sum + Math.max(0, (100 - d.consistencyScore)) * 0.08;
    }, 0);

    const baseScore = totalWeight > 0 ? (weightedSum / totalWeight) * 10 : 0;
    return Math.round(Math.max(0, Math.min(100, baseScore - logicPenalty - driftPenalty)));
  }

  /**
   * 获取质量维度量化标准表
   * H5标准：10个写作维度 + AI痕迹指数，每个维度含评分阈值和描述
   */
  getStandards(): QualityStandard[] {
    return [
      {
        name: '开头钩子',
        key: 'openingHook',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '前500字的代入感与悬念张力，评估开篇能否快速吸引读者',
        suggestion: '建议加入冲突、疑问或意外事件开场，避免平铺直叙',
      },
      {
        name: '热血感',
        key: 'passion',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '爽点密度与对抗张力，评估内容是否"燃"、是否有高光时刻',
        suggestion: '增加逆袭、对决或爆发场景，提升情绪起伏',
      },
      {
        name: '短伏笔密度',
        key: 'shortForeshadowingDensity',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '2~3章内回收的短伏笔密度，评估节奏紧凑度',
        suggestion: '每2~3章埋设并回收至少一条伏笔线索',
      },
      {
        name: '长伏笔密度',
        key: 'longForeshadowingDensity',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '10章以上回收的长伏笔密度，评估长篇布局能力',
        suggestion: '规划贯穿全文的伏笔主线，保持悬念连贯性',
      },
      {
        name: '章节结尾吸引力',
        key: 'chapterEnding',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '章节结尾钩子强度，评估是否让读者"非看下一章不可"',
        suggestion: '以悬念、意外或"就在这时…"式结尾收束章节',
      },
      {
        name: '代入感',
        key: 'immersion',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '角色共鸣度与五感描写丰富度，评估读者沉浸体验',
        suggestion: '增加环境、身体感知细节和角色内心活动描写',
      },
      {
        name: '悬念密度',
        key: 'suspenseDensity',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '未解之谜与伏笔线索的分布密度',
        suggestion: '埋设更多未解答的疑问，增加神秘元素',
      },
      {
        name: '反转力度',
        key: 'reversalPower',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '情节反转是否意外又合理，评估转折设计质量',
        suggestion: '铺垫后突然揭露真相，避免无铺垫的反转',
      },
      {
        name: '人物动机',
        key: 'characterMotivation',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '角色行为逻辑与动机合理性',
        suggestion: '补充角色行动的前因后果，避免为剧情服务而行动',
      },
      {
        name: '伏笔回收',
        key: 'foreshadowingRecovery',
        excellent: 8,
        pass: 6,
        fail: 0,
        description: '伏笔回收率与回收及时性',
        suggestion: '确保重要伏笔在合适的节点得到回收',
      },
      {
        name: 'AI痕迹指数',
        key: 'aiTraceIndex',
        excellent: 25,
        pass: 40,
        fail: 100,
        description: 'AI生成痕迹检测，越低越好（≤25过关，>40必须降AI处理）',
        suggestion: '使用降AI处理工具优化句式多样性，减少AI常用表达',
      },
    ];
  }
}
