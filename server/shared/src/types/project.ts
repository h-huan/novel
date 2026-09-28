import {
  ProjectStatus,
  ProjectType,
  TargetPlatform,
  WorkflowStage,
} from '../enums/project';

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  status: ProjectStatus;
  description: string;
  wordCount: number;
  chapterCount: number;
  coverImage?: string;
  platforms?: string[];
  /** 目标平台 */
  targetPlatform: TargetPlatform;
  /** 目标字数 */
  targetWords: number;
  /** 所有创作标签、平台规则和篇幅约束的唯一事实源 */
  creativeConstitution?: {
    schemaVersion: 1;
    revision: number;
    projectType: string;
    targetPlatform: string;
    /** 自定义平台说明：targetPlatform === 'custom' 时它就是平台维度的执行值 */
    customPlatformNote?: string;
    targetWords: number;
    category: string;
    storyTone: string[];
    writingStyle: unknown;
    webNovelGenre: string[];
    submissionTags: string[];
    plotTags: string[];
    genreFitNote: string;
    pov: string;
    targetAudience: unknown;
    confirmedStory?: Record<string, unknown>;
    chapterWordRange: { min: number; max: number };
    platformRules: unknown;
  };
  /** 项目卡与创作规划配置；所有生成流程必须按此执行 */
  settings?: Record<string, unknown>;
  /** 当前创作阶段 */
  currentWorkflowStage: WorkflowStage;
  createdAt: Date;
  updatedAt: Date;
}
