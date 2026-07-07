/**
 * WorkflowGuard 类型定义
 */
import type { ProjectRow } from '../../database/repositories/project.repository';

// ========== 项目资产 ==========

export interface ProjectAssets {
  project: ProjectRow;
  worldSettingCount: number;
  characterCount: number;
  mainCharacterCount: number;
  antagonistCount: number;
  outlineCount: number;
  bookOutlineCount: number;
  volumeOutlineCount: number;
  chapterPlanCount: number;
  chapterCount: number;
  chapterWithBodyCount: number;
  foreshadowingCount: number;
  pendingStateCount: number;
  confirmedStateCount: number;
  hasIdea: boolean;
  hasConfirmedIdea: boolean;
  hasWorldSetting: boolean;
  hasMainCharacter: boolean;
  hasAntagonist: boolean;
  hasOutline: boolean;
  hasBookOutline: boolean;
  hasVolumeOutline: boolean;
  hasChapterPlan: boolean;
  hasBody: boolean;
}

// ========== 流程守卫响应 ==========

export interface StageMapItem {
  key: string;
  label: string;
  status: 'done' | 'current' | 'next' | 'locked' | 'warning';
}

export interface AllowedAction {
  key: string;
  label: string;
  targetRoute?: string;
}

export interface BlockedAction {
  key: string;
  label: string;
  reason: string;
}

export interface AssetItem {
  key: string;
  label: string;
  severity: 'required' | 'recommended';
  reason: string;
}

export interface CompletedAssetItem {
  key: string;
  label: string;
}

export interface WarningItem {
  key: string;
  message: string;
}

export interface WorkflowGuardResponse {
  projectId: string;
  projectType: string;
  creationSource: string;
  currentStage: string;
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

export interface CheckActionRequest {
  action: string;
}

export interface CheckActionResponse {
  allowed: boolean;
  action: string;
  reason: string;
  missingAssets: string[];
  warnings: string[];
  currentStage?: string;
  recommendedNextAction?: string;
}

export interface AdvanceStageRequest {
  targetStage: string;
  force?: boolean;
}

export interface AdvanceStageResponse {
  projectId: string;
  previousStage: string;
  currentStage: string;
  message: string;
}

// ========== 流程常量 ==========

export const SHORT_STORY_STAGES = ['topic', 'outline', 'writing'] as const;
export type ShortStoryStage = (typeof SHORT_STORY_STAGES)[number];

export const LONG_NOVEL_STAGES = [
  'idea_or_inspiration',
  'world_setting',
  'character',
  'outline',
  'volume',
  'chapter',
  'writing',
  'state_archive',
  'weekly_review',
] as const;
export type LongNovelStage = (typeof LONG_NOVEL_STAGES)[number];

export const SHORT_STAGE_LABELS: Record<string, string> = {
  topic: '题材',
  outline: '大纲',
  writing: '正文',
};

export const LONG_STAGE_LABELS: Record<string, string> = {
  idea_or_inspiration: '想法',
  world_setting: '世界观',
  character: '人物',
  outline: '总纲',
  volume: '分卷',
  chapter: '章节',
  writing: '正文',
  state_archive: '状态归档',
  weekly_review: '周复盘',
};
