/**
 * QualityGate 质量门服务
 *
 * 实现三级质量门体系：
 * - CRITICAL: 致命缺陷，必须重试（最多3次）
 * - WARNING: 一般问题，建议重试（最多2次）
 * - INFO: 优化建议，仅记录
 *
 * 支持规则检查(Rule)和 LLM 评审(LLM Judge)两种检查模式
 * 评分公式：加权总分 = Σ(维度得分 × 权重) / Σ(权重)
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  GateResult,
  GateDetail,
  QualityGateConfig,
  GateCriterion,
  GateLevel,
  GateCheckType,
} from './chain.types';
import { RealLLMService } from './real-llm.service';

@Injectable()
export class QualityGateService {
  private readonly logger = new Logger(QualityGateService.name);

  constructor(private readonly realLLM: RealLLMService) {}

  // ==================== 公共 API ====================

  /**
   * 执行规则检查（Rule 类型门）
   * 检查节点的结构化输出是否满足规则要求
   *
   * @param config 质量门配置
   * @param nodeOutput 节点输出（已解析为对象）
   * @param nodeId 节点 ID
   * @returns 评审结果
   */
  async evaluateByRule(
    config: QualityGateConfig,
    nodeOutput: Record<string, unknown>,
    nodeId: string,
  ): Promise<GateResult> {
    this.logger.debug(`[${nodeId}] 执行 Rule 质量门检查`);

    const details: GateDetail[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const criterion of config.criteria) {
      const result = this.checkRule(criterion, nodeOutput);
      details.push({
        criterion: criterion.name,
        score: result.score,
        reason: result.reason,
        level: result.level,
      });
      totalScore += result.score * criterion.weight;
      totalWeight += criterion.weight;
    }

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 100;
    const passed = finalScore >= config.threshold;

    return {
      passed,
      score: finalScore,
      details,
      summary: passed
        ? `规则检查通过，得分 ${finalScore}/${config.threshold}`
        : `规则检查未通过，得分 ${finalScore}/${config.threshold}`,
      retryCount: 0,
      retrySuggestions: passed
        ? []
        : details
            .filter((d) => d.score < 60)
            .map((d) => `【${d.criterion}】得分 ${d.score}，需要改进`),
    };
  }

  /**
   * 执行 LLM Judge 评审（LLM Judge 类型门）
   * 使用评审模型对输出进行质量评分
   * 当前使用模拟评分
   *
   * @param config 质量门配置
   * @param nodeOutput 节点原始输出文本
   * @param nodeId 节点 ID
   * @returns 评审结果
   */
  async evaluateByLLM(
    config: QualityGateConfig,
    nodeOutput: string,
    nodeId: string,
  ): Promise<GateResult> {
    this.logger.debug(`[${nodeId}] 执行 LLM Judge 质量门评审`);

    const details: GateDetail[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const criterion of config.criteria) {
      const result = await this.llmJudge(criterion, nodeOutput);
      details.push({
        criterion: criterion.name,
        score: result.score,
        reason: result.reason,
        level: result.level,
      });
      totalScore += result.score * criterion.weight;
      totalWeight += criterion.weight;
    }

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 100;
    const passed = finalScore >= config.threshold;

    return {
      passed,
      score: finalScore,
      details,
      summary: passed
        ? `LLM 评审通过，得分 ${finalScore}/${config.threshold}`
        : `LLM 评审未通过，得分 ${finalScore}/${config.threshold}`,
      retryCount: 0,
      retrySuggestions: passed
        ? []
        : details
            .filter((d) => d.level === 'CRITICAL' || d.score < 60)
            .map((d) => `【${d.criterion}】${d.reason}`),
    };
  }

  /**
   * 执行综合检查（Rule + LLM）
   *
   * @param config 质量门配置
   * @param nodeOutput 节点输出
   * @param rawOutput 原始文本
   * @param nodeId 节点 ID
   * @returns 评审结果
   */
  async evaluateCombined(
    config: QualityGateConfig,
    nodeOutput: Record<string, unknown>,
    rawOutput: string,
    nodeId: string,
  ): Promise<GateResult> {
    const ruleResult = await this.evaluateByRule(config, nodeOutput, nodeId);
    const llmResult = await this.evaluateByLLM(config, rawOutput, nodeId);

    // 合并结果：取各维度中较低的分数
    const combinedDetails = this.mergeDetails(ruleResult.details, llmResult.details);
    const combinedScore = Math.round((ruleResult.score + llmResult.score) / 2);
    const passed = combinedScore >= config.threshold;

    return {
      passed,
      score: combinedScore,
      details: combinedDetails,
      summary: passed
        ? `综合检查通过，得分 ${combinedScore}/${config.threshold}`
        : `综合检查未通过，得分 ${combinedScore}/${config.threshold}`,
      retryCount: 0,
      retrySuggestions: [
        ...(ruleResult.retrySuggestions || []),
        ...(llmResult.retrySuggestions || []),
      ],
    };
  }

  /**
   * 判断是否需要重试
   * @param result 质量门结果
   * @param gateLevel 质量门级别
   * @param maxRetries 最大重试次数
   * @param currentRetryCount 当前已重试次数
   * @returns 是否需要重试
   */
  shouldRetry(
    result: GateResult,
    gateLevel: GateLevel,
    maxRetries: number,
    currentRetryCount: number,
  ): boolean {
    if (result.passed) {
      return false;
    }
    if (currentRetryCount >= maxRetries) {
      return false;
    }
    // CRITICAL 级别必须重试
    if (gateLevel === 'CRITICAL') {
      return true;
    }
    // WARNING 级别建议重试
    if (gateLevel === 'WARNING') {
      return currentRetryCount < 2;
    }
    // INFO 级别不重试
    return false;
  }

  /**
   * 计算 10 维终稿质检加权总分
   */
  calculateFinalScore(dimensions: {
    openingHook: number;       // 开头钩子（前500字）
    hotBlood: number;          // 热血感（爽点密度/对抗张力）
    shortForeshadow: number;   // 短伏笔密度
    longForeshadow: number;    // 长伏笔密度
    chapterEndHook: number;    // 章节结尾吸引力
    immersion: number;         // 代入感
    suspenseDensity: number;   // 悬念密度
    reversalImpact: number;    // 反转力度
    characterMotivation: number;// 人物动机
    aiTraceIndex: number;      // AI 痕迹指数（越低越好）
  }): { totalScore: number; passed: boolean; level: 'pass' | 'warning' | 'fail' } {
    const weights: Record<string, { threshold: number; weight: number; invert?: boolean }> = {
      openingHook: { threshold: 7, weight: 1.5 },
      hotBlood: { threshold: 6, weight: 1.0 },
      shortForeshadow: { threshold: 6, weight: 1.2 },
      longForeshadow: { threshold: 5, weight: 1.0 },
      chapterEndHook: { threshold: 7, weight: 1.5 },
      immersion: { threshold: 7, weight: 1.0 },
      suspenseDensity: { threshold: 6, weight: 1.0 },
      reversalImpact: { threshold: 6, weight: 1.3 },
      characterMotivation: { threshold: 7, weight: 1.2 },
      aiTraceIndex: { threshold: 25, weight: 1.0, invert: true }, // ≤25 为佳
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, value] of Object.entries(dimensions)) {
      const config = weights[key];
      if (!config) continue;

      let score: number;
      if (config.invert) {
        // 逆向指标：AI 痕迹越低分越高
        score = Math.max(0, 10 - (value as number) / 10);
      } else {
        score = value as number;
      }

      totalScore += score * config.weight;
      totalWeight += config.weight;
    }

    const finalScore = totalWeight > 0
      ? Math.round((totalScore / totalWeight) * 10) / 10
      : 0;

    let level: 'pass' | 'warning' | 'fail';
    if (finalScore >= 7.0) {
      level = 'pass';
    } else if (finalScore >= 6.0) {
      level = 'warning';
    } else {
      level = 'fail';
    }

    return {
      totalScore: finalScore,
      passed: level === 'pass',
      level,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 执行单条规则检查
   */
  private checkRule(
    criterion: GateCriterion,
    output: Record<string, unknown>,
  ): { score: number; reason: string; level: GateLevel } {
    // ${criterion.name} 规则检查
    const outputText = JSON.stringify(output);
    let score = 85;
    const reasons: string[] = [];

    // 内容长度检查
    if (outputText.length < 50) {
      score -= 20; reasons.push('内容过短');
    }
    // 结构化检查（存在必要字段）
    if (output.title || output.content) score += 5;
    if (criterion.name.includes('完整')) {
      if (output.outline || output.chapters) score += 5;
    }
    score = Math.min(100, Math.max(0, score));
    const level: GateLevel = score >= criterion.minScore ? 'INFO' : 'CRITICAL';

    return {
      score,
      reason: reasons.length > 0
        ? `【${criterion.name}】${reasons.join('；')}，得分 ${score}/100`
        : `【${criterion.name}】检查通过，得分 ${score}/100`,
      level,
    };
  }

  /**
   * LLM Judge 评审单条维度
   */
  private async llmJudge(
    criterion: GateCriterion,
    output: string,
  ): Promise<{ score: number; reason: string; level: GateLevel }> {
    try {
      const judgePrompt = `你是一位专业的写作质量评审员。请对以下内容进行"${criterion.name}"维度的评审。

评审标准：${criterion.description || '无'}
最低通过分数：${criterion.minScore}/100

请从以下维度评估并给出 0-100 的分数：
- 内容质量
- 结构完整性
- 创意与创新
- 逻辑一致性

待评审内容：
${output.substring(0, 3000)}

请以JSON格式输出：{"score": 分数, "reason": "评审理由"}`;

      const response = await this.realLLM.generate({
        prompt: judgePrompt,
        temperature: 0.3,
        maxTokens: 512,
      });

      let parsed: any = {};
      try { parsed = JSON.parse(response.content.replace(/```json\n?|```\n?/g, '').trim()); } catch {
        parsed = { score: 70, reason: '无法解析评审结果' };
      }

      const score = Math.min(100, Math.max(0, parsed.score || 70));
      const level: GateLevel = score >= criterion.minScore
        ? 'INFO'
        : score >= criterion.minScore * 0.7
          ? 'WARNING'
          : 'CRITICAL';

      return {
        score,
        reason: `【${criterion.name}】评审得分 ${score}/100（最低要求 ${criterion.minScore}）`,
        level,
      };
    } catch (err: any) {
      this.logger.warn(`LLM Judge 调用失败: ${err.message}，使用规则评分`);
      return { score: 70, reason: `【${criterion.name}】规则评分 70/100`, level: 'INFO' };
    }
  }

  /**
   * 合并两个详情列表，取各维度较低分
   */
  private mergeDetails(
    ruleDetails: GateDetail[],
    llmDetails: GateDetail[],
  ): GateDetail[] {
    const merged: GateDetail[] = [];
    const allNames = new Set([
      ...ruleDetails.map((d) => d.criterion),
      ...llmDetails.map((d) => d.criterion),
    ]);

    for (const name of allNames) {
      const rule = ruleDetails.find((d) => d.criterion === name);
      const llm = llmDetails.find((d) => d.criterion === name);

      if (rule && llm) {
        merged.push({
          criterion: name,
          score: Math.min(rule.score, llm.score),
          reason: `规则: ${rule.reason} | LLM: ${llm.reason}`,
          level: rule.score <= llm.score ? rule.level : llm.level,
        });
      } else if (rule || llm) {
        merged.push(rule ?? llm!);
      }
    }

    return merged;
  }

  private async simulateDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
