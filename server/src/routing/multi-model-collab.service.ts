/**
 * 多模型协作系统
 *
 * 实现写手-评审-策划 三角色协作流水线：
 * - 写手模型：生成初稿
 * - 评审模型：检查逻辑/人设/设定冲突（输出修改意见）
 * - 策划模型：宏观把控节奏/爽点布局
 *
 * 协作流程：
 *   写手生成 → 评审检查 → 通过/修改/重生成
 *   结果合并：接受评审意见 → 修改 → 输出最终版
 */
import { Injectable, Logger } from '@nestjs/common';
import { ModelRouterService, RoutedModel } from './model-router.service';

// ==================== 类型定义 ====================

/** 协作角色 */
export type CollabRole = 'writer' | 'reviewer' | 'planner';

/** 评审意见 */
export interface ReviewComment {
  type: 'logic' | 'character' | 'setting' | 'plot' | 'style' | 'pacing';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  location: string;             // 问题位置（段落/行号/章节位置）
  description: string;          // 问题描述
  suggestion: string;           // 修改建议
  category: string;             // 问题分类标签
}

/** 策划意见 */
export interface PlannerFeedback {
  pacing: string;               // 节奏评价
  highlightLayout: string;      // 爽点布局评价
  foreshadowCheck: string;      // 伏笔检查
  structureSuggestions: string[]; // 结构调整建议
  overallScore: number;         // 宏观评分 0-100
}

/** 协作回合 */
export interface CollabRound {
  roundNumber: number;
  draft: string;
  reviewComments: ReviewComment[];
  plannerFeedback: PlannerFeedback | null;
  acceptedChanges: string[];    // 接受的修改描述
  revision: string;             // 修改后的版本
  finalVersion?: string;        // 最终定稿
}

/** 协作会话 */
export interface CollabSession {
  id: string;
  projectId: string;
  chapterNumber: number;
  rounds: CollabRound[];
  status: 'in_progress' | 'completed' | 'failed';
  maxRounds: number;
  createdAt: Date;
  completedAt?: Date;
  result?: string;              // 最终输出
}

/** 写手模型调用函数签名 */
export type WriterGenerateFn = (model: string, prompt: string, temperature?: number) => Promise<string>;

/** 评审模型调用函数签名 */
export type ReviewerEvaluateFn = (model: string, draft: string, context: string) => Promise<ReviewComment[]>;

/** 策划模型调用函数签名 */
export type PlannerEvaluateFn = (model: string, draft: string, outline: string) => Promise<PlannerFeedback>;

@Injectable()
export class MultiModelCollabService {
  private readonly logger = new Logger(MultiModelCollabService.name);

  /** 活跃协作会话 */
  private readonly sessions = new Map<string, CollabSession>();

  constructor(private readonly modelRouter: ModelRouterService) {}

  // ==================== 协作执行 ====================

