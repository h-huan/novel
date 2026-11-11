/**
 * 地图地点 Module
 */
import { Module } from '@nestjs/common';
import { ENTITY_WRITER_TOKENS } from '../../state/entity-writer-tokens';
import { MapPointController } from './map-point.controller';
import { MapPointService } from './map-point.service';
import { MapPointRepository } from '../../database/repositories/map-point.repository';
import { RagModule } from '../../rag/rag.module';
import { StateModule } from '../../state/state.module';

@Module({
  imports: [RagModule, StateModule],
  controllers: [MapPointController],
  providers: [MapPointService, MapPointRepository, {provide:ENTITY_WRITER_TOKENS.map_point,useExisting:MapPointService}],
  exports: [MapPointService],
})
export class MapPointModule {}
