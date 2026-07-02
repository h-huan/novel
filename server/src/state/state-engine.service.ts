/**
 * 状态更新引擎 (State Engine Service)
 *
 * 核心功能：
 * 1. 触发词规则匹配 - 从章节内容中检测状态变化
 * 2. LLM辅助检测 - 处理规则无法覆盖的隐含变化
 * 3. 自动/确认双通道 - auto_apply / auto_confirm
 * 4. 冲突检测 - 防止不合理的状态跳变
 */

import { Injectable, Logger } from '@nestjs/common';
import type { StateDimensionId } from './state-definitions';
import { DIMENSION_METADATA, DEFAULT_CHARACTER_STATE } from './state-definitions';

/** 状态变化类型 */
export type ChangeType = 'numeric_delta' | 'set_value' | 'enum_set' | 'append_list' | 'remove_from_list' | 'computed' | 'map' | 'numeric';

/** 状态变化 */
export interface StateChange {
  dimension: string;
  changeType: ChangeType;
  /** 触发关键词 */
  detectedTrigger?: string;
  /** 建议新值 */
  suggestedValue: unknown;
  /** 变化幅度（数值型） */
  delta?: number;
  /** 是否自动应用 */
  autoApply: boolean;
  /** 是否需要人工确认 */
  needsReview: boolean;
  /** 置信度 0-1 */
  confidence: number;
}

/** 状态快照 */
export interface CharacterStateSnapshot {
  snapshotId: string;
  characterId: string;
  chapterId: string;
  timestamp: Date;
  /** 24维状态 */
  states: Record<string, unknown>;
  /** 本次变化的维度 */
  changedDimensions: string[];
  /** 上一快照ID */
  previousSnapshotId?: string;
  /** 创建者 */
  createdBy: 'system' | 'auto_detect' | 'manual' | 'import';
  /** 备注 */
  notes?: string;
  /** 变化摘要 */
  changeSummary?: string;
}

/** 更新规则 */
interface UpdateRule {
  /** 触发词列表 */
  triggers: string[];
  /** 变化类型（对应 DimensionMeta.type 或 ChangeType） */
  type: 'numeric' | 'numeric_delta' | 'enum' | 'list' | 'map' | 'computed' | 'set_value' | 'enum_set' | 'append_list' | 'remove_from_list';
  /** 自动应用阈值（numeric_delta类型，超过此值需人工确认） */
  autoThreshold?: number;
  /** 是否自动应用 */
  autoApply: boolean;
  /** 是否需要人工确认 */
  autoConfirm: boolean;
  /** 计算公式（computed类型） */
  formula?: string;
  /** 检测到的触发词 */
  detectedTrigger?: string;
}

@Injectable()
export class StateEngineService {
  private readonly logger = new Logger(StateEngineService.name);

