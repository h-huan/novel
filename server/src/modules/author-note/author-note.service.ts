/**
 * Author's Note Service
 * 管理作者注规则，支持情节约束/风格要求/设定覆盖/伏笔操作/自定义
 * 3种作用域：单章/本卷/永久
 * 冲突检测：新规则与已锁定正文的冲突
 * 注入逻辑：规则→Prompt模板→风格引擎 优先级
 */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { AuthorNoteRuleType, AuthorNoteScope } from './dto/author-note.dto';
import type { CreateAuthorNoteDto, UpdateAuthorNoteDto } from './dto/author-note.dto';

// --------------- 类型定义 ---------------

export interface AuthorNoteRule {
  id: string;
  title: string;
  ruleType: AuthorNoteRuleType;
  content: string;
  scope: AuthorNoteScope;
  chapterIndex?: number;
  volumeIndex?: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflicts: ConflictItem[];
}

export interface ConflictItem {
  type: 'scope_overlap' | 'priority_conflict' | 'content_contradiction' | 'locked_chapter_conflict';
  severity: 'high' | 'medium' | 'low';
  description: string;
  relatedNoteId?: string;
  relatedChapterId?: string;
  suggestion: string;
}

export interface InjectedPrompt {
  rules: AuthorNoteRule[];
  formattedPrompt: string;
  priority: number;
}

// --------------- 规则类型优先级权重 ---------------

const RULE_TYPE_PRIORITY: Record<AuthorNoteRuleType, number> = {
  [AuthorNoteRuleType.PLOT_CONSTRAINT]: 90,
  [AuthorNoteRuleType.SETTING_OVERRIDE]: 80,
  [AuthorNoteRuleType.FORESHADOWING_OPERATION]: 70,
  [AuthorNoteRuleType.STYLE_REQUIREMENT]: 60,
  [AuthorNoteRuleType.CUSTOM]: 50,
};

const SCOPE_PRIORITY: Record<AuthorNoteScope, number> = {
  [AuthorNoteScope.CHAPTER]: 100,
  [AuthorNoteScope.VOLUME]: 60,
  [AuthorNoteScope.PERMANENT]: 30,
};

@Injectable()
export class AuthorNoteService {
  // 内存存储，实际项目中替换为数据库
  private rules: AuthorNoteRule[] = [];

  // ==================== CRUD ====================

