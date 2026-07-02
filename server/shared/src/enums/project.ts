export const ProjectStatus = {
  ACTIVE: 'active',
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
