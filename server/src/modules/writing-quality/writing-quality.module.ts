/**
 * WritingQuality Module - Phase 6.1
 */
import { Module } from '@nestjs/common';
import { WritingQualityController } from './writing-quality.controller';
import { WritingQualityService } from './writing-quality.service';
import { ChapterModule } from '../chapter/chapter.module';
import { RealLLMService } from '../../chain/real-llm.service';
import { ModelRouterService } from '../../routing/model-router.service';
import { FailoverService } from '../../routing/failover.service';

@Module({
  imports: [ChapterModule],
  controllers: [WritingQualityController],
  providers: [
    WritingQualityService,
    RealLLMService,
    ModelRouterService,
    FailoverService,
  ],
  exports: [WritingQualityService],
})
export class WritingQualityModule {}
