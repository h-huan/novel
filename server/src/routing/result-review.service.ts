/**
 * 结果复核系统
 *
 * AI 生成内容自动评审，支持 5 个评分维度：
 * - 逻辑性：剧情逻辑是否自洽
 * - 人设一致性：角色行为是否符合设定
 * - 场景连贯性：前后内容是否衔接
 * - 爽点密度：爽点/高潮分布是否合理
 * - 伏笔密度：伏笔设置是否充足
 *
 * 评分结果：
 * - >70 分：通过
 * - 40-70 分：需修改（附带修改建议）
 * - <40 分：重生成
 */
import { Injectable, Logger } from '@nestjs/common';

// ==================== 类型定义 ====================

/** 评分维度 */
export type ReviewDimension =
  | 'logic'           // 逻辑性
  | 'character_consistency'  // 人设一致性
  | 'scene_coherence'        // 场景连贯性
  | 'highlight_density'      // 爽点密度
  | 'foreshadow_density';    // 伏笔密度

/** 维度权重 */
export const DIMENSION_WEIGHTS: Record<ReviewDimension, number> = {
  logic: 0.25,
  character_consistency: 0.25,
  scene_coherence: 0.20,
  highlight_density: 0.15,
  foreshadow_density: 0.15,
};

/** 维度评分详情 */
export interface DimensionScore {
  dimension: ReviewDimension;
  dimensionLabel: string;
  score: number;           // 0-100
  weight: number;
  weightedScore: number;
  issues: string[];
  suggestions: string[];
}

/** 修改建议 */
export interface ModificationSuggestion {
  id: string;
  type: 'logic_fix' | 'character_fix' | 'coherence_fix' | 'density_adjust' | 'style_improve';
  dimension: ReviewDimension;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestion: string;
  location?: string;       // 建议修改的位置
}

/** 复核结果 */
export interface ReviewResult {
  /** 综合评分 0-100 */
  overallScore: number;

  /** 各维度评分 */
  dimensions: DimensionScore[];

  /** 判定结果 */
  verdict: 'pass' | 'needs_revision' | 'regenerate';

  /** 修改建议列表 */
  suggestions: ModificationSuggestion[];

  /** 总结 */
  summary: string;

  /** 复核时间 */
  reviewedAt: Date;
}

/** 复核配置 */
export interface ReviewConfig {
  passThreshold: number;         // 通过阈值，默认70
  revisionThreshold: number;     // 需修改阈值，默认40
  enableLLMReview: boolean;      // 是否启用 LLM 评审
  reviewerModel: string;         // 评审模型
}

@Injectable()
export class ResultReviewService {
  private readonly logger = new Logger(ResultReviewService.name);

  /** 维度中文标签 */
  private readonly dimensionLabels: Record<ReviewDimension, string> = {
    logic: '逻辑性',
    character_consistency: '人设一致性',
    scene_coherence: '场景连贯性',
    highlight_density: '爽点密度',
    foreshadow_density: '伏笔密度',
  };

  /** 默认复核配置 */
  private readonly defaultConfig: ReviewConfig = {
    passThreshold: 70,
    revisionThreshold: 40,
    enableLLMReview: false,
    reviewerModel: 'claude',
  };

  constructor() {}

  // ==================== 核心复核方法 ====================

  /**
   * 对 AI 生成内容进行自动评审
   *
   * @param content 生成的内容
   * @param context 评审上下文（大纲/人设等）
   * @param config 复核配置
   */
  async review(
    content: string,
    context: {
      outline?: string;
      characters?: string;
      chapterFunction?: string;
      previousChapter?: string;
    },
    config?: Partial<ReviewConfig>,
  ): Promise<ReviewResult> {
    const cfg = { ...this.defaultConfig, ...config };

    this.logger.log(`开始内容复核，内容长度: ${content.length} 字符`);

    // 各维度评分
    const dimensions = this.evaluateAllDimensions(content, context);

    // 计算综合评分
    const overallScore = this.calculateOverallScore(dimensions);

    // 生成修改建议
    const suggestions = this.generateSuggestions(dimensions);

    // 判定结果
    const verdict = this.judgeVerdict(overallScore, dimensions, cfg);

    // 生成总结
    const summary = this.generateSummary(verdict, overallScore, dimensions);

    const result: ReviewResult = {
      overallScore,
      dimensions,
      verdict,
      suggestions,
      summary,
      reviewedAt: new Date(),
    };

    this.logger.log(`复核完成，评分: ${overallScore}，判定: ${verdict}`);
    return result;
  }

  // ==================== 维度评估 ====================

