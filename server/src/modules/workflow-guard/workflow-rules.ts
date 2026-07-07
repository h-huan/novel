/**
 * WorkflowRules - 短篇/长篇流程规则定义
 *
 * 定义每个阶段的目标、允许操作、不建议操作、缺失资产判断逻辑。
 * 不依赖 Service，纯规则函数。
 */
import type { ProjectAssets, AllowedAction, BlockedAction, AssetItem, CompletedAssetItem, StageMapItem, WarningItem } from './types';
import { SHORT_STAGE_LABELS, LONG_STAGE_LABELS } from './types';

// ========== 短篇规则 ==========

export interface ShortStoryStageResult {
  currentStageLabel: string;
  recommendedNextStage: string;
  recommendedNextAction: string;
  progressPercent: number;
  canProceed: boolean;
  allowedActions: AllowedAction[];
  blockedActions: BlockedAction[];
  missingAssets: AssetItem[];
  completedAssets: CompletedAssetItem[];
  warnings: WarningItem[];
  stageMap: StageMapItem[];
}

function shortStageMap(currentStage: string, hasOutline: boolean, hasBody: boolean): StageMapItem[] {
  const stageKeys = ['topic', 'outline', 'writing'];
  return stageKeys.map((key) => {
    const idx = stageKeys.indexOf(key);
    const curIdx = stageKeys.indexOf(currentStage);
    let status: StageMapItem['status'] = 'locked';
    if (idx < curIdx) status = 'done';
    else if (idx === curIdx) status = 'current';
    else if (idx === curIdx + 1) status = 'next';
    return { key, label: SHORT_STAGE_LABELS[key] || key, status };
  });
}

