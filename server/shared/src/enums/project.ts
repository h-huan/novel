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
  IDEA_DISCOVERY: 'idea_discovery',
  IDEA: 'idea',
  IMPORT: 'import',
  BLANK: 'blank',
} as const;
export type CreationSource = (typeof CreationSource)[keyof typeof CreationSource];

/**
 * 上述枚举的值清单 —— DTO @IsIn 的唯一来源，禁止在 DTO 里再手写副本。
 *
 * 副本会漂移：一旦某个 DTO 的清单少一项，就变成「前端能选、后端 400」，用户看到的是
 * 一个能点但永远失败的按钮。注意「用户可提交的状态」是 ProjectStatus 的真子集
 * （creating / generation_failed 由系统写入），所以状态那一份仍按子集显式书写，不从整表派生。
 */
export const PROJECT_TYPE_IDS: readonly ProjectType[] = Object.values(ProjectType);
export const CREATION_SOURCE_IDS: readonly CreationSource[] = Object.values(CreationSource);

/**
 * 目标平台（platform 维取值的唯一枚举）。
 *
 * 旧列 `platform_style` 是同一维度的历史列名，已由 `target_platform` 取代：它只作为写入投影存在，
 * 读取时最多作为【最后一位历史别名】补空，永不覆盖本标准（口径见 creative-constitution.ts 的
 * constitutionColumns 注释），所以这里不再有「与 platform_style 互补」这种双源说法。
 */
export const TargetPlatform = {
  ZHIHU: 'zhihu',
  FANQIE: 'fanqie',
  QIDIAN: 'qidian',
  DOUYIN: 'douyin',
  QIMAO: 'qimao',
  XIAOHONGSHU: 'xiaohongshu',
  JINJIANG: 'jinjiang',
  RULES_HORROR: 'rules_horror',
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
