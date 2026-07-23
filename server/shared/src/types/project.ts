import {
  ProjectStatus,
  ProjectType,
  CreationSource,
  TargetPlatform,
  WorkflowStage,
  IdeaStatus,
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
  /** 创建来源 */
  creationSource: CreationSource;
  /** 目标平台 */
  targetPlatform: TargetPlatform;
  /** 目标字数 */
  targetWords: number;
  /** 项目卡与创作规划配置；所有生成流程必须按此执行 */
  settings?: Record<string, unknown>;
  /** 写作风格配置 */
  writingStyle?: Record<string, unknown> | string;
  /** 当前创作阶段 */
  currentWorkflowStage: WorkflowStage;
  /** 想法孵化状态 */
  ideaStatus: IdeaStatus;
  /** 用户原始想法 */
  ideaSeed?: string;
  /** 确认后的成熟想法 */
  confirmedIdea?: string;
  createdAt: Date;
  updatedAt: Date;
}
