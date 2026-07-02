import {
  ChapterStatus, ChapterFunctionType, GoalArcType, HookType, TransitionMode,
} from '../enums/chapter';
import { ForeshadowingType } from '../enums/foreshadowing-type';
import { TianLong8Steps } from './tianlong';
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
  status: ChapterStatus;
  chapterFunction?: ChapterFunctionType;
  goalArc?: GoalArcType;
  hookType?: HookType;
  transitionMode?: TransitionMode;
  tianLong8Steps: TianLong8Steps;
  modelConfig: ModelConfig;
  foreshadowingIds?: string[];
  lockedAt?: Date;
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
  status: ChapterStatus;
  updatedAt: Date;
}
