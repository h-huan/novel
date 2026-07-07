/**
 * WritingQuality Module - Phase 6.1 / 6.2
 *
 * 依赖 ChainModule（提供 RealLLMService/RoutingModule 的 ModelRouterService/FailoverService）
 * 依赖 ChapterModule（提供 ChapterService）
 */
import { Module } from '@nestjs/common';
import { WritingQualityController } from './writing-quality.controller';
import { WritingQualityService } from './writing-quality.service';
import { ChapterModule } from '../chapter/chapter.module';
import { ChainModule } from '../../chain/chain.module';

@Module({
  imports: [ChapterModule, ChainModule],
  controllers: [WritingQualityController],
  providers: [WritingQualityService],
  exports: [WritingQualityService],
})
export class WritingQualityModule {}