export function buildShortStoryGuard(assets: ProjectAssets, currentStage: string): ShortStoryStageResult {
  const stage = SHORT_STAGE_LABELS[currentStage] || currentStage;
  const { project } = assets;

  const allowedActions: AllowedAction[] = [];
  const blockedActions: BlockedAction[] = [];
  const missingAssets: AssetItem[] = [];
  const completedAssets: CompletedAssetItem[] = [];
  const warnings: { key: string; message: string }[] = [];

  // ===== 已完成资产 =====
  if (assets.hasIdea || assets.hasConfirmedIdea) {
    completedAssets.push({ key: 'idea', label: '创作想法' });
  }
  if (assets.project.description) {
    completedAssets.push({ key: 'description', label: '作品描述' });
  }
  if (assets.project.target_platform && assets.project.target_platform !== 'generic') {
    completedAssets.push({ key: 'platform', label: '目标平台' });
  }

  // ===== 通用允许操作 =====
  allowedActions.push(
    { key: 'edit_project', label: '编辑基础设定', targetRoute: '' },
  );

  if (currentStage === 'topic') {
    // ===== topic 阶段 =====
    allowedActions.push(
      { key: 'edit_topic', label: '完善题材', targetRoute: '' },
      { key: 'generate_topic', label: '生成题材建议' },
      { key: 'generate_outline', label: '生成大纲', targetRoute: `/project/${project.id}/outline` },
    );

    // 如果有题材或确认想法，可以进入大纲
    if (assets.hasConfirmedIdea || assets.hasOutline) {
      allowedActions.push({ key: 'enter_outline', label: '进入大纲', targetRoute: `/project/${project.id}/outline` });
    }

    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '当前还缺少大纲，请先完成题材和大纲阶段' },
      { key: 'continue_body', label: '续写正文', reason: '当前还缺少正文阶段，请先完成题材和大纲' },
      { key: 'export_project', label: '导出终稿', reason: '当前还没有正文，不能导出终稿' },
    );

    // 缺失资产
    if (!assets.hasConfirmedIdea && !assets.hasOutline) {
      missingAssets.push({ key: 'confirmed_idea', label: '确认想法', severity: 'required', reason: '正文生成前需要先明确题材和钩子' });
    }
    if (!assets.hasOutline) {
      missingAssets.push({ key: 'outline', label: '大纲', severity: 'required', reason: '短篇正文生成前需要先有大纲' });
    }

    // 建议
    const nextStage = 'outline';
    const nextAction = '先完善短篇题材，确认想法后再生成大纲';

  }

  if (currentStage === 'outline') {
    // ===== outline 阶段 =====
    allowedActions.push(
      { key: 'edit_outline', label: '编辑大纲', targetRoute: `/project/${project.id}/outline` },
      { key: 'generate_outline', label: '生成大纲' },
    );

    // 如果已有大纲，可以进入正文
    if (assets.hasOutline) {
      allowedActions.push({ key: 'enter_writing', label: '进入正文', targetRoute: `/project/${project.id}/writing` });
    }

    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '请先生成并确认大纲' },
      { key: 'continue_body', label: '续写正文', reason: '请先生成并确认大纲，再进入正文阶段' },
    );

    if (!assets.hasOutline) {
      missingAssets.push({ key: 'outline', label: '大纲', severity: 'required', reason: '正文生成前需要先有大纲' });
    }
  }

  if (currentStage === 'writing') {
    // ===== writing 阶段 =====
    allowedActions.push(
      { key: 'edit_outline', label: '查看大纲', targetRoute: `/project/${project.id}/outline` },
      { key: 'refine_body', label: '精修正文', targetRoute: `/project/${project.id}/refinement` },
    );

    if (assets.hasOutline) {
      allowedActions.push(
        { key: 'generate_body', label: '生成正文', targetRoute: `/project/${project.id}/writing` },
        { key: 'continue_body', label: '续写正文', targetRoute: `/project/${project.id}/writing` },
      );
    } else {
      blockedActions.push(
        { key: 'generate_body', label: '生成正文', reason: '短篇正文生成前必须先有大纲' },
        { key: 'continue_body', label: '续写正文', reason: '短篇续写前必须先有大纲' },
      );
    }

    if (!assets.hasBody) {
      missingAssets.push({ key: 'body', label: '正文', severity: 'recommended', reason: '当前还没有正文内容' });
    }
  }

  // ===== 推断当前阶段并构建返回 =====
  const result = buildShortStoryResult(currentStage, assets, allowedActions, blockedActions, missingAssets, completedAssets, warnings);

  return result;
}

function buildShortStoryResult(
  currentStage: string,
  assets: ProjectAssets,
  allowedActions: AllowedAction[],
  blockedActions: BlockedAction[],
  missingAssets: AssetItem[],
  completedAssets: CompletedAssetItem[],
  warnings: { key: string; message: string }[],
): ShortStoryStageResult {
  const stageLabel = SHORT_STAGE_LABELS[currentStage] || currentStage;
  const stageMap = shortStageMap(currentStage, assets.hasOutline, assets.hasBody);

  let recommendedNextStage = '';
  let recommendedNextAction = '';
  let canProceed = true;

  if (currentStage === 'topic') {
    recommendedNextStage = 'outline';
    recommendedNextAction = missingAssets.length > 0
      ? '建议先完成题材设定，确认想法后再进入大纲阶段'
      : '题材已明确，可以进入大纲阶段';
    canProceed = missingAssets.length <= 1;
  } else if (currentStage === 'outline') {
    recommendedNextStage = 'writing';
    recommendedNextAction = assets.hasOutline
      ? '大纲已就绪，可以进入正文阶段'
      : '请先生成大纲后再进入正文阶段';
    canProceed = assets.hasOutline;
  } else if (currentStage === 'writing') {
    recommendedNextStage = 'writing';
    recommendedNextAction = assets.hasBody
      ? '继续写作，完成后进行质量检查'
      : '尚未生成正文，建议先生成第一章';
    canProceed = true;
  }

  // 禁止的操作
  const progressPercent = computeShortProgress(currentStage);

  return {
    currentStageLabel: stageLabel,
    recommendedNextStage,
    recommendedNextAction,
    progressPercent,
    canProceed,
    allowedActions,
    blockedActions,
    missingAssets,
    completedAssets,
    warnings,
    stageMap,
  };
}