  /** 更新规则定义 */
  private readonly updateRules: Record<string, UpdateRule> = {
    hp_injury: {
      triggers: ['受伤', '受伤较重', '重伤', '致命伤', '治愈', '恢复', '治疗', '痊愈', '轻伤'],
      type: 'numeric_delta',
      autoThreshold: 20,
      autoApply: false,
      autoConfirm: true,
    },
    physical_cond: {
      triggers: ['疲惫', '精力充沛', '筋疲力尽', '休息', '恢复体力'],
      type: 'enum_set',
      autoApply: true,
      autoConfirm: false,
    },
    appearance: {
      triggers: ['伤疤', '毁容', '变装', '易容', '衰老', '恢复容貌', '改变外貌'],
      type: 'append_list',
      autoApply: true,
      autoConfirm: false,
    },
    equipment: {
      triggers: ['获得', '拾取', '装备', '武器', '法宝', '丢弃', '遗失', '被夺'],
      type: 'set_value',
      autoApply: true,
      autoConfirm: false,
    },
    faction: {
      triggers: ['加入', '退出', '背叛', '晋升', '贬黜', '归顺', '投靠'],
      type: 'set_value',
      autoApply: false,
      autoConfirm: true,
    },
    reputation: {
      triggers: ['声望', '名望', '名震', '臭名', '威名', '名誉扫地'],
      type: 'numeric_delta',
      autoThreshold: 30,
      autoApply: false,
      autoConfirm: true,
    },
    debt: {
      triggers: ['欠下', '承诺', '许诺', '答应', '偿还', '报恩', '还债'],
      type: 'append_list',
      autoApply: true,
      autoConfirm: false,
    },
    relationship: {
      triggers: ['好感', '信任', '厌恶', '背叛', '结盟', '和解', '决裂', '亲近', '疏远'],
      type: 'numeric_delta',
      autoThreshold: 30,
      autoApply: false,
      autoConfirm: true,
    },
    social_rank: {
      triggers: ['升官', '封爵', '称帝', '被贬', '罢免', '辞职', '授予', '册封'],
      type: 'set_value',
      autoApply: false,
      autoConfirm: true,
    },
    wealth: {
      triggers: ['获得金币', '花费', '赚取', '亏损', '赏赐', '缴获', '变卖'],
      type: 'numeric_delta',
      autoThreshold: 0,
      autoApply: true,
      autoConfirm: false,
    },
    mental_state: {
      triggers: ['崩溃', '冷静', '愤怒', '绝望', '希望', '恐惧', '坚定', '迷茫', '释然'],
      type: 'enum_set',
      autoApply: true,
      autoConfirm: false,
    },
    motivation: {
      triggers: ['决定', '立志', '发誓', '放弃', '改变目标', '觉醒', '明悟'],
      type: 'set_value',
      autoApply: false,
      autoConfirm: true,
    },
    knowledge: {
      triggers: ['得知', '发现', '了解', '获悉', '被告知', '察觉', '意识到'],
      type: 'append_list',
      autoApply: true,
      autoConfirm: false,
    },
    secret: {
      triggers: ['秘密', '隐藏', '不为人知', '暗中', '私下', '隐藏实力'],
      type: 'append_list',
      autoApply: false,
      autoConfirm: true,
    },
    personality: {
      triggers: ['性格变化', '变得', '不再是', '转变', '蜕变', '成长', '黑化'],
      type: 'set_value',
      autoApply: false,
      autoConfirm: true,
    },
    skill_level: {
      triggers: ['突破', '晋级', '修炼', '领悟', '掌握', '学会', '精进'],
      type: 'numeric_delta',
      autoThreshold: 2,
      autoApply: false,
      autoConfirm: true,
    },
    power_up: {
      triggers: ['觉醒', '获得能力', '开启', '领悟', '突破瓶颈', '奇遇'],
      type: 'append_list',
      autoApply: true,
      autoConfirm: false,
    },
    resource: {
      triggers: ['掌控', '资源', '产业', '势力范围', '收服'],
      type: 'map',
      autoApply: false,
      autoConfirm: true,
    },
    limitation: {
      triggers: ['被封印', '中毒', '诅咒', 'debuff', '限制', '压制', '束缚'],
      type: 'append_list',
      autoApply: true,
      autoConfirm: false,
    },
    location: {
      triggers: ['前往', '到达', '离开', '进入', '回到', '抵达', '出发', '赶路'],
      type: 'set_value',
      autoApply: true,
      autoConfirm: false,
    },
    alliance: {
      triggers: ['结盟', '敌对', '合作', '对立', '联手', '为敌', '支持', '反对'],
      type: 'set_value',
      autoApply: false,
      autoConfirm: true,
    },
    plot_flag: {
      triggers: ['完成', '达成', '通过', '战胜', '击败', '征服', '获得成就'],
      type: 'append_list',
      autoApply: true,
      autoConfirm: false,
    },
    foreshadow_tag: {
      triggers: ['伏笔', '暗示', '铺垫', '揭示', '真相大白', '谜底揭晓'],
      type: 'append_list',
      autoApply: false,
      autoConfirm: true,
    },
    arc_position: {
      triggers: [],
      type: 'computed',
      autoApply: true,
      autoConfirm: false,
      formula: 'chapterIndex / totalChapters * 100',
    },
  };

  /**
   * 从章节内容中检测角色状态变化
   *
   * @param characterId 角色ID
   * @param characterName 角色名称
   * @param chapterContent 章节内容
   * @param previousSnapshot 上一状态快照
   * @param chapterIndex 当前章节序号
   * @param totalChapters 总章节数
   */
  detectChanges(
    characterId: string,
    characterName: string,
    chapterContent: string,
    previousSnapshot: CharacterStateSnapshot,
    chapterIndex?: number,
    totalChapters?: number,
  ): StateChange[] {
    const changes: StateChange[] = [];

    // ═══ 规则引擎检测 ═══
    for (const [dimId, rules] of Object.entries(this.updateRules)) {
      if (rules.type === 'computed') {
        // arc_position 自动计算
        if (chapterIndex !== undefined && totalChapters !== undefined && totalChapters > 0) {
          const newValue = Math.min(100, Math.round((chapterIndex / totalChapters) * 100));
          if (newValue !== previousSnapshot.states[dimId]) {
            changes.push({
              dimension: dimId,
              changeType: 'computed',
              suggestedValue: newValue,
              autoApply: true,
              needsReview: false,
              confidence: 1.0,
            });
          }
        }
        continue;
      }

      // 触发词匹配
      for (const trigger of rules.triggers) {
        const context = this.extractContext(chapterContent, characterName, trigger);
        if (context) {
          const change: StateChange = {
            dimension: dimId,
            changeType: rules.type as ChangeType,
            detectedTrigger: trigger,
            suggestedValue: this.suggestValue(dimId, rules, context, previousSnapshot.states[dimId]),
            autoApply: rules.autoApply,
            needsReview: rules.autoConfirm,
            confidence: this.calculateConfidence(context, trigger),
          };

          // 数值型检查阈值
          if (rules.type === 'numeric_delta' && rules.autoThreshold) {
            const currentValue = previousSnapshot.states[dimId] as number || 0;
            const newValue = change.suggestedValue as number || 0;
            const delta = Math.abs(newValue - currentValue);

            if (delta > rules.autoThreshold) {
              change.needsReview = true;
              change.autoApply = false;
            }
            change.delta = newValue - currentValue;
          }

          changes.push(change);
          break; // 每个维度只匹配一次
        }
      }
    }

    return this.deduplicate(changes);
  }

