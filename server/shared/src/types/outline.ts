import { ChapterFunctionType, GoalArcType } from '../enums/chapter';
import { ForeshadowingType } from '../enums/foreshadowing-type';

export type OutlineLevel = 'book' | 'volume' | 'chapter' | 'scene';

export interface PlotPoint {
  id: string;
  title: string;
  description: string;
  characterIds: string[];
  foreshadowingIds: string[];
  type: ForeshadowingType;
}

export interface OutlineNode {
  id: string;
  projectId: string;
  parentId?: string;
  level: OutlineLevel;
  order: number;
  title: string;
  content: string;
  chapterFunction?: ChapterFunctionType;
  goalArc?: GoalArcType;
  targetWords?: number;
  actualWords?: number;
  foreshadowingIds: string[];
  plotPoints: PlotPoint[];
  status: 'planned' | 'writing' | 'completed';
  characterIds: string[];
  children: OutlineNode[];
  createdAt: Date;
  updatedAt: Date;
}