function computeShortProgress(currentStage: string): number {
  const map: Record<string, number> = { topic: 20, outline: 50, writing: 75 };
  return map[currentStage] || 10;
}

// ========== 长篇规则 ==========

export interface LongNovelStageResult {
  currentStageLabel: string;
  recommendedNextStage: string;
  recommendedNextAction: string;
  progressPercent: number;
  canProceed: boolean;
  allowedActions: AllowedAction[];
  blockedActions: BlockedAction[];
  missingAssets: AssetItem[];
  completedAssets: CompletedAssetItem[];
  warnings: WarningItem[];
  stageMap: StageMapItem[];
}

function longStageMap(currentStage: string): StageMapItem[] {
  const stageKeys = [
    'idea_or_inspiration', 'world_setting', 'character', 'outline',
    'volume', 'chapter', 'writing', 'state_archive', 'weekly_review',
  ];
  return stageKeys.map((key) => {
    const idx = stageKeys.indexOf(key);
    const curIdx = stageKeys.indexOf(currentStage);
    let status: StageMapItem['status'] = 'locked';
    if (idx < curIdx) status = 'done';
    else if (idx === curIdx) status = 'current';
    else if (idx === curIdx + 1) status = 'next';
    return { key, label: LONG_STAGE_LABELS[key] || key, status };
  });
}

