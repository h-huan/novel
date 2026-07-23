export const ProjectStatus = {
  CREATING: 'creating',
  ACTIVE: 'active',
  GENERATION_FAILED: 'generation_failed',
  ARCHIVED: 'archived',
  COMPLETED: 'completed',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ProjectType = {
  SHORT_STORY: 'short_story',
  LONG_NOVEL: 'long_novel',
  SCRIPT: 'script',
} as const;
export type ProjectType = (typeof ProjectType)[keyof typeof ProjectType];

/** 创建来源 */
export const CreationSource = {
  INSPIRATION: 'inspiration',
  IDEA: 'idea',
  IMPORT: 'import',
  BLANK: 'blank',
} as const;
export type CreationSource = (typeof CreationSource)[keyof typeof CreationSource];

/** 目标平台（与 platform_style 互补） */
export const TargetPlatform = {
  ZHIHU: 'zhihu',
  FANQIE: 'fanqie',
  QIDIAN: 'qidian',
  DOUYIN: 'douyin',
  XIAOHONGSHU: 'xiaohongshu',
  CUSTOM: 'custom',
  GENERIC: 'generic',
} as const;
export type TargetPlatform = (typeof TargetPlatform)[keyof typeof TargetPlatform];

/** 创作流程阶段 */
export const WorkflowStage = {
  TOPIC: 'topic',
  IDEA_OR_INSPIRATION: 'idea_or_inspiration',
  WORLD_SETTING: 'world_setting',
  CHARACTER: 'character',
  OUTLINE: 'outline',
  VOLUME: 'volume',
  CHAPTER: 'chapter',
  WRITING: 'writing',
} as const;
export type WorkflowStage = (typeof WorkflowStage)[keyof typeof WorkflowStage];

/** 想法孵化状态 */
export const IdeaStatus = {
  NONE: 'none',
  DRAFT: 'draft',
  REFINING: 'refining',
  CONFIRMED: 'confirmed',
  CONVERTED: 'converted',
} as const;
export type IdeaStatus = (typeof IdeaStatus)[keyof typeof IdeaStatus];
