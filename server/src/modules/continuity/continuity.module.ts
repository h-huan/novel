import { Module } from '@nestjs/common';
import { ContinuityController } from './continuity.controller';
import { ContinuityService } from './continuity.service';

@Module({
  controllers: [ContinuityController],
  providers: [ContinuityService],
  exports: [ContinuityService],
})
export class ContinuityModule {}
