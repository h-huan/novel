/**
 * 上下文构建器 (Context Builder Service)
 *
 * 接收检索结果 → 按RTCO分级组织上下文 → Token预算管理
 *
 * 功能：
 * 1. 按 P0/P1/P2/P3 优先级编排上下文
 * 2. Token 预算管理（默认8000 tokens）
 * 3. 生成 LLM 可用的 system prompt + 上下文
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  RetrievalResult,
  ContextBuildOptions,
  ContextResult,
  RTCOTier,
} from './types';

/** Token预算方案 */
interface BudgetPlan {
  ratios: Record<RTCOTier, number>;
  tokens: Record<RTCOTier, number>;
  totalBudget: number;
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  /** 默认 Token 预算 */
  private readonly DEFAULT_BUDGET = 8000;

  /** 基础分配比例 */
  private readonly baseRatios: Record<RTCOTier, number> = {
    P0: 0.40,
    P1: 0.35,
    P2: 0.20,
    P3: 0.05,
  };

  /**
   * 构建上下文
   */
  buildContext(
    p0Content: RetrievalResult[],
    p1Content: RetrievalResult[],
    p2Content: RetrievalResult[],
    options: ContextBuildOptions = { stage: 'drafting' },
  ): ContextResult {
    const maxTokens = options.maxTokens || this.DEFAULT_BUDGET;
    const budget = this.allocateBudget(options.stage, {
      chapterComplexity: options.chapterComplexity || 0.5,
      activeCharacters: options.activeCharacters || 0,
      activeForeshadows: options.activeForeshadows || 0,
    }, maxTokens);

    // 组装各层内容
    const p0Assembled = this.assembleContent(p0Content, budget.tokens.P0);
    const p1Assembled = this.assembleContent(p1Content, budget.tokens.P1);

    // 生成 system prompt
    const systemPrompt = this.buildSystemPrompt(options);

    // 拼接上下文
    const sections: string[] = [];

    if (p0Assembled.length > 0) {
      sections.push(this.sectionHeader('本章大纲·必循', 'P0'));
      sections.push(this.renderItems(p0Assembled));
    }

    if (p1Assembled.length > 0) {
      sections.push('\n---');
      sections.push(this.sectionHeader('相关设定与历史·参考', 'P1'));
      sections.push(this.renderItems(p1Assembled));
    }

    const context = sections.join('\n');

    return {
      systemPrompt,
      context,
      p0Content: p0Assembled,
      p1Content: p1Assembled,
      p2Available: p2Content,
      tokenUsage: {
        p0: this.estimateTokens(p0Assembled.map(i => i.text).join('\n')),
        p1: this.estimateTokens(p1Assembled.map(i => i.text).join('\n')),
        total: this.estimateTokens(context),
        budget: maxTokens,
      },
    };
  }

  /**
   * Token预算分配算法
   *
   * 根据写作阶段和章节复杂度动态调整P0/P1/P2/P3的比例
   */
  private allocateBudget(
    stage: string,
    complexity: { chapterComplexity: number; activeCharacters: number; activeForeshadows: number },
    totalBudget: number,
  ): BudgetPlan {
    const ratios = { ...this.baseRatios };

    // 阶段调整因子
    switch (stage) {
      case 'outline':
        ratios.P0 += 0.05;
        ratios.P1 += 0.05;
        ratios.P2 -= 0.10;
        break;
      case 'drafting':
        ratios.P0 += 0.10;
        ratios.P2 -= 0.10;
        break;
      case 'revision':
        ratios.P1 += 0.10;
        ratios.P0 -= 0.05;
        ratios.P2 -= 0.05;
        break;
      case 'polish':
        ratios.P0 += 0.15;
        ratios.P1 -= 0.05;
        ratios.P2 -= 0.10;
        break;
    }

    // 复杂度调整
    if (complexity.chapterComplexity > 0.7) {
      ratios.P0 += 0.05;
      ratios.P1 += 0.05;
      ratios.P2 -= 0.10;
    }

    // 归一化
    const total = ratios.P0 + ratios.P1 + ratios.P2 + ratios.P3;
    const normalized = {
      P0: ratios.P0 / total,
      P1: ratios.P1 / total,
      P2: ratios.P2 / total,
      P3: ratios.P3 / total,
    };

    // 计算 Token 数
    const tokens: Record<RTCOTier, number> = {
      P0: Math.floor(totalBudget * normalized.P0),
      P1: Math.floor(totalBudget * normalized.P1),
      P2: Math.floor(totalBudget * normalized.P2),
      P3: Math.floor(totalBudget * normalized.P3),
    };

    return { ratios: normalized, tokens, totalBudget };
  }

  /**
   * 按优先级组装上下文内容
   * Token超限时跳过当前item
   */
  private assembleContent(items: RetrievalResult[], maxTokens: number): RetrievalResult[] {
    const assembled: RetrievalResult[] = [];
    let tokenCount = 0;

    for (const item of items) {
      const itemTokens = this.estimateTokens(item.text);
      if (tokenCount + itemTokens > maxTokens) {
        continue; // 跳过当前item
      }
      assembled.push(item);
      tokenCount += itemTokens;
    }

    return assembled;
  }

  /**
   * 构建 System Prompt
   */
  private buildSystemPrompt(options: ContextBuildOptions): string {
    const parts: string[] = [
      '你是一位专业的网络小说写作助手。',
      `当前写作阶段: ${this.getStageDescription(options.stage)}`,
      '',
      '请严格遵循以下规则：',
      '1. 优先遵循【本章大纲·必循】中的大纲规划',
      '2. 保持角色设定的一致性（性格、能力、人际关系）',
      '3. 遵守世界观规则，不引入违反设定的内容',
      '4. 如遇到需要回收的伏笔，请自然融入情节',
      '5. 注意与前文的衔接，保持情节连贯性',
    ];

    if (options.stage === 'drafting') {
      parts.push('6. 输出字数控制在3000-5000字之间');
      parts.push('7. 章节结尾设置悬念或钩子');
    }

    return parts.join('\n');
  }

  /**
   * 渲染检索结果列表
   */
  private renderItems(items: RetrievalResult[]): string {
    return items.map(item => {
      const typeLabel = this.getDocTypeLabel(item.docType);
      const charInfo = item.payload['characters']
        ? ` [角色: ${(item.payload['characters'] as string[]).join(', ')}]`
        : '';
      return `[${typeLabel}${charInfo}]\n${item.text}`;
    }).join('\n\n');
  }

  /**
   * 生成节标题
   */
  private sectionHeader(title: string, tier: string): string {
    const divider = '─'.repeat(30);
    return `${divider}\n【${tier}】${title}\n${divider}`;
  }

  /**
   * 获取阶段描述
   */
  private getStageDescription(stage: string): string {
    const map: Record<string, string> = {
      outline: '大纲规划',
      drafting: '正文写作',
      revision: '修改完善',
      polish: '润色定稿',
    };
    return map[stage] || stage;
  }

  /**
   * 获取文档类型中文标签
   */
  private getDocTypeLabel(docType: string): string {
    const map: Record<string, string> = {
      chapter: '章节',
      world_setting: '世界观',
      character_profile: '角色',
      outline: '大纲',
      foreshadowing: '伏笔',
    };
    return map[docType] || docType;
  }

  /**
   * 估算文本Token数 (简化算法)
   */
  private estimateTokens(text: string): number {
    let tokens = 0;
    for (const char of text) {
      if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) {
        tokens += 1.5;
      } else if (/\s/.test(char)) {
        tokens += 0;
      } else {
        tokens += 0.7;
      }
    }
    return Math.ceil(tokens);
  }
}
