/**
 * 上下文注入器 (Context Injector Service)
 *
 * 将 RTCO 分级内容按优先级注入到 LLM 系统指令中
 * 参考设计文档 3.3 节
 */

import { Injectable, Logger } from '@nestjs/common';
import { RTCOService } from './rtco.service';
import type { BudgetPlan, ContextInjectItem, RTCOTier, WritingStage } from './rtco.service';

/** 注入结果 */
export interface InjectResult {
  systemPrompt: string;
  userContext: string;
  p0Section: string;
  p1Section: string;
  tokenStats: {
    systemPrompt: number;
    p0Used: number;
    p1Used: number;
    total: number;
    budget: number;
  };
}

@Injectable()
export class ContextInjectorService {
  private readonly logger = new Logger(ContextInjectorService.name);

  constructor(private readonly rtco: RTCOService) {}

  /**
   * 构建注入到 LLM 的完整上下文
   */
  buildInjection(
    budget: BudgetPlan,
    p0Items: ContextInjectItem[],
    p1Items: ContextInjectItem[],
    stage: WritingStage,
  ): InjectResult {
    // ═══ 构建 System Prompt ═══
    const systemPrompt = this.buildSystemPrompt(stage);

    // ═══ 构建 P0 段（放在最前面，模型注意力最高） ═══
    const p0Section = this.buildP0Section(p0Items, budget.tokens.P0);

    // ═══ 构建 P1 段 ═══
    const p1Section = this.buildP1Section(p1Items, budget.tokens.P1);

    // ═══ 组合用户上下文 ═══
    const sections: string[] = [];

    if (p0Section) {
      sections.push(this.sectionSeparator('本章大纲·必循', 'P0'));
      sections.push(p0Section);
    }

    if (p1Section) {
      sections.push('');
      sections.push(this.sectionSeparator('相关设定与历史·参考', 'P1'));
      sections.push(p1Section);
    }

    const userContext = sections.join('\n');

    // ═══ Token 统计 ═══
    const tokenStats = {
      systemPrompt: this.estimateTokens(systemPrompt),
      p0Used: this.estimateTokens(p0Section),
      p1Used: this.estimateTokens(p1Section),
      total: this.estimateTokens(systemPrompt + userContext),
      budget: budget.totalBudget,
    };

    return { systemPrompt, userContext, p0Section, p1Section, tokenStats };
  }

  /**
   * 构建 System Prompt
   */
  private buildSystemPrompt(stage: WritingStage): string {
    const parts: string[] = [
      '你是一位专业的网络小说写作助手。请遵循以下规则生成内容：',
      '',
      '1. 严格遵守【本章大纲·必循】中的大纲规划',
      '2. 保持角色设定的一致性（性格、能力、关系）',
      '3. 遵守世界观规则，不引入违反设定的内容',
      '4. 需要回收的伏笔应自然融入情节',
      '5. 与前文保持情节连贯性',
      '6. 注意对话风格的匹配',
    ];

    if (stage === 'drafting') {
      parts.push('', '【写作要求】');
      parts.push('- 严格采用【本章大纲·必循】中的本章独立目标字数；该目标必须处于3200-4000字，不得改用项目默认值');
      parts.push('- 章节结尾设置悬念或钩子');
      parts.push('- 保持战斗/日常/情感描写的比例平衡');
    }

    if (stage === 'revision') {
      parts.push('', '【修改要求】');
      parts.push('- 保持原文的核心情节走向');
      parts.push('- 优化节奏和细节描写');
      parts.push('- 修正逻辑矛盾和设定违反');
    }

    if (stage === 'polish') {
      parts.push('', '【润色要求】');
      parts.push('- 优化文笔和修辞');
      parts.push('- 统一语言风格');
      parts.push('- 提升阅读体验');
    }

    return parts.join('\n');
  }

  /**
   * 构建 P0 核心段
   */
  private buildP0Section(items: ContextInjectItem[], maxTokens: number): string {
    return this.assembleSection('【P0核心·必循】', items, maxTokens);
  }

  /**
   * 构建 P1 参考段
   */
  private buildP1Section(items: ContextInjectItem[], maxTokens: number): string {
    return this.assembleSection('【P1关键·参考】', items, maxTokens);
  }

  /**
   * 组装段落内容
   */
  private assembleSection(_label: string, items: ContextInjectItem[], maxTokens: number): string {
    const lines: string[] = [];
    let tokenCount = 0;

    for (const item of items.sort((a, b) => b.priority - a.priority)) {
      const itemTokens = this.estimateTokens(item.content);
      if (tokenCount + itemTokens > maxTokens) continue;

      const prefix = item.section
        ? `### ${item.section}${item.source ? ` (${item.source})` : ''}`
        : `[${item.source || '参考'}]`;

      lines.push(prefix);
      lines.push(item.content);
      lines.push('');
      tokenCount += itemTokens;
    }

    return lines.join('\n').trim();
  }

  /**
   * 分隔线
   */
  private sectionSeparator(title: string, tier: string): string {
    const width = 40;
    const side = '─'.repeat(Math.floor((width - title.length - tier.length - 4) / 2));
    return `${side} 【${tier}】${title} ${side}`;
  }

  /**
   * 估算 Token 数
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
