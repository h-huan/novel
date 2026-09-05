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
    const aiFingerprints = this.detectAiFingerprints(content);
    const overallScore = null;
    const suggestions = ['语义质量尚未评估；需结合项目创作宪法、已确认人物、时间线及伏笔回收计划进行评审。'];
    const dimensionEvidence = Object.fromEntries(DIMENSION_KEYS.map(key => [key, {
      status: key === 'aiTraceIndex' && dimensions[key] !== null ? 'heuristic' as const : 'not_evaluated' as const,
      reason: key === 'aiTraceIndex' && dimensions[key] !== null
        ? '确定性文体统计，仅为风险信号，不代表 AI 生成概率或语义质量'
        : '证据不足：尚未完成结合上下文的语义评审，不用关键词频次代替质量评分',
    }]));
    return {
      overallScore,
      evaluation: { status: dimensions.aiTraceIndex === null ? 'not_evaluated' : 'partial', reason: '缺少可验证的语义评审证据，综合分未评估' },
      dimensionEvidence,
      dimensions,
      suggestions,
      logicIssues,
      characterDrift,
      foreshadowingMisses,
      aiFingerprints,
    };
  }

  /**
   * 逻辑检测：时间线/因果关系/空间一致性
   */
  checkLogic(content: string, context?: { timeline?: string }): LogicIssue[] {
    // Temporal transitions and entering/leaving a room are not contradictions.
    // Semantic attribution requires an evaluator; absence of findings is not a pass.
    return [];
  }

  /**
   * 人设漂移检测
   */
  checkCharacterDrift(
    content: string,
    context?: { characters?: { name: string; traits: string[] }[] },
  ): CharacterDriftIssue[] {
    // A trait keyword anywhere in a chapter cannot be attributed to a character.
    return [];
  }

  /**
   * 伏笔遗漏检测
   */
  checkForeshadowing(
    content: string,
    context?: { foreshadowingClues?: string[] },
  ): ForeshadowingMiss[] {
    // Literal absence does not establish a missed payoff or its deadline.
    return [];
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
    const dimensions = Object.fromEntries(DIMENSION_KEYS.map(key => [key, null])) as InspectionResult['dimensions'];
    if (content.trim().length >= 200) dimensions.aiTraceIndex = this.detectAiFingerprints(content).overallScore;
    return dimensions;
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
        suggestion: '以本章行动造成的新问题或未完成选择收束章节，避免模板化转折句',
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

  /**
   * detectAiFingerprints — 确定性AI物理指纹检测（毫秒级，无需LLM）
   * 检测7项AI生成文的典型物理特征，返回各维度得分（0-10，越低越好）和详细数据
   */
  detectAiFingerprints(content: string): {
    overallScore: number | null;
    parallelism: { score: number; count: number; examples: string[] };
    adjectiveDensity: { score: number; density: number; overLimitSentences: number };
    paragraphUniformity: { score: number; uniformGroups: number; avgVariance: number };
    aiWordDensity: { score: number; count: number; perThousand: number };
    sentenceLengthUniformity: { score: number; variance: number; cv: number };
    dialogueRatio: { score: number; ratio: number };
    punctuationDiversity: { score: number; uniqueTypes: number; ratio: number };
    clicheExpression: { score: number; count: number; perThousand: number; examples: string[] };
  } {
    if (!content || content.trim().length < 200) {
      return {
        overallScore: null,
        parallelism: { score: 0, count: 0, examples: [] },
        adjectiveDensity: { score: 0, density: 0, overLimitSentences: 0 },
        paragraphUniformity: { score: 0, uniformGroups: 0, avgVariance: 0 },
        aiWordDensity: { score: 0, count: 0, perThousand: 0 },
        sentenceLengthUniformity: { score: 0, variance: 0, cv: 0 },
        dialogueRatio: { score: 0, ratio: 0 },
        punctuationDiversity: { score: 0, uniqueTypes: 0, ratio: 0 },
        clicheExpression: { score: 0, count: 0, perThousand: 0, examples: [] },
      };
    }

    // 1. 排比句检测：连续同构短句（"他想到了A，想到了B，想到了C"模式）
    const parallelismPattern = /([^，。！？；：、""''\n]{2,8})[，,、]([^，。！？；：、""''\n]{2,8})[，,、]([^，。！？；：、""''\n]{2,8})(?=[，,、。！？；])/g;
    const parallelismMatches = content.match(parallelismPattern) || [];
    // 额外检测：连续3个以上"的"字短语排比
    const dePattern = /([^，。！？、\n]{2,6}的[^，。！？、\n]{1,4})[，,、]([^，。！？、\n]{2,6}的[^，。！？、\n]{1,4})[，,、]([^，。！？、\n]{2,6}的[^，。！？、\n]{1,4})/g;
    const deMatches = content.match(dePattern) || [];
    const totalParallelism = parallelismMatches.length + deMatches.length;
    const parallelismScore = Math.min(10, totalParallelism * 2);
    const parallelismExamples = [...parallelismMatches, ...deMatches].slice(0, 3);

    // 2. 形容词密度检测：一句话中"的"字出现次数（粗略代理形容词密度）
    const sentences = content.split(/[。！？；\n]/).filter(s => s.trim().length > 5);
    let overLimitSentences = 0;
    let totalDeCount = 0;
    for (const s of sentences) {
      const deCount = (s.match(/的/g) || []).length;
      totalDeCount += deCount;
      if (deCount > 3) overLimitSentences++; // 一句话超过3个"的"视为形容词堆砌（原阈值4，收紧到3）
    }
    const avgDePerSentence = sentences.length > 0 ? totalDeCount / sentences.length : 0;
    // 无信息量形容词堆砌检测（美丽/帅气/深邃/冰冷/孤独/无尽/璀璨等）
    const emptyAdjectives = ['美丽的', '帅气的', '漂亮的', '英俊的', '深邃的', '冰冷的', '孤独的', '无尽的', '璀璨的', '华丽的', '优雅的', '高贵的', '神秘的', '强大的', '微弱的', '沉重的', '轻盈的', '温暖的', '寒冷的', '炎热的', '潮湿的', '干燥的', '安静的', '喧闹的', '热闹的', '冷清的'];
    let emptyAdjCount = 0;
    for (const adj of emptyAdjectives) {
      emptyAdjCount += (content.match(new RegExp(adj, 'g')) || []).length;
    }
    const emptyAdjPerThousand = (emptyAdjCount / content.length) * 1000;
    const adjectiveDensityScore = Math.min(10, Math.floor(avgDePerSentence * 2) + overLimitSentences + Math.floor(emptyAdjPerThousand * 2));

    // 3. 段落均匀度检测：连续3段同等长度（±15%）
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    let uniformGroups = 0;
    const lengths = paragraphs.map(p => p.trim().length);
    for (let i = 0; i < lengths.length - 2; i++) {
      const avg = (lengths[i] + lengths[i + 1] + lengths[i + 2]) / 3;
      if (avg === 0) continue;
      const variance = Math.max(
        Math.abs(lengths[i] - avg) / avg,
        Math.abs(lengths[i + 1] - avg) / avg,
        Math.abs(lengths[i + 2] - avg) / avg,
      );
      if (variance < 0.15) uniformGroups++;
    }
    const avgVariance = lengths.length > 2
      ? lengths.slice(0, -1).reduce((sum, _, i) => sum + Math.abs(lengths[i] - lengths[i + 1]) / Math.max(lengths[i], lengths[i + 1]), 0) / (lengths.length - 1)
      : 0;
    const paragraphUniformityScore = Math.min(10, uniformGroups * 3 + Math.floor((1 - avgVariance) * 3));

    // 4. AI高频词密度
    const aiWords = ['仿佛', '似乎', '好像', '犹如', '宛如', '不禁', '不由得', '情不自禁', '内心深处', '油然而生', '涌上心头', '感到', '觉得', '意识到', '这一刻', '终于明白', '总而言之', '综上所述', '不仅', '而且', '与此同时', '然而', '因此', '过电似的', '过电一样', '触电似的', '不像梦', '不是梦', '心跳漏了一拍', '喉咙发紧', '手心冒汗'];
    let aiWordCount = 0;
    for (const word of aiWords) {
      aiWordCount += (content.match(new RegExp(word, 'g')) || []).length;
    }
    const perThousand = (aiWordCount / content.length) * 1000;
    const aiWordDensityScore = Math.min(10, Math.floor(perThousand * 1.5));

    // 5. 句长均匀度：句子长度的变异系数（CV），越低越均匀（越像AI）
    const sentenceLengths = sentences.map(s => s.trim().length).filter(l => l > 3);
    const meanLen = sentenceLengths.length > 0 ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length : 0;
    const variance = sentenceLengths.length > 1
      ? sentenceLengths.reduce((sum, l) => sum + Math.pow(l - meanLen, 2), 0) / sentenceLengths.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const cv = meanLen > 0 ? stdDev / meanLen : 0;
    // CV越低越均匀（越像AI），所以分数 = (1 - CV) * 10，限制在0-10
    const sentenceLengthUniformityScore = Math.max(0, Math.min(10, Math.floor((1 - cv) * 10)));

    // 6. 对话占比：引号内内容占比
    const dialogueMatches = content.match(/"[^"]*"|「[^」]*」|“[^”]*”/g) || [];
    const dialogueLength = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
    const dialogueRatio = content.length > 0 ? dialogueLength / content.length : 0;
    // 对话占比<15%或>60%都扣分，20-50%最佳
    let dialogueRatioScore = 0;
    if (dialogueRatio < 0.15) dialogueRatioScore = Math.floor((0.15 - dialogueRatio) * 30);
    else if (dialogueRatio > 0.6) dialogueRatioScore = Math.floor((dialogueRatio - 0.6) * 20);
    dialogueRatioScore = Math.min(10, dialogueRatioScore);

    // 7. 标点多样性：使用的标点种类占比
    const allPunctuation = content.match(/[，。！？；：、""''《》（）—…·]/g) || [];
    const uniquePunct = new Set(allPunctuation).size;
    const punctRatio = allPunctuation.length > 0 ? uniquePunct / allPunctuation.length : 0;
    // 标点种类<4种扣分
    const punctuationDiversityScore = uniquePunct < 4 ? Math.min(10, (4 - uniquePunct) * 3) : 0;

    // 8. 套路化表达/刻意感官描写/拟人化比喻检测（新增）
    const clichePatterns = [
      // 刻意感官描写
      /(凉意|暖意|寒意|热气|冷气|风)[^。]{0,8}(贴着|顺着|沿着|爬上|漫上)[^。]{0,8}(皮肤|脊背|后背|身体|手臂|小腿|脖子|脸颊)[^。]{0,8}(往上|往下|向上|向下)?(爬|蔓延|窜|流)/g,
      /(炸开|绽放|绽开|迸开)[^。]{0,8}(一朵|一片|一团)?(光|光芒|光亮|白光|红光)/g,
      /过电似的|过电一样|触电似的|触电一样/g,
      /(心跳|心脏|心)[^。]{0,6}(漏了一拍|漏掉一拍|骤停|猛地一跳|咯噔一下)/g,
      /(喉咙|嗓子|喉头)[^。]{0,6}(发紧|一紧|哽住|哽咽)/g,
      /(手心|手掌|额头|后背|脊背)[^。]{0,6}(冒汗|出汗|渗汗|浸出冷汗)/g,
      // 拟人化比喻
      /(回音|回声|声音|声响)[^。]{0,6}(吞掉|吃掉|吞噬|吞没|淹没)/g,
      /(风|风声)[^。]{0,6}(绕了道|绕道|躲开|避开|绕开)/g,
      /(黑暗|夜色|夜)[^。]{0,6}(吞噬|吞没|包裹|笼罩|张开大嘴)/g,
      /(时间|时光|岁月)[^。]{0,6}(流逝|溜走|飞逝|匆匆|奔跑)/g,
      // 情绪外化
      /(空气|气氛|氛围)[^。]{0,6}(沉下去|压下来|凝固|凝重|变得沉重)/g,
      /(压在|压得|压着)[^。]{0,6}(肩膀|肩头|胸口|心头|心上|身上)/g,
      /没怎么用力[^。]{0,10}却让(我|他|她)[^。]{0,10}(不太容易|难以|无法|不能)/g,
      // 套路化表达
      /(记忆|回忆|画面)[^。]{0,6}(清晰得像|清晰如同|清楚得像|清楚如同)[^。]{0,10}(刚发生|昨天|眼前)/g,
      /不像梦|不是梦|不是做梦|不像做梦/g,
      /(那一刻|这一瞬间|就在这时)[^。]{0,10}(我|他|她)[^。]{0,10}(突然|忽然|猛地)[^。]{0,10}(明白|懂得|知道|意识到)/g,
      /(时间|世界|一切)[^。]{0,6}(仿佛|好像|似乎)[^。]{0,6}(静止|停止|凝固|定格)/g,
      /(眼中|眼里|眼眶)[^。]{0,6}(闪过|掠过|浮现|露出)[^。]{0,10}(一丝|一抹|一缕)?(复杂|异样|不明|难以言喻)/g,
    ];
    let clicheCount = 0;
    const clicheExamples: string[] = [];
    for (const pattern of clichePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        clicheCount += matches.length;
        if (clicheExamples.length < 5) {
          clicheExamples.push(...matches.slice(0, 5 - clicheExamples.length));
        }
      }
    }
    const clichePerThousand = (clicheCount / content.length) * 1000;
    const clicheExpressionScore = Math.min(10, Math.floor(clichePerThousand * 2));

    // 综合分：8项加权平均（0-100，越低越好）
    const overallScore = Math.round(
      (parallelismScore * 15 +
        adjectiveDensityScore * 15 +
        paragraphUniformityScore * 10 +
        aiWordDensityScore * 15 +
        sentenceLengthUniformityScore * 10 +
        dialogueRatioScore * 10 +
        punctuationDiversityScore * 10 +
        clicheExpressionScore * 15) / 10,
    );

    return {
      overallScore,
      parallelism: { score: parallelismScore, count: totalParallelism, examples: parallelismExamples },
      adjectiveDensity: { score: adjectiveDensityScore, density: avgDePerSentence, overLimitSentences },
      paragraphUniformity: { score: paragraphUniformityScore, uniformGroups, avgVariance },
      aiWordDensity: { score: aiWordDensityScore, count: aiWordCount, perThousand },
      sentenceLengthUniformity: { score: sentenceLengthUniformityScore, variance, cv },
      dialogueRatio: { score: dialogueRatioScore, ratio: dialogueRatio },
      punctuationDiversity: { score: punctuationDiversityScore, uniqueTypes: uniquePunct, ratio: punctRatio },
      clicheExpression: { score: clicheExpressionScore, count: clicheCount, perThousand: clichePerThousand, examples: clicheExamples },
    };
  }
}
