import { ForeshadowingStatus, ForeshadowingImportance, ForeshadowingType } from '../enums/foreshadowing-type';

export interface Foreshadowing {
  id: string;
  projectId: string;
  content: string;
  status: ForeshadowingStatus;
  type: ForeshadowingType;
  importance: ForeshadowingImportance;
  buriedAt?: string;
  buriedChapterIndex: number;
  plannedRecoveryAt?: string;
  plannedRecoveryChapterIndex: number;
  actualRecoveryAt?: string;
  actualRecoveryChapterIndex?: number;
  recoveryMethod?: string;
  recoveryTrigger?: {
    type: 'chapter_reach' | 'event_occur' | 'character_meet' | 'item_discover';
    condition: string;
    description: string;
  };
  impact?: number;
  relatedCharacterIds: string[];
  overdueThreshold?: number;
  createdAt: Date;
  updatedAt: Date;
}
