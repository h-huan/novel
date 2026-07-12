import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConflictEngineService } from '../conflict-engine/conflict-engine.service';

export type DerivedSyncStepStatus = 'completed' | 'pending' | 'warning';

export interface DerivedSyncStep {
  status: DerivedSyncStepStatus;
  detail: string;
}

export interface ChapterDerivedDataSyncResult {
  success: boolean;
  chapterId: string;
  steps: {
    chapterSummary: DerivedSyncStep;
    aggregateSummaries: DerivedSyncStep;
    vectorIndex: DerivedSyncStep;
    foreshadowingReview: DerivedSyncStep;
    timelineReview: DerivedSyncStep;
    outlineDeviation: DerivedSyncStep;
    conflictReview: DerivedSyncStep;
  };
  warnings: string[];
}

/** Single orchestration point for all data derived from chapter content. */
@Injectable()
export class ChapterDerivedDataSyncService {
  private readonly logger = new Logger(ChapterDerivedDataSyncService.name);

  constructor(@Optional() private readonly conflictEngine?: ConflictEngineService) {}

  async syncAfterContentChange(input: {
    projectId: string;
    chapterId: string;
    beforeContent: string;
    afterContent: string;
    reason: 'manual_save' | 'version_restore';
  }): Promise<ChapterDerivedDataSyncResult> {
    const pending = (detail: string): DerivedSyncStep => ({ status: 'pending', detail });
    const steps: ChapterDerivedDataSyncResult['steps'] = {
      chapterSummary: pending('Waiting for the existing chapter-summary generator to expose a persistence API'),
      aggregateSummaries: pending('Volume and novel summaries will be invalidated after chapter-summary persistence is available'),
      vectorIndex: pending('Waiting for a real embedding provider; placeholder vectors were not written'),
      foreshadowingReview: pending('Waiting for a chapter-scoped evidence recheck API in the foreshadowing module'),
      timelineReview: pending('Waiting for a chapter-scoped recheck API in the timeline module'),
      outlineDeviation: pending('Waiting for a content-deviation API in the outline module'),
      conflictReview: pending('Conflict engine is unavailable'),
    };
    const warnings: string[] = [];

    if (this.conflictEngine) {
      try {
        const report = await this.conflictEngine.checkOnLock(input.chapterId, input.projectId);
        steps.conflictReview = {
          status: 'completed',
          detail: `Conflict recheck completed with ${report.summary.total} finding(s)`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        steps.conflictReview = { status: 'warning', detail: message };
        warnings.push(`Conflict recheck failed: ${message}`);
        this.logger.warn(`chapter=${input.chapterId} conflict recheck failed: ${message}`);
      }
    }

    const allCompleted = Object.values(steps).every((step) => step.status === 'completed');
    return { success: allCompleted && warnings.length === 0, chapterId: input.chapterId, steps, warnings };
  }
}
