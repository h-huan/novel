/**
 * WorkflowGuardService - 流程守卫核心服务
 *
 * 职责：
 * 1. 收集项目资产
 * 2. 推断当前阶段
 * 3. 构建短篇/长篇流程状态
 * 4. 检查操作是否允许
 * 5. 推进阶段
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProjectRepository } from '../../database/repositories/project.repository';
import { WorldSettingService } from '../world-setting/world-setting.service';
import { CharacterService } from '../character/character.service';
import { OutlineService } from '../outline/outline.service';
import { ChapterService } from '../chapter/chapter.service';
import { ForeshadowingService } from '../foreshadowing/foreshadowing.service';
import { ProjectService } from '../project/project.service';
import { buildShortStoryGuard, buildLongNovelGuard } from './workflow-rules';
import type {
  ProjectAssets,
  WorkflowGuardResponse,
  CheckActionResponse,
  AdvanceStageResponse,
  AllowedAction,
  BlockedAction,
} from './types';
import { SHORT_STAGE_LABELS, LONG_STAGE_LABELS } from './types';

@Injectable()
export class WorkflowGuardService {
  private readonly logger = new Logger(WorkflowGuardService.name);

  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectService: ProjectService,
    private readonly worldSettingService: WorldSettingService,
    private readonly characterService: CharacterService,
    private readonly outlineService: OutlineService,
    private readonly chapterService: ChapterService,
    private readonly foreshadowingService: ForeshadowingService,
  ) {}

  /**
   * 获取项目完整流程守卫状态
   */
  getGuard(projectId: string): WorkflowGuardResponse {
    const project = this.projectRepo.findById(projectId);
    if (!project) throw new NotFoundException(`项目不存在: ${projectId}`);

    const assets = this.collectProjectAssets(project);
    const currentStage = this.inferCurrentStage(project, assets);
    const projectType = project.type;

    let stageResult: any;
    if (projectType === 'short_story') {
      stageResult = buildShortStoryGuard(assets, currentStage);
    } else {
      stageResult = buildLongNovelGuard(assets, currentStage);
    }

    return {
      projectId,
      projectType,
      creationSource: project.creation_source || 'blank',
      currentStage,
      currentStageLabel: stageResult.currentStageLabel,
      recommendedNextStage: stageResult.recommendedNextStage,
      recommendedNextAction: stageResult.recommendedNextAction,
      progressPercent: stageResult.progressPercent,
      canProceed: stageResult.canProceed,
      allowedActions: stageResult.allowedActions,
      blockedActions: stageResult.blockedActions,
      missingAssets: stageResult.missingAssets,
      completedAssets: stageResult.completedAssets,
      warnings: stageResult.warnings || [],
      stageMap: stageResult.stageMap,
    };
  }

  /**
   * 检查某个操作是否允许
   */
  checkAction(projectId: string, action: string): CheckActionResponse {
    const guard = this.getGuard(projectId);

    const allowedAction = guard.allowedActions.find((a) => a.key === action);
    const blockedAction = guard.blockedActions.find((a) => a.key === action);

    if (allowedAction) {
      return {
        allowed: true,
        action,
        reason: '',
        missingAssets: [],
        warnings: guard.warnings.map((w) => w.message),
      };
    }

    if (blockedAction) {
      return {
        allowed: false,
        action,
        reason: blockedAction.reason,
        missingAssets: guard.missingAssets.map((m) => m.key),
        warnings: guard.warnings.map((w) => w.message),
      };
    }

    // 未明确列出的操作，默认允许（白名单模式）
    return {
      allowed: true,
      action,
      reason: '',
      missingAssets: [],
      warnings: guard.warnings.map((w) => w.message),
    };
  }

  /**
   * 推进当前阶段
   */
  advanceStage(projectId: string, targetStage: string, force = false): AdvanceStageResponse {
    const project = this.projectRepo.findById(projectId);
    if (!project) throw new NotFoundException(`项目不存在: ${projectId}`);

    const previousStage = project.current_workflow_stage || 'idea_or_inspiration';
    const projectType = project.type;

    // 验证目标阶段是否合法
    if (projectType === 'short_story') {
      if (!['topic', 'outline', 'writing'].includes(targetStage)) {
        throw new BadRequestException(`短篇不支持阶段: ${targetStage}`);
      }
    } else {
      const validStages = [
        'idea_or_inspiration', 'world_setting', 'character', 'outline',
        'volume', 'chapter', 'writing', 'state_archive', 'weekly_review',
      ];
      if (!validStages.includes(targetStage)) {
        throw new BadRequestException(`长篇不支持阶段: ${targetStage}`);
      }
    }

    // 非 force 模式检查是否可以进入
    if (!force) {
      const guard = this.getGuard(projectId);
      if (!guard.canProceed && targetStage !== previousStage) {
        throw new BadRequestException(
          `当前阶段不允许推进到 ${targetStage}：${guard.recommendedNextAction}`,
        );
      }
    }

    // 更新阶段
    this.projectRepo.update(projectId, {
      current_workflow_stage: targetStage,
      updated_at: new Date().toISOString(),
    });

    return {
      projectId,
      previousStage,
      currentStage: targetStage,
      message: `已进入${this.getStageLabel(projectType, targetStage)}阶段`,
    };
  }

  /**
   * 收集项目资产
   */
  private collectProjectAssets(project: any): ProjectAssets {
    const projectId = project.id;

    // 世界观数量
    let worldSettingCount = 0;
    try {
      const worldSettings = this.worldSettingService.findByProjectId(projectId);
      worldSettingCount = worldSettings.length;
    } catch (e) {
      this.logger.warn(`[WorkflowGuard] 读取世界观失败: ${e}`);
    }

    // 角色数量
    let characterCount = 0;
    let mainCharacterCount = 0;
    let antagonistCount = 0;
    try {
      const characters = this.characterService.findByProjectId(projectId);
      characterCount = characters.length;
      mainCharacterCount = characters.filter((c) => c.isPovCharacter || c.role === 'protagonist').length;
      antagonistCount = characters.filter((c) => c.role === 'villain' || c.role === 'antagonist').length;
    } catch (e) {
      this.logger.warn(`[WorkflowGuard] 读取角色失败: ${e}`);
    }

    // 大纲数量
    let outlineCount = 0;
    let bookOutlineCount = 0;
    let volumeOutlineCount = 0;
    let chapterPlanCount = 0;
    try {
      const outlines = this.outlineService.findByProjectId(projectId);
      outlineCount = outlines.length;
      bookOutlineCount = outlines.filter((o) => o.level === 'book').length;
      volumeOutlineCount = outlines.filter((o) => o.level === 'volume').length;
      chapterPlanCount = outlines.filter((o) => o.level === 'chapter').length;
    } catch (e) {
      this.logger.warn(`[WorkflowGuard] 读取大纲失败: ${e}`);
    }

    // 章节数量
    let chapterCount = 0;
    let chapterWithBodyCount = 0;
    try {
      const chapters = this.chapterService.findByProjectId(projectId);
      chapterCount = chapters.length;
      chapterWithBodyCount = chapters.filter((c) => (c as any).content || (c as any).wordCount).length;
    } catch (e) {
      this.logger.warn(`[WorkflowGuard] 读取章节失败: ${e}`);
    }

    // 伏笔数量
    let foreshadowingCount = 0;
    try {
      const foreshadowings = this.foreshadowingService.findByProjectId(projectId);
      foreshadowingCount = foreshadowings.length;
    } catch (e) {
      this.logger.warn(`[WorkflowGuard] 读取伏笔失败: ${e}`);
    }

    return {
      project: project as any,
      worldSettingCount,
      characterCount,
      mainCharacterCount: Math.max(mainCharacterCount, characterCount > 0 ? 1 : 0),
      antagonistCount,
      outlineCount,
      bookOutlineCount,
      volumeOutlineCount,
      chapterPlanCount,
      chapterCount,
      chapterWithBodyCount,
      foreshadowingCount,
      pendingStateCount: 0,
      confirmedStateCount: 0,
      hasIdea: !!(project.idea_seed),
      hasConfirmedIdea: !!(project.confirmed_idea),
      hasWorldSetting: worldSettingCount > 0,
      hasMainCharacter: characterCount > 0,
      hasAntagonist: antagonistCount > 0,
      hasOutline: outlineCount > 0,
      hasBookOutline: bookOutlineCount > 0,
      hasVolumeOutline: volumeOutlineCount > 0,
      hasChapterPlan: chapterPlanCount > 0,
      hasBody: chapterWithBodyCount > 0,
    };
  }

  /**
   * 推断当前阶段
   */
  private inferCurrentStage(project: any, assets: ProjectAssets): string {
    const projectType = project.type;
    const currentStage = project.current_workflow_stage;

    // 如果已有明确的 current_workflow_stage，直接使用
    if (currentStage && currentStage !== 'idea' && currentStage !== '') {
      if (projectType === 'short_story' && ['topic', 'outline', 'writing'].includes(currentStage)) {
        return currentStage;
      }
      if (projectType === 'long_novel') {
        const validStages = [
          'idea_or_inspiration', 'world_setting', 'character', 'outline',
          'volume', 'chapter', 'writing', 'state_archive', 'weekly_review',
        ];
        if (validStages.includes(currentStage)) {
          return currentStage;
        }
      }
    }

    // 无明确阶段时，根据资产推断
    if (projectType === 'short_story') {
      if (assets.hasOutline) return 'outline';
      return 'topic';
    }

    // 长篇推断
    if (assets.hasBody) return 'writing';
    if (assets.hasChapterPlan) return 'chapter';
    if (assets.hasVolumeOutline) return 'volume';
    if (assets.hasBookOutline) return 'outline';
    if (assets.hasMainCharacter && assets.hasWorldSetting) return 'character';
    if (assets.hasWorldSetting) return 'world_setting';
    return 'idea_or_inspiration';
  }

  private getStageLabel(type: string, stage: string): string {
    if (type === 'short_story') return SHORT_STAGE_LABELS[stage] || stage;
    return LONG_STAGE_LABELS[stage] || stage;
  }
}
