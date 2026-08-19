/**
 * 大纲 Module
 */
import { Module } from '@nestjs/common';
import { OutlineController } from './outline.controller';
import { OutlineService } from './outline.service';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { StateModule } from '../../state/state.module';
import { RagModule } from '../../rag/rag.module';
import { MapPointModule } from '../map-point/map-point.module';

@Module({
  imports: [StateModule, RagModule, MapPointModule],
  controllers: [OutlineController],
  providers: [OutlineService, OutlineRepository],
  exports: [OutlineService],
})
export class OutlineModule {}
