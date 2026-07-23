/**
 * 伏笔 Module
 */
import { Module } from '@nestjs/common';
import { ForeshadowingController } from './foreshadowing.controller';
import { ForeshadowingService } from './foreshadowing.service';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';
import { StateModule } from '../../state/state.module';
import { RagModule } from '../../rag/rag.module';

@Module({
  imports: [StateModule, RagModule],
  controllers: [ForeshadowingController],
  providers: [ForeshadowingService, ForeshadowingRepository],
  exports: [ForeshadowingService],
})
export class ForeshadowingModule {}