  /**
   * 应用状态变更，生成新快照
   */
  applyChanges(
    previousSnapshot: CharacterStateSnapshot,
    changes: StateChange[],
    chapterId: string,
  ): CharacterStateSnapshot {
    const newStates = { ...previousSnapshot.states };
    const changedDimensions: string[] = [];
    const changeDescriptions: string[] = [];

    for (const change of changes) {
      if (!change.autoApply && change.needsReview) {
        // 需要人工确认，标记但不更新
        changedDimensions.push(change.dimension);
        changeDescriptions.push(
          `[待确认] ${DIMENSION_METADATA[change.dimension]?.name}: ${change.detectedTrigger || '未指定'}`,
        );
        continue;
      }

      const oldValue = newStates[change.dimension];
      const newValue = change.suggestedValue;

      // 应用变更
      switch (change.changeType) {
        case 'numeric_delta': {
          const current = (oldValue as number) || 0;
          const delta = (newValue as number) - current;
          newStates[change.dimension] = Math.max(0, Math.min(100, current + delta));
          changeDescriptions.push(
            `${DIMENSION_METADATA[change.dimension]?.name}: ${current} → ${newStates[change.dimension]} (${delta >= 0 ? '+' : ''}${delta})`,
          );
          break;
        }
        case 'set_value':
        case 'enum_set':
          newStates[change.dimension] = newValue;
          changeDescriptions.push(
            `${DIMENSION_METADATA[change.dimension]?.name}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`,
          );
          break;
        case 'append_list': {
          const list = Array.isArray(oldValue) ? [...(oldValue as unknown[])] : [];
          if (!list.includes(newValue)) {
            list.push(newValue);
          }
          newStates[change.dimension] = list;
          changeDescriptions.push(
            `${DIMENSION_METADATA[change.dimension]?.name}: 新增 ${newValue}`,
          );
          break;
        }
        case 'computed':
          newStates[change.dimension] = newValue;
          changeDescriptions.push(
            `${DIMENSION_METADATA[change.dimension]?.name}: ${oldValue} → ${newValue}`,
          );
          break;
      }

      changedDimensions.push(change.dimension);
    }

    return {
      snapshotId: this.generateId(),
      characterId: previousSnapshot.characterId,
      chapterId,
      timestamp: new Date(),
      states: newStates,
      changedDimensions: [...new Set(changedDimensions)],
      previousSnapshotId: previousSnapshot.snapshotId,
      createdBy: 'auto_detect',
      changeSummary: changeDescriptions.join('; '),
    };
  }

  /**
   * 创建初始状态快照
   */
  createInitialSnapshot(characterId: string, chapterId: string): CharacterStateSnapshot {
    return {
      snapshotId: this.generateId(),
      characterId,
      chapterId,
      timestamp: new Date(),
      states: { ...DEFAULT_CHARACTER_STATE },
      changedDimensions: Object.keys(DEFAULT_CHARACTER_STATE),
      createdBy: 'system',
      changeSummary: '初始状态',
    };
  }

  /**
   * 从文本中提取触发词上下文
   */
  private extractContext(text: string, characterName: string, trigger: string): string | null {
    // 查找角色名附近是否有触发词
    const nameIndex = text.indexOf(characterName);
    if (nameIndex === -1) return null;

    const triggerIndex = text.indexOf(trigger, Math.max(0, nameIndex - 50));
    if (triggerIndex === -1) return null;

    // 返回触发词周围的上下文 (前后50字)
    const start = Math.max(0, triggerIndex - 50);
    const end = Math.min(text.length, triggerIndex + trigger.length + 50);
    return text.slice(start, end);
  }

  /**
   * 根据规则和建议值推测变化后的值
   */
  private suggestValue(
    dimId: string,
    rules: UpdateRule,
    _context: string,
    currentValue: unknown,
  ): unknown {
    const meta = DIMENSION_METADATA[dimId];

    switch (meta.type) {
      case 'numeric':
      case 'numeric_delta':
        return currentValue as number;

      case 'enum':
        return currentValue as string;

      case 'list':
        return rules.detectedTrigger || '';

      case 'map':
        return currentValue as Record<string, unknown>;

      case 'computed':
        return currentValue as number;

      default:
        return currentValue;
    }
  }

  /**
   * 计算检测置信度
   */
  private calculateConfidence(_context: string, _trigger: string): number {
    // 简化版：规则匹配置信度固定为 0.85
    // 实际场景建议接入 LLM 辅助计算
    return 0.85;
  }

  /**
   * 去重（同维度保留置信度最高的）
   */
  private deduplicate(changes: StateChange[]): StateChange[] {
    const map = new Map<string, StateChange>();
    for (const change of changes) {
      const existing = map.get(change.dimension);
      if (!existing || change.confidence > existing.confidence) {
        map.set(change.dimension, change);
      }
    }
    return Array.from(map.values());
  }

  /**
   * 生成UUID
   */
  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
