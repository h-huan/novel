/**
 * 章节 Module
 */
import { Module } from '@nestjs/common';
import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';
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

@Module({
  imports: [StateModule, StateManagementModule, RagModule, ChainModule, DatabaseModule, OriginalityModule],
  controllers: [ChapterController, AggregateSummaryController],
  providers: [ChapterService, ChapterDerivedDataSyncService, ChapterRepository, VersionHistoryRepository],
  exports: [ChapterService, ChapterDerivedDataSyncService],
})
export class ChapterModule {}
