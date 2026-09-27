/**
 * 章节 Module
 */
import { Module } from '@nestjs/common';
import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';
import { GeneratedChapterCommitService } from './generated-chapter-commit.service';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import { StateModule } from '../../state/state.module';
import { StateManagementModule } from '../../state/state-management.module';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';
import { RagModule } from '../../rag/rag.module';
import { ChainModule } from '../../chain/chain.module';
import { AggregateSummaryController } from './aggregate-summary.controller';
import { DatabaseModule } from '../../database/database.module';
import { OriginalityModule } from '../originality/originality.module';
import { GenerationMetricsModule } from '../generation-metrics/generation-metrics.module';

@Module({
  imports: [
    StateModule,
    StateManagementModule,
    RagModule,
    ChainModule,
    DatabaseModule,
    OriginalityModule,
    GenerationMetricsModule,
  ],
  controllers: [ChapterController, AggregateSummaryController],
  providers: [
    ChapterService,
    GeneratedChapterCommitService,
    ChapterDerivedDataSyncService,
    ChapterRepository,
    VersionHistoryRepository,
  ],
  exports: [ChapterService, GeneratedChapterCommitService, ChapterDerivedDataSyncService],
})
export class ChapterModule {}
