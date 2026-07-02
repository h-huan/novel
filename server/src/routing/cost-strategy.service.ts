/**
 * 双模型成本策略服务
 *
 * 核心职责：
 * - 成本阶梯定义（极低/低/中/高）
 * - 场景→成本等级映射
 * - 自动分配：基于章节功能选择成本等级
 * - 成本统计：按项目/章节/模型/日/周 汇总
 * - 预算控制：月度预算上限 + 80% 阈值告警
 * - BYOK 计费：用户 Key 的消耗统计
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ==================== 类型定义 ====================

/** 成本等级 */
export type CostTier = 'ultra_low' | 'low' | 'medium' | 'high';

/** 模型成本定价 */
export interface ModelPricing {
  modelName: string;
  tier: CostTier;
  inputPrice: number;    // 每千token输入价格（元）
  outputPrice: number;   // 每千token输出价格（元）
  label: string;
}

/** 成本记录 */
export interface CostRecord {
  id: string;
  projectId: string;
  chapterNumber?: number;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;            // 本次调用费用（元）
  timestamp: Date;
  isUserKey?: boolean;     // 是否用户自己的Key计费
}

/** 成本统计汇总 */
export interface CostSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
  modelBreakdown: Record<string, {
    cost: number;
    calls: number;
    tokens: number;
  }>;
}

/** 预算状态 */
export interface BudgetStatus {
  monthlyLimit: number;       // 月预算上限
  currentMonthCost: number;   // 当月已消耗
  remainingBudget: number;    // 剩余预算
  usagePercent: number;       // 使用百分比
  warningThreshold: number;   // 告警阈值
  isWarning: boolean;         // 是否触发告警
  isExceeded: boolean;        // 是否超支
}

/** 章节功能→成本等级映射 */
export interface ChapterCostMapping {
  chapterFunction: string;
  tier: CostTier;
  label: string;
  priority: number;
}

@Injectable()
export class CostStrategyService {
  private readonly logger = new Logger(CostStrategyService.name);

  /** 模型定价表 */
  private readonly pricingTable: ModelPricing[] = [
    { modelName: 'deepseek', tier: 'ultra_low', inputPrice: 0.001, outputPrice: 0.002, label: 'DeepSeek' },
    { modelName: 'glm',      tier: 'low',       inputPrice: 0.003, outputPrice: 0.005, label: 'GLM-4' },
    { modelName: 'qwen',     tier: 'low',       inputPrice: 0.003, outputPrice: 0.005, label: 'Qwen' },
    { modelName: 'gpt4o',    tier: 'medium',    inputPrice: 0.015, outputPrice: 0.030, label: 'GPT-4o' },
    { modelName: 'claude',   tier: 'high',      inputPrice: 0.025, outputPrice: 0.075, label: 'Claude' },
  ];

  /** 章节功能→成本等级 */
  private readonly chapterCostMap: ChapterCostMapping[] = [
    { chapterFunction: 'exposition',    tier: 'ultra_low', label: '展开',    priority: 10 },
    { chapterFunction: 'transition',    tier: 'ultra_low', label: '过渡',    priority: 9 },
    { chapterFunction: 'world_building',tier: 'low',       label: '世界观',  priority: 8 },
    { chapterFunction: 'rising',        tier: 'medium',    label: '发展',    priority: 7 },
    { chapterFunction: 'foreshadowing', tier: 'high',      label: '伏笔',    priority: 6 },
    { chapterFunction: 'resolution',    tier: 'medium',    label: '解决',    priority: 5 },
    { chapterFunction: 'revelation',    tier: 'high',      label: '揭露',    priority: 4 },
    { chapterFunction: 'falling',       tier: 'low',       label: '回落',    priority: 3 },
    { chapterFunction: 'climax',        tier: 'high',      label: '高潮',    priority: 1 },
  ];

  /** 成本记录（内存存储，生产环境应写入数据库） */
  private readonly costRecords: CostRecord[] = [];

  /** 月度预算配置 key=projectId, value=BudgetConfig */
  private readonly budgetConfigs = new Map<string, { monthlyLimit: number; warningThreshold: number }>();

  constructor(private readonly configService: ConfigService) {}

  // ==================== 成本分配 ====================

