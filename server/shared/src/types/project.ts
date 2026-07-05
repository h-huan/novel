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