  /**
   * 执行多模型协作生成
   *
   * @param sessionId 会话ID
   * @param options 协作选项
   * @param callbacks 模型调用回调函数
   */
  async executeCollab(
    sessionId: string,
    options: {
      projectId: string;
      chapterNumber: number;
      writerPrompt: string;
      reviewContext: string;       // 评审上下文（世界观/人设等）
      outline: string;             // 大纲
      maxRounds?: number;          // 最大协作轮次，默认3
      chapterFunction?: string;    // 章节功能
    },
    callbacks: {
      writerGenerate: WriterGenerateFn;
      reviewerEvaluate: ReviewerEvaluateFn;
      plannerEvaluate: PlannerEvaluateFn;
    },
  ): Promise<CollabSession> {
    const maxRounds = options.maxRounds || 3;

    const session: CollabSession = {
      id: sessionId,
      projectId: options.projectId,
      chapterNumber: options.chapterNumber,
      rounds: [],
      status: 'in_progress',
      maxRounds,
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    try {
      for (let round = 0; round < maxRounds; round++) {
        this.logger.log(`协作轮次 ${round + 1}/${maxRounds} 开始`);

        // 步骤1: 写手生成初稿
        const draft = await this.executeWriterRound(sessionId, round, options, callbacks);

        // 步骤2: 评审检查
        const reviewComments = await this.executeReviewRound(sessionId, draft, options, callbacks);

        // 步骤3: 策划评估（每轮或仅在首轮/末轮执行）
        let plannerFeedback: PlannerFeedback | null = null;
        if (round === 0 || round === maxRounds - 1) {
          plannerFeedback = await this.executePlannerRound(sessionId, draft, options, callbacks);
        }

        // 步骤4: 判断是否需要继续
        const criticalIssues = reviewComments.filter((c) => c.severity === 'critical');
        const majorIssues = reviewComments.filter((c) => c.severity === 'major');

        // 生成修改版本
        const acceptedChanges = this.prioritizeChanges(reviewComments);
        const revision = await this.applyChanges(draft, acceptedChanges);

        const roundData: CollabRound = {
          roundNumber: round + 1,
          draft,
          reviewComments,
          plannerFeedback,
          acceptedChanges,
          revision,
        };

        session.rounds.push(roundData);

        // 判断是否通过评审
        if (criticalIssues.length === 0 && majorIssues.length <= 2) {
          // 最终轮或已达标
          const finalVersion = plannerFeedback
            ? await this.applyPlannerFeedback(revision, plannerFeedback, callbacks)
            : revision;

          roundData.finalVersion = finalVersion;
          session.result = finalVersion;
          session.status = 'completed';
          session.completedAt = new Date();

          this.logger.log(`协作生成完成，共 ${round + 1} 轮`);
          return session;
        }

        if (round < maxRounds - 1) {
          // 需要新轮次，更新写手 prompt 包含评审意见
          options.writerPrompt = this.buildRevisionPrompt(
            options.writerPrompt,
            draft,
            reviewComments,
            plannerFeedback,
          );
        }
      }

      // 达到最大轮次仍未达标
      const lastRound = session.rounds[session.rounds.length - 1];
      session.result = lastRound.revision;
      session.status = 'completed';
      session.completedAt = new Date();

      this.logger.warn(`协作生成达到最大轮次 ${maxRounds}，使用最终版本`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`协作生成失败: ${errMsg}`);
      session.status = 'failed';

      // 保留部分结果
      if (session.rounds.length > 0) {
        session.result = session.rounds[session.rounds.length - 1].revision;
      }
    }

    return session;
  }

  // ==================== 各角色执行 ====================

  /**
   * 写手轮次：生成初稿
   */
  private async executeWriterRound(
    sessionId: string,
    round: number,
    options: {
      projectId: string;
      chapterNumber: number;
      writerPrompt: string;
      chapterFunction?: string;
    },
    callbacks: { writerGenerate: WriterGenerateFn },
  ): Promise<string> {
    const route = this.modelRouter.getModelForScenario('writing_daily', {
      role: 'writer',
      chapterFunction: options.chapterFunction,
      isClimax: options.chapterFunction === 'climax' || options.chapterFunction === 'revelation',
    });

    this.logger.log(`[${sessionId}] 写手轮次 ${round + 1}，使用模型: ${route.modelName}，温度: ${route.temperature}`);

    const draft = await callbacks.writerGenerate(
      route.modelName,
      options.writerPrompt,
      route.temperature,
    );

    return draft;
  }

  /**
   * 评审轮次：检查草稿问题
   */
  private async executeReviewRound(
    sessionId: string,
    draft: string,
    options: { reviewContext: string },
    callbacks: { reviewerEvaluate: ReviewerEvaluateFn },
  ): Promise<ReviewComment[]> {
    const route = this.modelRouter.getModelForScenario('character_review', {
      role: 'reviewer',
    });

    this.logger.log(`[${sessionId}] 评审轮次，使用模型: ${route.modelName}`);

    const comments = await callbacks.reviewerEvaluate(
      route.modelName,
      draft,
      options.reviewContext,
    );

    // 按严重程度排序
    return comments.sort((a, b) => {
      const severityOrder = { critical: 0, major: 1, minor: 2, suggestion: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * 策划轮次：宏观把控
   */
  private async executePlannerRound(
    sessionId: string,
    draft: string,
    options: { outline: string },
    callbacks: { plannerEvaluate: PlannerEvaluateFn },
  ): Promise<PlannerFeedback> {
    const route = this.modelRouter.getModelForScenario('outline', {
      role: 'planner',
    });

    this.logger.log(`[${sessionId}] 策划轮次，使用模型: ${route.modelName}`);

    return callbacks.plannerEvaluate(
      route.modelName,
      draft,
      options.outline,
    );
  }

  // ==================== 修改应用 ====================

  /**
   * 优先级排序修改建议
   */
  private prioritizeChanges(comments: ReviewComment[]): string[] {
    const sorted = [...comments].sort((a, b) => {
      const order = { critical: 0, major: 1, minor: 2, suggestion: 3 };
      return order[a.severity] - order[b.severity];
    });

    // 只接受 critical + major + 前2个 minor 建议
    const changes: string[] = [];
    let minorCount = 0;

    for (const c of sorted) {
      if (c.severity === 'critical' || c.severity === 'major') {
        changes.push(c.suggestion);
      } else if (c.severity === 'minor' && minorCount < 2) {
        changes.push(c.suggestion);
        minorCount++;
      }
    }

    return changes;
  }

  /**
   * 应用修改到草稿（模拟）
   * 真实环境应调用 LLM 执行修改
   */
  private async applyChanges(
    draft: string,
    changes: string[],
  ): Promise<string> {
    if (changes.length === 0) return draft;

    // 模拟：在草稿末尾附加修改记录
    const revisionNote = [
      '\n\n---\n*修改记录*',
      ...changes.map((c, i) => `${i + 1}. ${c}`),
    ].join('\n');

    return draft + revisionNote;
  }

  /**
   * 应用策划反馈
   */
  private async applyPlannerFeedback(
    revision: string,
    feedback: PlannerFeedback,
    callbacks: { plannerEvaluate: PlannerEvaluateFn } | { writerGenerate: WriterGenerateFn; plannerPrompt?: string },
  ): Promise<string> {
    const feedbackNote = [
      '\n\n---\n*策划调整*',
      `节奏: ${feedback.pacing}`,
      `爽点: ${feedback.highlightLayout}`,
      ...feedback.structureSuggestions.map((s) => `- ${s}`),
    ].join('\n');

    return revision + feedbackNote;
  }

  /**
   * 构建带反馈的写手 Prompt
   */
  private buildRevisionPrompt(
    originalPrompt: string,
    draft: string,
    comments: ReviewComment[],
    plannerFeedback: PlannerFeedback | null,
  ): string {
    const parts: string[] = [originalPrompt];

    // 添加评审反馈
    if (comments.length > 0) {
      parts.push('\n\n【上一轮评审意见】');
      for (const c of comments) {
        parts.push(`[${c.severity}/${c.type}] ${c.location}: ${c.description}`);
        parts.push(`  建议: ${c.suggestion}`);
      }
    }

    // 添加策划反馈
    if (plannerFeedback) {
      parts.push('\n\n【策划反馈】');
      parts.push(`节奏评价: ${plannerFeedback.pacing}`);
      parts.push(`爽点布局: ${plannerFeedback.highlightLayout}`);
      parts.push('结构调整建议:');
      parts.push(...plannerFeedback.structureSuggestions.map((s) => `  - ${s}`));
    }

    parts.push('\n\n请基于以上反馈，优化上一版内容，保留优点，修复问题。');

    return parts.join('\n');
  }

  // ==================== 会话管理 ====================

  /**
   * 获取协作会话
   */
  getSession(sessionId: string): CollabSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 列出项目的所有协作会话
   */
  listProjectSessions(projectId: string): CollabSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.projectId === projectId,
    );
  }
}
