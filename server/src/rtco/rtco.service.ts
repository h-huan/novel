/**
 * RTCO 分级服务 (Retrieval Token Context Optimization)
 *
 * 实现设计文档 3.2 节的动态Token预算分配算法
 *
 * RTCO 四级分类:
 * P0: 核心必用 (40% 基础预算)  - 当前大纲/角色状态/上章结尾/活跃伏笔/关键世界观
 * P1: 关键内容 (35% 基础预算)  - 相关角色档案/扩展世界观/近5章摘要/未激活伏笔
 * P2: 备用参考 (20% 基础预算)  - 全世界观/全角色库/已回收伏笔/远章摘要
 * P3: 归档存储 (5% 基础预算)   - 旧版世界观/已删除角色/废弃大纲
 */

import { Injectable, Logger } from '@nestjs/common';

/** 写作阶段 */
export type WritingStage = 'outline' | 'drafting' | 'revision' | 'polish';

/** RTCO 优先级 */
export type RTCOTier = 'P0' | 'P1' | 'P2' | 'P3';

/** Token预算方案 */
export interface BudgetPlan {
  /** 各层分配比例 */
  ratios: Record<RTCOTier, number>;
  /** 各层分配Token数 */
  tokens: Record<RTCOTier, number>;
  /** 总预算 */
  totalBudget: number;
  /** 分配说明 */
  note?: string;
}

/** 上下文注入项 */
export interface ContextInjectItem {
  tier: RTCOTier;
  section: string;
  content: string;
  priority: number;
  source?: string;
}

/** 上下文构建请求 */
export interface RTCORequest {
  /** 写作阶段 */
  stage: WritingStage;
  /** 章节复杂度 (0-1) */
  chapterComplexity: number;
  /** 活跃角色数 */
  activeCharacters: number;
  /** 活跃伏笔数 */
  activeForeshadows: number;
  /** Token预算上限 */
  maxTokens?: number;
  /** 本章大纲 */
  outline?: string;
  /** 出场角色状态 */
  characterStates?: Record<string, Record<string, unknown>>;
  /** 上一章结尾 */
  prevChapterEnd?: string;
  /** 活跃伏笔 */
  activeForeshadowList?: string[];
}

/** 上下文构建结果 */
export interface RTCOContext {
  /** 预算分配方案 */
  budgetPlan: BudgetPlan;
  /** P0 注入项 */
  p0Items: ContextInjectItem[];
  /** P1 注入项 */
  p1Items: ContextInjectItem[];
  /** P2 可用项 */
  p2Items: ContextInjectItem[];
}

@Injectable()
export class RTCOService {
  private readonly logger = new Logger(RTCOService.name);

  /** 默认总预算 */
  private readonly DEFAULT_TOTAL_BUDGET = 8000;

  /** 基础分配比例 */
  private readonly BASE_RATIOS: Record<RTCOTier, number> = {
    P0: 0.40,
    P1: 0.35,
    P2: 0.20,
    P3: 0.05,
  };

  /**
   * 动态Token预算分配
   *
   * 根据写作阶段、章节复杂度动态调整 P0/P1/P2/P3 比例
   */
  allocateBudget(request: RTCORequest): BudgetPlan {
    const totalBudget = request.maxTokens || this.DEFAULT_TOTAL_BUDGET;
    const ratios = { ...this.BASE_RATIOS };

    // ═══ 阶段调整因子 ═══
    switch (request.stage) {
      case 'outline':
        // 大纲阶段：更多世界观参考
        ratios.P0 += 0.05;   // 大纲
        ratios.P1 += 0.05;   // 世界观
        ratios.P2 -= 0.10;
        break;

      case 'drafting':
        // 正文写作：更多角色状态和前文
        ratios.P0 += 0.10;   // 角色+前文
        ratios.P2 -= 0.10;
        break;

      case 'revision':
        // 修改阶段：需要更广的参考
        ratios.P1 += 0.10;   // 扩展参考
        ratios.P0 -= 0.05;
        ratios.P2 -= 0.05;
        break;

      case 'polish':
        // 润色阶段：聚焦当前文本
        ratios.P0 += 0.15;   // 当前文本+紧邻上下文
        ratios.P1 -= 0.05;
        ratios.P2 -= 0.10;
        break;
    }

    // ═══ 复杂度调整 ═══
    if (request.chapterComplexity > 0.7) {
      // 高复杂度：P0和P1都要更多预算
      ratios.P0 += 0.05;
      ratios.P1 += 0.05;
      ratios.P2 -= 0.10;
    }

    // 角色多时增加P1预算（更多角色信息需要被检索）
    if (request.activeCharacters > 5) {
      ratios.P1 += 0.03;
      ratios.P0 -= 0.03;
    }

    // 伏笔多时增加P1预算
    if (request.activeForeshadows > 3) {
      ratios.P1 += 0.02;
      ratios.P2 -= 0.02;
    }

    // ═══ 归一化 ═══
    const total = ratios.P0 + ratios.P1 + ratios.P2 + ratios.P3;
    const normalized: Record<RTCOTier, number> = {
      P0: ratios.P0 / total,
      P1: ratios.P1 / total,
      P2: ratios.P2 / total,
      P3: ratios.P3 / total,
    };

    // ═══ 计算 Token 数 ═══
    const tokens: Record<RTCOTier, number> = {
      P0: Math.floor(totalBudget * normalized.P0),
      P1: Math.floor(totalBudget * normalized.P1),
      P2: Math.floor(totalBudget * normalized.P2),
      P3: Math.floor(totalBudget * normalized.P3),
    };

    return {
      ratios: normalized,
      tokens,
      totalBudget,
      note: this.generateBudgetNote(request),
    };
  }