export function buildLongNovelGuard(assets: ProjectAssets, currentStage: string): LongNovelStageResult {
  const stageLabel = LONG_STAGE_LABELS[currentStage] || currentStage;
  const { project } = assets;

  const allowedActions: AllowedAction[] = [];
  const blockedActions: BlockedAction[] = [];
  const missingAssets: AssetItem[] = [];
  const completedAssets: CompletedAssetItem[] = [];
  const warnings: { key: string; message: string }[] = [];

  // ===== 已完成资产 =====
  if (assets.hasIdea || assets.hasConfirmedIdea) {
    completedAssets.push({ key: 'idea', label: '创作想法' });
  }
  if (assets.hasWorldSetting) {
    completedAssets.push({ key: 'world_setting', label: '世界观' });
  }
  if (assets.hasMainCharacter) {
    completedAssets.push({ key: 'main_character', label: '主角' });
  }
  if (assets.hasAntagonist) {
    completedAssets.push({ key: 'antagonist', label: '反派/阻力' });
  }
  if (assets.hasBookOutline) {
    completedAssets.push({ key: 'book_outline', label: '总纲' });
  }
  if (assets.hasVolumeOutline) {
    completedAssets.push({ key: 'volume_outline', label: '分卷' });
  }
  if (assets.hasChapterPlan) {
    completedAssets.push({ key: 'chapter_plan', label: '章节规划' });
  }
  if (assets.hasBody) {
    completedAssets.push({ key: 'body', label: '正文' });
  }

  // ===== 通用允许操作 =====
  allowedActions.push(
    { key: 'edit_project', label: '编辑基础设定', targetRoute: '' },
  );

  if (currentStage === 'idea_or_inspiration') {
    // ===== 想法阶段 =====
    allowedActions.push(
      { key: 'edit_idea', label: '完善想法' },
      { key: 'enter_world', label: '进入世界观', targetRoute: `/project/${project.id}/world` },
      { key: 'enter_character', label: '进入角色设定', targetRoute: `/project/${project.id}/characters` },
    );

    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '当前还处于想法阶段，需要先建立世界观和角色' },
      { key: 'continue_body', label: '续写正文', reason: '当前还处于想法阶段，不能续写正文' },
      { key: 'generate_outline', label: '生成总纲', reason: '请先完成世界观和主角设定后再生成总纲' },
      { key: 'generate_volume', label: '生成分卷', reason: '请先完成总纲后再生成分卷' },
      { key: 'generate_chapter_plan', label: '生成章节规划', reason: '请先完成世界观、角色和总纲' },
      { key: 'export_project', label: '导出终稿', reason: '当前还没有正文，不能导出终稿' },
    );

    if (!assets.hasWorldSetting) {
      missingAssets.push({ key: 'world_setting', label: '世界观', severity: 'required', reason: '长篇需要先建立世界观基础' });
    }
    if (!assets.hasMainCharacter) {
      missingAssets.push({ key: 'main_character', label: '主角', severity: 'required', reason: '长篇需要明确主角设定' });
    }
    if (!assets.hasOutline) {
      missingAssets.push({ key: 'outline', label: '总纲', severity: 'recommended', reason: '建议在进入分卷前先有总纲' });
    }
  }

  if (currentStage === 'world_setting') {
    // ===== 世界观阶段 =====
    allowedActions.push(
      { key: 'edit_world', label: '编辑世界观', targetRoute: `/project/${project.id}/world` },
      { key: 'enter_character', label: '进入角色设定', targetRoute: `/project/${project.id}/characters` },
    );

    if (assets.hasWorldSetting) {
      allowedActions.push({ key: 'enter_outline', label: '进入总纲', targetRoute: `/project/${project.id}/outline` });
    }

    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '世界观尚不完整，请先完成世界观和角色设定' },
      { key: 'continue_body', label: '续写正文', reason: '当前还未进入正文阶段，不能续写正文' },
      { key: 'generate_outline', label: '生成总纲', reason: '请先完成世界观和主角设定后再生成总纲' },
      { key: 'generate_volume', label: '生成分卷', reason: '请先完成总纲后再生成分卷' },
      { key: 'generate_chapter_plan', label: '生成章节规划', reason: '请先完成总纲和分卷后再生成章节规划' },
    );

    if (!assets.hasWorldSetting) {
      missingAssets.push({ key: 'world_setting', label: '世界观', severity: 'required', reason: '需要建立世界观设定' });
    }
    if (!assets.hasMainCharacter) {
      missingAssets.push({ key: 'main_character', label: '主角', severity: 'required', reason: '需要明确主角设定' });
    }
  }

  if (currentStage === 'character') {
    // ===== 角色阶段 =====
    allowedActions.push(
      { key: 'edit_character', label: '编辑角色', targetRoute: `/project/${project.id}/characters` },
      { key: 'enter_world', label: '去完善世界观', targetRoute: `/project/${project.id}/world` },
    );

    if (assets.hasMainCharacter) {
      allowedActions.push({ key: 'enter_outline', label: '进入总纲', targetRoute: `/project/${project.id}/outline` });
    }

    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '当前还未完成总纲、分卷和章节规划，不能生成正文' },
      { key: 'continue_body', label: '续写正文', reason: '当前还未进入正文阶段，不能续写正文' },
      { key: 'generate_volume', label: '生成分卷', reason: '请先进入总纲阶段并完成总纲' },
      { key: 'generate_chapter_plan', label: '生成章节规划', reason: '请先完成总纲和分卷后再生成章节规划' },
    );

    if (!assets.hasMainCharacter) {
      missingAssets.push({ key: 'main_character', label: '主角', severity: 'required', reason: '需要至少有一个主角' });
    }
    if (!assets.hasAntagonist) {
      missingAssets.push({ key: 'antagonist', label: '反派/阻力', severity: 'recommended', reason: '建议设定主要反派或阻力角色' });
    }
  }

  if (currentStage === 'outline') {
    // ===== 总纲阶段 =====
    allowedActions.push(
      { key: 'edit_outline', label: '编辑总纲', targetRoute: `/project/${project.id}/outline` },
      { key: 'generate_outline', label: '生成总纲' },
    );

    if (assets.hasBookOutline) {
      allowedActions.push({ key: 'enter_volume', label: '进入分卷', targetRoute: `/project/${project.id}/outline` });
    }

    if (!assets.hasBookOutline) {
      missingAssets.push({ key: 'book_outline', label: '总纲', severity: 'required', reason: '需要先生成全书总纲' });
    }
    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '请先完成总纲、分卷和章节规划' },
      { key: 'continue_body', label: '续写正文', reason: '当前还未进入正文阶段，不能续写正文' },
      { key: 'generate_volume', label: '生成分卷', reason: assets.hasBookOutline ? '请先进入分卷阶段' : '请先生成总纲' },
      { key: 'generate_chapter_plan', label: '生成章节规划', reason: '请先完成分卷后再生成章节规划' },
    );
  }

  if (currentStage === 'volume') {
    // ===== 分卷阶段 =====
    allowedActions.push(
      { key: 'edit_volume', label: '编辑分卷', targetRoute: `/project/${project.id}/outline` },
      { key: 'generate_volume', label: '生成分卷' },
    );

    if (assets.hasVolumeOutline) {
      allowedActions.push({ key: 'enter_chapter', label: '进入章节规划', targetRoute: `/project/${project.id}/outline` });
    }

    if (!assets.hasVolumeOutline) {
      missingAssets.push({ key: 'volume_outline', label: '分卷', severity: 'required', reason: '需要先规划分卷' });
    }
    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '请先完成章节规划后再生成正文' },
      { key: 'continue_body', label: '续写正文', reason: '当前还未进入正文阶段，不能续写正文' },
      { key: 'generate_chapter_plan', label: '生成章节规划', reason: assets.hasVolumeOutline ? '请先进入章节规划阶段' : '请先生成分卷' },
    );
  }

  if (currentStage === 'chapter') {
    // ===== 章节阶段 =====
    allowedActions.push(
      { key: 'edit_chapter_plan', label: '编辑章节规划', targetRoute: `/project/${project.id}/outline` },
      { key: 'generate_chapter_plan', label: '生成章节规划' },
    );

    if (assets.hasChapterPlan) {
      allowedActions.push({ key: 'enter_writing', label: '进入正文', targetRoute: `/project/${project.id}/writing` });
    }

    if (!assets.hasChapterPlan) {
      missingAssets.push({ key: 'chapter_plan', label: '章节规划', severity: 'required', reason: '需要先规划章节' });
    }
    blockedActions.push(
      { key: 'generate_body', label: '生成正文', reason: '请先完成章节规划并进入正文阶段' },
      { key: 'continue_body', label: '续写正文', reason: '当前还未进入正文阶段，不能续写正文' },
    );
  }

  if (currentStage === 'writing') {
    // ===== 正文阶段 =====
    allowedActions.push(
      { key: 'enter_writing', label: '写正文', targetRoute: `/project/${project.id}/writing` },
      { key: 'refine_body', label: '精修正文', targetRoute: `/project/${project.id}/refinement` },
      { key: 'enter_state', label: '查看状态', targetRoute: `/project/${project.id}/state` },
    );

    if (assets.hasChapterPlan) {
      allowedActions.push(
        { key: 'generate_body', label: '生成正文', targetRoute: `/project/${project.id}/writing` },
        { key: 'continue_body', label: '续写', targetRoute: `/project/${project.id}/writing` },
      );
    } else {
      blockedActions.push(
        { key: 'generate_body', label: '生成正文', reason: '长篇正文生成前必须先有章节规划' },
        { key: 'continue_body', label: '续写', reason: '长篇续写前必须先有章节规划' },
      );
    }

    if (assets.pendingStateCount > 0) {
      warnings.push({ key: 'pending_states', message: `有 ${assets.pendingStateCount} 个待确认状态，建议尽快处理` });
    }

    if (!assets.hasBody) {
      missingAssets.push({ key: 'body', label: '正文', severity: 'recommended', reason: '当前还没有正文内容' });
    }
  }

  if (currentStage === 'state_archive') {
    allowedActions.push(
      { key: 'enter_state', label: '查看状态', targetRoute: `/project/${project.id}/state` },
      { key: 'enter_writing', label: '返回写作', targetRoute: `/project/${project.id}/writing` },
    );

    if (assets.pendingStateCount > 0) {
      warnings.push({ key: 'pending_states', message: `有 ${assets.pendingStateCount} 个待确认状态需要处理` });
    }
  }

  if (currentStage === 'weekly_review') {
    allowedActions.push(
      { key: 'enter_writing', label: '返回写作', targetRoute: `/project/${project.id}/writing` },
    );
    warnings.push({ key: 'weekly_review', message: '建议定期进行周复盘，检查节奏、伏笔和人物成长' });
  }

  // ===== 构建返回 =====
  const stageMap = longStageMap(currentStage);

  let recommendedNextStage = '';
  let recommendedNextAction = '';
  let canProceed = true;

  if (currentStage === 'idea_or_inspiration') {
    recommendedNextStage = 'world_setting';
    recommendedNextAction = '建议先建立世界观和角色设定';
    canProceed = assets.hasWorldSetting || assets.hasMainCharacter;
  } else if (currentStage === 'world_setting') {
    recommendedNextStage = 'character';
    recommendedNextAction = assets.hasWorldSetting ? '世界观已建立，建议进入角色设定' : '请先建立世界观';
    canProceed = assets.hasWorldSetting;
  } else if (currentStage === 'character') {
    recommendedNextStage = 'outline';
    recommendedNextAction = assets.hasMainCharacter ? '角色已设定，建议进入总纲' : '请先设定主角';
    canProceed = assets.hasMainCharacter;
  } else if (currentStage === 'outline') {
    recommendedNextStage = 'volume';
    recommendedNextAction = assets.hasBookOutline ? '总纲已就绪，建议进入分卷规划' : '请先生成总纲';
    canProceed = assets.hasBookOutline;
  } else if (currentStage === 'volume') {
    recommendedNextStage = 'chapter';
    recommendedNextAction = assets.hasVolumeOutline ? '分卷已规划，建议进入章节规划' : '请先规划分卷';
    canProceed = assets.hasVolumeOutline;
  } else if (currentStage === 'chapter') {
    recommendedNextStage = 'writing';
    recommendedNextAction = assets.hasChapterPlan ? '章节已规划，建议进入正文写作' : '请先规划章节';
    canProceed = assets.hasChapterPlan;
  } else if (currentStage === 'writing') {
    recommendedNextStage = 'state_archive';
    recommendedNextAction = assets.hasBody ? '继续写作，完成后进行状态归档' : '尚未生成正文，建议先写第一章';
    canProceed = true;
  } else if (currentStage === 'state_archive') {
    recommendedNextStage = 'weekly_review';
    recommendedNextAction = '状态归档后建议进行周复盘';
    canProceed = true;
  } else if (currentStage === 'weekly_review') {
    recommendedNextStage = 'writing';
    recommendedNextAction = '周复盘后可以继续写作';
    canProceed = true;
  }

  const progressPercent = computeLongProgress(currentStage);

  return {
    currentStageLabel: stageLabel,
    recommendedNextStage,
    recommendedNextAction,
    progressPercent,
    canProceed,
    allowedActions,
    blockedActions,
    missingAssets,
    completedAssets,
    warnings,
    stageMap,
  };
}

function computeLongProgress(currentStage: string): number {
  const map: Record<string, number> = {
    idea_or_inspiration: 10,
    world_setting: 20,
    character: 30,
    outline: 40,
    volume: 50,
    chapter: 60,
    writing: 70,
    state_archive: 85,
    weekly_review: 90,
  };
  return map[currentStage] || 10;
}