  /**
   * 创建规则
   */
  create(dto: CreateAuthorNoteDto): AuthorNoteRule {
    const now = new Date().toISOString();
    const rule: AuthorNoteRule = {
      id: uuid(),
      title: dto.title,
      ruleType: dto.ruleType,
      content: dto.content,
      scope: dto.scope,
      chapterIndex: dto.scope === AuthorNoteScope.CHAPTER ? dto.chapterIndex : undefined,
      volumeIndex: dto.scope === AuthorNoteScope.VOLUME ? dto.volumeIndex : undefined,
      priority: dto.priority ?? RULE_TYPE_PRIORITY[dto.ruleType],
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    // 验证作用域参数的完整性
    if (rule.scope === AuthorNoteScope.CHAPTER && !rule.chapterIndex) {
      throw new BadRequestException('chapterIndex is required for chapter scope');
    }
    if (rule.scope === AuthorNoteScope.VOLUME && !rule.volumeIndex) {
      throw new BadRequestException('volumeIndex is required for volume scope');
    }

    this.rules.push(rule);
    return rule;
  }

  /**
   * 获取所有规则
   */
  findAll(filters?: {
    scope?: AuthorNoteScope;
    ruleType?: AuthorNoteRuleType;
    isActive?: boolean;
    chapterIndex?: number;
    volumeIndex?: number;
  }): AuthorNoteRule[] {
    let result = [...this.rules];

    if (filters) {
      if (filters.scope) result = result.filter((r) => r.scope === filters.scope);
      if (filters.ruleType) result = result.filter((r) => r.ruleType === filters.ruleType);
      if (filters.isActive !== undefined) result = result.filter((r) => r.isActive === filters.isActive);
      if (filters.chapterIndex) {
        result = result.filter(
          (r) =>
            r.scope === AuthorNoteScope.CHAPTER &&
            r.chapterIndex === filters.chapterIndex,
        );
      }
      if (filters.volumeIndex) {
        result = result.filter(
          (r) =>
            r.scope === AuthorNoteScope.VOLUME &&
            r.volumeIndex === filters.volumeIndex,
        );
      }
    }

    // 按优先级降序排列
    return result.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取单条规则
   */
  findOne(id: string): AuthorNoteRule {
    const rule = this.rules.find((r) => r.id === id);
    if (!rule) throw new NotFoundException(`AuthorNote rule ${id} not found`);
    return rule;
  }

  /**
   * 更新规则
   */
  update(id: string, dto: UpdateAuthorNoteDto): AuthorNoteRule {
    const rule = this.findOne(id);
    const now = new Date().toISOString();

    if (dto.title !== undefined) rule.title = dto.title;
    if (dto.content !== undefined) rule.content = dto.content;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    rule.updatedAt = now;

    return rule;
  }

  /**
   * 删除规则
   */
  remove(id: string): { success: boolean } {
    const index = this.rules.findIndex((r) => r.id === id);
    if (index === -1) throw new NotFoundException(`AuthorNote rule ${id} not found`);
    this.rules.splice(index, 1);
    return { success: true };
  }

  // ==================== 冲突检测 ====================

  /**
   * 检测规则与已锁定正文的冲突
   * @param ruleId 要检测的规则ID
   * @param lockedChapterIds 已锁定的章节ID列表（由外部传入）
   */
  detectConflicts(
    ruleId: string,
    lockedChapterIds: string[],
  ): ConflictInfo {
    const rule = this.findOne(ruleId);
    const conflicts: ConflictItem[] = [];

    // 1. 锁定正文冲突：章节作用域的规则修改与已锁定章节冲突
    if (
      rule.scope === AuthorNoteScope.CHAPTER &&
      rule.chapterIndex &&
      lockedChapterIds.length > 0
    ) {
      conflicts.push({
        type: 'locked_chapter_conflict',
        severity: 'high',
        description: `规则"${rule.title}"作用于第${rule.chapterIndex}章, 检测到 ${lockedChapterIds.length} 个已锁定章节可能受影响`,
        suggestion: '新规则可能影响已锁定章节的内容。建议解锁相关章节后再应用，或调整规则作用域。',
      });
    }

    // 2. 作用域重叠检测：检查同一作用域内是否有其他规则
    const overlappingRules = this.rules.filter(
      (r) =>
        r.id !== ruleId &&
        r.isActive &&
        r.scope === rule.scope &&
        r.scope === AuthorNoteScope.CHAPTER &&
        r.chapterIndex === rule.chapterIndex,
    );

    for (const overlap of overlappingRules) {
      conflicts.push({
        type: 'scope_overlap',
        severity: 'medium',
        description: `与规则"${overlap.title}"作用域重叠（均作用于第${rule.chapterIndex}章）`,
        relatedNoteId: overlap.id,
        suggestion: '多个规则作用于同一章节，请确认优先级排序是否正确。当前优先级: 新规则 = ' + rule.priority + ', 已有 = ' + overlap.priority,
      });
    }

    // 3. 内容矛盾检测
    if (rule.ruleType === AuthorNoteRuleType.SETTING_OVERRIDE) {
      const settingRules = this.rules.filter(
        (r) =>
          r.id !== ruleId &&
          r.isActive &&
          r.ruleType === AuthorNoteRuleType.SETTING_OVERRIDE,
      );

      for (const setting of settingRules) {
        if (this.isContradictory(rule.content, setting.content)) {
          conflicts.push({
            type: 'content_contradiction',
            severity: 'high',
            description: `与规则"${setting.title}"存在设定矛盾`,
            relatedNoteId: setting.id,
            suggestion: '两条设定覆盖规则内容矛盾，请确认以哪条为准。',
          });
        }
      }
    }

    // 4. 优先级冲突
    const higherPriorityRules = this.rules.filter(
      (r) =>
        r.id !== ruleId &&
        r.isActive &&
        r.priority > rule.priority &&
        this.isScopeApplicable(r, rule.chapterIndex, rule.volumeIndex),
    );

    for (const higher of higherPriorityRules) {
      conflicts.push({
        type: 'priority_conflict',
        severity: 'low',
        description: `规则"${rule.title}"优先级(${rule.priority})低于"${higher.title}"(${higher.priority})`,
        relatedNoteId: higher.id,
        suggestion: '高优先级规则会覆盖当前规则的效果。如需确保当前规则生效，请提高其优先级。',
      });
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * 批量检测所有新规则的冲突
   */
  detectAllConflicts(lockedChapterIds: string[]): ConflictInfo[] {
    return this.rules
      .filter((r) => r.isActive)
      .map((r) => this.detectConflicts(r.id, lockedChapterIds))
      .filter((c) => c.hasConflict);
  }

  // ==================== 注入逻辑 ====================

  /**
   * 获取指定章节/卷的注入Prompt
   * 规则→Prompt模板→风格引擎 优先级
   */
  getInjectedPrompt(params: {
    chapterIndex?: number;
    volumeIndex?: number;
  }): InjectedPrompt {
    const applicableRules = this.getApplicableRules(params.chapterIndex, params.volumeIndex);

    if (applicableRules.length === 0) {
      return {
        rules: [],
        formattedPrompt: '',
        priority: 0,
      };
    }

    const formattedPrompt = this.buildPromptFromRules(applicableRules);
    const maxPriority = Math.max(...applicableRules.map((r) => r.priority));

    return {
      rules: applicableRules,
      formattedPrompt,
      priority: maxPriority,
    };
  }

  /**
   * 获取适用于指定章节/卷的规则（按优先级排序）
   */
  private getApplicableRules(
    chapterIndex?: number,
    volumeIndex?: number,
  ): AuthorNoteRule[] {
    return this.rules
      .filter((r) => r.isActive && this.isScopeApplicable(r, chapterIndex, volumeIndex))
      .sort((a, b) => {
        // 先按作用域精度降序（章节 > 卷 > 永久）
        const scopeDiff = SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope];
        if (scopeDiff !== 0) return scopeDiff;
        // 再按优先级
        return b.priority - a.priority;
      });
  }

  /**
   * 判断规则是否适用于指定章节/卷
   */
  private isScopeApplicable(
    rule: AuthorNoteRule,
    chapterIndex?: number,
    volumeIndex?: number,
  ): boolean {
    switch (rule.scope) {
      case AuthorNoteScope.PERMANENT:
        return true;
      case AuthorNoteScope.VOLUME:
        return rule.volumeIndex === volumeIndex;
      case AuthorNoteScope.CHAPTER:
        return rule.chapterIndex === chapterIndex;
      default:
        return false;
    }
  }

  /**
   * 从规则构建 Prompt 模板
   */
  private buildPromptFromRules(rules: AuthorNoteRule[]): string {
    const sections: string[] = ['【作者注指令】\n'];

    for (const rule of rules) {
      const typeLabel = this.getRuleTypeLabel(rule.ruleType);
      sections.push(`[${typeLabel}] ${rule.title}`);
      sections.push(`说明: ${rule.content}`);

      if (rule.priority >= 80) {
        sections.push(`优先级: 高（${rule.priority}） - 请严格遵守`);
      } else if (rule.priority >= 50) {
        sections.push(`优先级: 中（${rule.priority}） - 尽可能遵循`);
      } else {
        sections.push(`优先级: 低（${rule.priority}） - 作为参考`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  private getRuleTypeLabel(type: AuthorNoteRuleType): string {
    const labels: Record<AuthorNoteRuleType, string> = {
      [AuthorNoteRuleType.PLOT_CONSTRAINT]: '情节约束',
      [AuthorNoteRuleType.STYLE_REQUIREMENT]: '风格要求',
      [AuthorNoteRuleType.SETTING_OVERRIDE]: '设定覆盖',
      [AuthorNoteRuleType.FORESHADOWING_OPERATION]: '伏笔操作',
      [AuthorNoteRuleType.CUSTOM]: '自定义',
    };
    return labels[type];
  }

  // ==================== 辅助方法 ====================

  /**
   * 简单的内容矛盾检测（对比规则内容中的关键词）
   */
  private isContradictory(contentA: string, contentB: string): boolean {
    // 提取否定性关键词和肯定性关键词
    const negationKeywords = ['不能', '不可以', '禁止', '不要', '必须', '一定', '应该'];

    const wordsA = this.extractKeyPhrases(contentA);
    const wordsB = this.extractKeyPhrases(contentB);

    // 如果两条规则包含相同主题但一个肯定一个否定，则矛盾
    for (const wordA of wordsA) {
      for (const wordB of wordsB) {
        if (wordA === wordB) continue;
        // 检查是否同主题但方向相反
        if (
          (wordA.includes(wordB) || wordB.includes(wordA)) &&
          ((negationKeywords.some((k) => contentA.includes(k)) &&
            !negationKeywords.some((k) => contentB.includes(k))) ||
            (!negationKeywords.some((k) => contentA.includes(k)) &&
              negationKeywords.some((k) => contentB.includes(k))))
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private extractKeyPhrases(content: string): string[] {
    // 提取主谓宾结构
    const phrases: string[] = [];
    // 匹配"角色/设定 + 动作/属性"模式
    const matches = content.matchAll(/([\u4e00-\u9fa5]{2,6})(?:的|是|有|会|能|要|在|了)/g);
    for (const match of matches) {
      phrases.push(match[1]);
    }
    return phrases;
  }
}