  /**
   * 根据章节功能获取建议成本等级
   * @param chapterFunction 章节功能标识
   */
  getCostTierForChapter(chapterFunction: string): CostTier {
    const mapping = this.chapterCostMap.find((m) => m.chapterFunction === chapterFunction);
    if (!mapping) {
      this.logger.warn(`未知章节功能: ${chapterFunction}，默认使用 low 成本等级`);
      return 'low';
    }
    return mapping.tier;
  }

  /**
   * 获取场景建议模型（基于成本策略）
   * @param requiredTier 所需的最低成本等级
   */
  getModelsByCostTier(requiredTier: CostTier): ModelPricing[] {
    const tierOrder: CostTier[] = ['ultra_low', 'low', 'medium', 'high'];
    const requiredLevel = tierOrder.indexOf(requiredTier);

    return this.pricingTable
      .filter((p) => tierOrder.indexOf(p.tier) <= requiredLevel)
      .sort((a, b) => {
        const aLevel = tierOrder.indexOf(a.tier);
        const bLevel = tierOrder.indexOf(b.tier);
        return aLevel - bLevel;
      });
  }

  /**
   * 获取最便宜的可用模型
   */
  getCheapestModel(tier?: CostTier): ModelPricing {
    const models = tier
      ? this.getModelsByCostTier(tier)
      : this.pricingTable;
    return models[0];
  }

  /**
   * 获取模型定价信息
   */
  getModelPricing(modelName: string): ModelPricing | undefined {
    return this.pricingTable.find((p) => p.modelName === modelName);
  }

  // ==================== 成本记录 ====================

