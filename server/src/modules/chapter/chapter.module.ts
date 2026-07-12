/**
 * 章节 Module
 */
import { Module } from '@nestjs/common';
import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import { StateModule } from '../../state/state.module';
import { ConflictEngineModule } from '../conflict-engine/conflict.module';
import { ChapterDerivedDataSyncService } from './chapter-derived-data-sync.service';

@Module({
  imports: [StateModule, ConflictEngineModule],
  controllers: [ChapterController],
  providers: [ChapterService, ChapterDerivedDataSyncService, ChapterRepository, VersionHistoryRepository],
  exports: [ChapterService, ChapterDerivedDataSyncService],
})
export class ChapterModule {}
