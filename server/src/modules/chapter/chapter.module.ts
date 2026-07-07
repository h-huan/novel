/**
 * 章节 Module
 */
import { Module } from '@nestjs/common';
import { ChapterController } from './chapter.controller';
import { ChapterService } from './chapter.service';
import { ChapterRepository } from '../../database/repositories/chapter.repository';
import { VersionHistoryRepository } from '../../database/repositories/version-history.repository';
import { StateModule } from '../../state/state.module';

@Module({
  imports: [StateModule],
  controllers: [ChapterController],
  providers: [ChapterService, ChapterRepository, VersionHistoryRepository],
  exports: [ChapterService],
})
export class ChapterModule {}