  /**
   * 记录一次模型调用的成本
   */
  recordCost(record: Omit<CostRecord, 'id' | 'cost'> & { cost?: number }): CostRecord {
    let cost = record.cost;
    if (cost === undefined) {
      const pricing = this.getModelPricing(record.modelName);
      if (pricing) {
        cost = (record.inputTokens / 1000) * pricing.inputPrice +
               (record.outputTokens / 1000) * pricing.outputPrice;
      } else {
        cost = 0;
      }
    }

    const fullRecord: CostRecord = {
      ...record,
      id: `cost_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cost: Math.round(cost * 10000) / 10000, // 保留4位小数
      timestamp: record.timestamp || new Date(),
    };

    this.costRecords.push(fullRecord);
    return fullRecord;
  }

  // ==================== 成本统计 ====================

  /**
   * 统计指定项目的成本
   */
  getProjectCostSummary(projectId: string, startDate?: Date, endDate?: Date): CostSummary {
    const records = this.costRecords.filter((r) => {
      if (r.projectId !== projectId) return false;
      if (startDate && r.timestamp < startDate) return false;
      if (endDate && r.timestamp > endDate) return false;
      return true;
    });

    return this.aggregateCosts(records);
  }

  /**
   * 统计指定章节的成本
   */
  getChapterCostSummary(projectId: string, chapterNumber: number): CostSummary {
    const records = this.costRecords.filter(
      (r) => r.projectId === projectId && r.chapterNumber === chapterNumber,
    );
    return this.aggregateCosts(records);
  }

  /**
   * 按模型统计
   */
  getModelCostSummary(modelName: string, projectId?: string): CostSummary {
    const records = this.costRecords.filter((r) => {
      if (r.modelName !== modelName) return false;
      if (projectId && r.projectId !== projectId) return false;
      return true;
    });
    return this.aggregateCosts(records);
  }

  /**
   * 按时间段统计
   */
  getTimeRangeSummary(startDate: Date, endDate: Date, projectId?: string): CostSummary {
    const records = this.costRecords.filter((r) => {
      if (r.timestamp < startDate || r.timestamp > endDate) return false;
      if (projectId && r.projectId !== projectId) return false;
      return true;
    });
    return this.aggregateCosts(records);
  }

  /**
   * 获取今日成本统计
   */
  getTodaySummary(projectId?: string): CostSummary {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.getTimeRangeSummary(startOfDay, new Date(), projectId);
  }

  /**
   * 获取本周成本统计
   */
  getWeekSummary(projectId?: string): CostSummary {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return this.getTimeRangeSummary(startOfWeek, now, projectId);
  }

  /**
   * 获取所有成本记录（分页）
   */
  getAllCostRecords(limit: number = 100, offset: number = 0): CostRecord[] {
    return this.costRecords
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);
  }

  // ==================== 预算控制 ====================

  /**
   * 设置项目月度预算
   * @param projectId 项目ID
   * @param monthlyLimit 月度预算上限（元）
   * @param warningThreshold 告警阈值百分比，默认80
   */
  setBudget(projectId: string, monthlyLimit: number, warningThreshold: number = 0.8): void {
    this.budgetConfigs.set(projectId, {
      monthlyLimit,
      warningThreshold: Math.max(0, Math.min(1, warningThreshold)),
    });
    this.logger.log(`项目 ${projectId} 预算已设置: 每月 ${monthlyLimit} 元，${warningThreshold * 100}% 告警`);
  }

  /**
   * 获取项目预算状态
   */
  getBudgetStatus(projectId: string): BudgetStatus | null {
    const budgetConfig = this.budgetConfigs.get(projectId);
    if (!budgetConfig) return null;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCost = this.getTimeRangeSummary(startOfMonth, now, projectId).totalCost;

    const usagePercent = (monthCost / budgetConfig.monthlyLimit) * 100;

    return {
      monthlyLimit: budgetConfig.monthlyLimit,
      currentMonthCost: Math.round(monthCost * 100) / 100,
      remainingBudget: Math.round((budgetConfig.monthlyLimit - monthCost) * 100) / 100,
      usagePercent: Math.round(usagePercent * 100) / 100,
      warningThreshold: budgetConfig.warningThreshold * 100,
      isWarning: usagePercent >= budgetConfig.warningThreshold * 100,
      isExceeded: monthCost >= budgetConfig.monthlyLimit,
    };
  }

  /**
   * 检查是否允许调用（预算控制）
   *
   * @returns { allowed: boolean; reason?: string }
   */
  checkBudgetAllowance(projectId: string): { allowed: boolean; reason?: string } {
    const budgetConfig = this.budgetConfigs.get(projectId);
    if (!budgetConfig) return { allowed: true };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCost = this.getTimeRangeSummary(startOfMonth, now, projectId).totalCost;

    if (monthCost >= budgetConfig.monthlyLimit) {
      return { allowed: false, reason: `项目 ${projectId} 月度预算已超支（${monthCost}/${budgetConfig.monthlyLimit}）` };
    }

    if (monthCost >= budgetConfig.monthlyLimit * budgetConfig.warningThreshold) {
      this.logger.warn(
        `项目 ${projectId} 月度预算已达 ${Math.round((monthCost / budgetConfig.monthlyLimit) * 100)}%（${monthCost}/${budgetConfig.monthlyLimit}）`,
      );
    }

    return { allowed: true };
  }

  // ==================== BYOK 计费 ====================

  /**
   * 获取用户 Key 的成本消耗
   */
  getUserKeyCostSummary(projectId: string): CostSummary {
    const records = this.costRecords.filter(
      (r) => r.projectId === projectId && r.isUserKey,
    );
    return this.aggregateCosts(records);
  }

  // ==================== 辅助方法 ====================

  /**
   * 汇总成本数据
   */
  private aggregateCosts(records: CostRecord[]): CostSummary {
    const modelBreakdown: Record<string, { cost: number; calls: number; tokens: number }> = {};

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const record of records) {
      totalCost += record.cost;
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;

      if (!modelBreakdown[record.modelName]) {
        modelBreakdown[record.modelName] = { cost: 0, calls: 0, tokens: 0 };
      }
      modelBreakdown[record.modelName].cost += record.cost;
      modelBreakdown[record.modelName].calls += 1;
      modelBreakdown[record.modelName].tokens += record.inputTokens + record.outputTokens;
    }

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalInputTokens,
      totalOutputTokens,
      callCount: records.length,
      modelBreakdown,
    };
  }

  /**
   * 获取所有章节功能成本映射
   */
  getChapterCostMappings(): ChapterCostMapping[] {
    return [...this.chapterCostMap];
  }

  /**
   * 获取完整定价表
   */
  getPricingTable(): ModelPricing[] {
    return [...this.pricingTable];
  }
}
