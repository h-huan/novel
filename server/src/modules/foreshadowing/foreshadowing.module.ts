/**
 * 伏笔 Module
 */
import { Module } from '@nestjs/common';
import { ENTITY_WRITER_TOKENS } from '../../state/entity-writer-tokens';
import { ForeshadowingController } from './foreshadowing.controller';
import { ForeshadowingService } from './foreshadowing.service';
import { ForeshadowingRepository } from '../../database/repositories/foreshadowing.repository';
import { StateModule } from '../../state/state.module';
import { RagModule } from '../../rag/rag.module';

@Module({
  imports: [StateModule, RagModule],
  controllers: [ForeshadowingController],
  providers: [ForeshadowingService, ForeshadowingRepository, {provide:ENTITY_WRITER_TOKENS.foreshadowing,useExisting:ForeshadowingService}],
  exports: [ForeshadowingService],
})
export class ForeshadowingModule {}