  /**
   * 评估所有维度
   */
  private evaluateAllDimensions(
    content: string,
    context: { outline?: string; characters?: string; chapterFunction?: string; previousChapter?: string },
  ): DimensionScore[] {
    const dimensions: ReviewDimension[] = [
      'logic',
      'character_consistency',
      'scene_coherence',
      'highlight_density',
      'foreshadow_density',
    ];

    return dimensions.map((dim) =>
      this.evaluateDimension(dim, content, context),
    );
  }

  /**
   * 评估单一维度
   * Mock 实现：基于内容特征计算模拟评分
   */
  private evaluateDimension(
    dimension: ReviewDimension,
    content: string,
    context: Record<string, unknown>,
  ): DimensionScore {
    const weight = DIMENSION_WEIGHTS[dimension];
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Mock 评分逻辑：根据内容长度和关键词生成模拟评分
    let score = this.mockScore(dimension, content, context, issues, suggestions);

    // 约束到 0-100
    score = Math.max(0, Math.min(100, score));

    const weightedScore = Math.round(score * weight * 100) / 100;

    return {
      dimension,
      dimensionLabel: this.dimensionLabels[dimension],
      score,
      weight,
      weightedScore,
      issues,
      suggestions,
    };
  }

  /**
   * Mock 评分实现
   */
  private mockScore(
    dimension: ReviewDimension,
    content: string,
    context: Record<string, unknown>,
    issues: string[],
    suggestions: string[],
  ): number {
    const wordCount = content.length;

    switch (dimension) {
      case 'logic': {
        let score = 75;
        if (wordCount < 200) {
          issues.push('内容较短，逻辑链条可能不完整');
          suggestions.push('建议展开逻辑推理过程');
          score -= 15;
        }
        if (this.hasContradictionKeywords(content)) {
          issues.push('检测到可能存在逻辑矛盾的关键词');
          suggestions.push('检查"但是""然而"等转折是否合理');
          score -= 20;
        }
        return score;
      }

      case 'character_consistency': {
        let score = 78;
        if (!context.characters) {
          issues.push('未提供人设参考，无法一致性检测');
          suggestions.push('建议提供角色人设表以进行精确检测');
          score -= 10;
        }
        if (wordCount < 500) {
          issues.push('字数较少，人设展现可能不充分');
          suggestions.push('增加角色行为描写以验证人设一致性');
          score -= 5;
        }
        return score;
      }

      case 'scene_coherence': {
        let score = 80;
        if (!context.previousChapter) {
          issues.push('未提供前章内容，无法检测前后连贯性');
          suggestions.push('提供前章结尾以进行精确连贯性检测');
          score -= 10;
        }
        // 检测是否有明显的段落断裂
        const breaks = (content.match(/\n\n/g) || []).length;
        if (breaks > 5 && wordCount < 2000) {
          issues.push('段落断裂较多，场景切换可能生硬');
          suggestions.push('使用过渡句平滑场景切换');
          score -= 15;
        }
        return score;
      }

      case 'highlight_density': {
        let score = 72;
        // 检测爽点关键词密度
        const highlightKeywords = ['突然', '竟', '原来', '不可能', '震惊', '怒'];
        const keywordCount = highlightKeywords.reduce(
          (sum, kw) => sum + (content.split(kw).length - 1),
          0,
        );
        const density = keywordCount / Math.max(1, wordCount / 100);

        if (density < 0.5) {
          issues.push('爽点密度偏低，缺少情绪爆发点');
          suggestions.push('考虑加入意外转折或高能场面');
          score -= 15;
        } else if (density > 3) {
          issues.push('爽点密度过高，可能造成阅读疲劳');
          suggestions.push('适当降低爽点密度，留白给读者');
          score -= 10;
        }

        // 章节功能调整
        const chapterFunction = context.chapterFunction as string;
        if (chapterFunction === 'climax' && density < 1) {
          issues.push('爆发章节爽点密度不足');
          suggestions.push('爆发章节应设置密集的高能场面');
          score -= 20;
        }
        if (chapterFunction === 'transition' && density > 2) {
          issues.push('过渡章节爽点过多，可能冲淡主线的爆发力');
          suggestions.push('过渡章节以铺垫为主');
          score -= 10;
        }

        return score;
      }

      case 'foreshadow_density': {
        let score = 70;
        const foreshadowKeywords = ['似乎', '隐约', '好像', '不对劲', '异样', '奇怪'];
        const keywordCount = foreshadowKeywords.reduce(
          (sum, kw) => sum + (content.split(kw).length - 1),
          0,
        );

        if (keywordCount < 2) {
          issues.push('伏笔设置偏少，后续反转缺乏支撑');
          suggestions.push('增加暗示性描写为后续反转做铺垫');
          score -= 20;
        }

        // 检查是否有明确的伏笔描述
        if (wordCount > 1000 && keywordCount < 3) {
          issues.push('篇幅较长但伏笔稀疏');
          suggestions.push('在中段和后段增加伏笔埋设');
          score -= 10;
        }

        return score;
      }

      default:
        return 70;
    }
  }

