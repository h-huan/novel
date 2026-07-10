/**
 * 地图地点 Module
 */
import { Module } from '@nestjs/common';
import { MapPointController } from './map-point.controller';
import { MapPointService } from './map-point.service';
import { MapPointRepository } from '../../database/repositories/map-point.repository';
import { RagModule } from '../../rag/rag.module';
import { StateModule } from '../../state/state.module';

@Module({
  imports: [RagModule, StateModule],
  controllers: [MapPointController],
  providers: [MapPointService, MapPointRepository],
  exports: [MapPointService],
})
export class MapPointModule {}