  /**
   * 按优先级组装上下文中各项
   */
  assembleContext(budget: BudgetPlan, items: ContextInjectItem[]): RTCOContext {
    const sorted = [...items].sort((a, b) => b.priority - a.priority);

    const p0Items: ContextInjectItem[] = [];
    const p1Items: ContextInjectItem[] = [];
    const p2Items: ContextInjectItem[] = [];

    let p0Tokens = 0;
    let p1Tokens = 0;

    for (const item of sorted) {
      if (item.tier === 'P0') {
        if (p0Tokens + this.estimateTokens(item.content) <= budget.tokens.P0) {
          p0Items.push(item);
          p0Tokens += this.estimateTokens(item.content);
        }
      } else if (item.tier === 'P1') {
        if (p1Tokens + this.estimateTokens(item.content) <= budget.tokens.P1) {
          p1Items.push(item);
          p1Tokens += this.estimateTokens(item.content);
        }
      } else {
        p2Items.push(item);
      }
    }

    return { budgetPlan: budget, p0Items, p1Items, p2Items };
  }

  /**
   * 获取 RTCO 分层的说明
   */
  getTierDescription(tier: RTCOTier): string {
    const descriptions: Record<RTCOTier, string> = {
      P0: '核心必用 (Core) - 每次生成必注入，占据上下文开头的黄金位置',
      P1: '关键内容 (Critical) - 通过RAG检索按相关性动态加载，有选择地注入',
      P2: '备用参考 (Reference) - 不注入上下文，仅作为可检索知识库存在',
      P3: '归档存储 (Archive) - 不可检索（除非显式开启），仅用于审计回溯',
    };
    return descriptions[tier];
  }

  /**
   * 确定某检索结果应归属的 RTCO 层级
   */
  classifyResult(
    docType: string,
    priority: string,
    relevanceScore: number,
  ): RTCOTier {
    // 大纲和当前角色状态 → P0
    if (docType === 'outline' && priority === 'P0') return 'P0';
    if (docType === 'character_profile' && priority === 'P0') return 'P0';

    // 高相关度的 → P1
    if (relevanceScore > 0.7) return 'P1';
    if (priority === 'P1') return 'P1';

    // 中等相关度 → P2
    if (relevanceScore > 0.4) return 'P2';

    // 低相关度和归档 → P3
    return 'P3';
  }

  /**
   * 获取P0必备上下文模板
   */
  getP0Template(): string[] {
    return [
      '本章大纲：{outline}',
      '出场角色状态：{character_states}',
      '上一章结尾：{prev_chapter_end}',
      '活跃伏笔：{active_foreshadows}',
      '关键世界观规则：{world_rules}',
    ];
  }

  /**
   * 估算文本 Token 数
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

  /**
   * 生成预算分配说明
   */
  private generateBudgetNote(request: RTCORequest): string {
    const stageMap: Record<WritingStage, string> = {
      outline: '大纲规划',
      drafting: '正文写作',
      revision: '修改完善',
      polish: '润色定稿',
    };

    return `阶段: ${stageMap[request.stage]}, 复杂度: ${(request.chapterComplexity * 100).toFixed(0)}%, ` +
      `角色: ${request.activeCharacters}人, 伏笔: ${request.activeForeshadows}个`;
  }
}