  // ==================== 评分计算 ====================

  /**
   * 计算综合评分
   */
  private calculateOverallScore(dimensions: DimensionScore[]): number {
    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    const weightedSum = dimensions.reduce((sum, d) => sum + d.weightedScore, 0);

    if (totalWeight === 0) return 0;

    return Math.round(weightedSum / totalWeight * 100) / 100;
  }

  // ==================== 判定逻辑 ====================

  /**
   * 判定复核结果
   */
  private judgeVerdict(
    overallScore: number,
    dimensions: DimensionScore[],
    config: ReviewConfig,
  ): 'pass' | 'needs_revision' | 'regenerate' {
    if (overallScore >= config.passThreshold) {
      return 'pass';
    }

    if (overallScore >= config.revisionThreshold) {
      // 检查是否有 critical 级别的严重问题
      const hasCriticalIssues = dimensions.some(
        (d) => d.score < 30 && d.issues.length > 2,
      );
      return hasCriticalIssues ? 'regenerate' : 'needs_revision';
    }

    return 'regenerate';
  }

  // ==================== 修改建议 ====================

  /**
   * 基于维度评分生成修改建议
   */
  private generateSuggestions(dimensions: DimensionScore[]): ModificationSuggestion[] {
    const suggestions: ModificationSuggestion[] = [];

    for (const dim of dimensions) {
      if (dim.score < 60) {
        for (let i = 0; i < Math.min(dim.issues.length, 3); i++) {
          suggestions.push({
            id: `sug_${dim.dimension}_${i}`,
            type: this.mapDimensionToSuggestionType(dim.dimension),
            dimension: dim.dimension,
            severity: dim.score < 40 ? 'critical' : dim.score < 60 ? 'major' : 'minor',
            description: dim.issues[i],
            suggestion: dim.suggestions[i] || '请参考评分标准修改',
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * 映射维度到建议类型
   */
  private mapDimensionToSuggestionType(
    dimension: ReviewDimension,
  ): ModificationSuggestion['type'] {
    const map: Record<ReviewDimension, ModificationSuggestion['type']> = {
      logic: 'logic_fix',
      character_consistency: 'character_fix',
      scene_coherence: 'coherence_fix',
      highlight_density: 'density_adjust',
      foreshadow_density: 'density_adjust',
    };
    return map[dimension];
  }

  // ==================== 总结 ====================

  /**
   * 生成复核总结
   */
  private generateSummary(
    verdict: ReviewResult['verdict'],
    overallScore: number,
    dimensions: DimensionScore[],
  ): string {
    const lowestDim = [...dimensions].sort((a, b) => a.score - b.score)[0];

    const verdictMap: Record<ReviewResult['verdict'], string> = {
      pass: '内容质量达标，可直接使用或轻微修改后发布',
      needs_revision: `内容质量一般（${overallScore}分），建议针对性修改后使用`,
      regenerate: `内容质量不达标（${overallScore}分），建议重新生成`,
    };

    const dimParts = dimensions
      .map((d) => `${d.dimensionLabel}: ${d.score}分`)
      .join(' | ');

    return [
      `【综合评分】${overallScore}分 - ${verdictMap[verdict]}`,
      `【维度评分】${dimParts}`,
      lowestDim ? `【薄弱维度】${lowestDim.dimensionLabel}（${lowestDim.score}分）` : '',
      `【复核时间】${new Date().toLocaleString('zh-CN')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  // ==================== 辅助方法 ====================

  /**
   * 检测矛盾关键词
   */
  private hasContradictionKeywords(content: string): boolean {
    const contradictionPatterns = [
      /但[是却].*[反矛]/,
      /然而.*[矛盾冲突]/,
      /前后不一致/,
      /逻辑不通/,
    ];
    return contradictionPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * 批处理复核多个内容
   */
  async batchReview(
    items: Array<{
      content: string;
      context: {
        outline?: string;
        characters?: string;
        chapterFunction?: string;
        previousChapter?: string;
      };
    }>,
    config?: Partial<ReviewConfig>,
  ): Promise<ReviewResult[]> {
    return Promise.all(
      items.map((item) => this.review(item.content, item.context, config)),
    );
  }

  /**
   * 获取复核配置
   */
  getDefaultConfig(): ReviewConfig {
    return { ...this.defaultConfig };
  }
}
