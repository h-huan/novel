/**
 * TimelineModule - 时间线模块注册
 */
import { Module } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { TimelineController } from './timeline.controller';
import { TimelineRepository } from '../../database/repositories/timeline.repository';

@Module({
  controllers: [TimelineController],
  providers: [TimelineService, TimelineRepository],
  exports: [TimelineService],
})
export class TimelineModule {}
