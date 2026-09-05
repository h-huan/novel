import {
  ChapterStatus, ChapterFunctionType, GoalArcType, HookType, TransitionMode,
} from '../enums/chapter';
import { ForeshadowingType } from '../enums/foreshadowing-type';
import { ModelConfig } from './model-config';

export interface Chapter {
  id: string;
  projectId: string;
  outlineId?: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  content: string;
  wordCount: number;
  targetWords?: number;
  status: ChapterStatus;
  chapterFunction?: ChapterFunctionType;
  goalArc?: GoalArcType;
  hookType?: HookType;
  transitionMode?: TransitionMode;
  modelConfig: ModelConfig;
  foreshadowingIds?: string[];
  lockedAt?: Date;
  /** 最近一次自动质检状态：running 进行中 / ok 成功 / failed 失败（可手动重跑） */
  autoQualityStatus?: 'running' | 'ok' | 'needs_rewrite' | 'failed';
  autoQualityMessage?: string;
  autoQualityAt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChapterFrontMatter {
  title: string;
  volumeIndex: number;
  chapterIndex: number;
  status: ChapterStatus;
  chapterFunction: ChapterFunctionType;
  goalArc: GoalArcType;
  wordCount: number;
  hookType?: HookType;
  transitionMode?: TransitionMode;
  foreshadowingType?: ForeshadowingType;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterListItem {
  id: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  wordCount: number;
  /** 来自关联章节大纲的动态目标字数，不是项目级默认值。 */
  targetWords?: number;
  status: ChapterStatus;
  updatedAt: Date;
}
