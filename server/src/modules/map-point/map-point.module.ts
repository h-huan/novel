/**
 * 地图地点 Module
 */
import { Module } from '@nestjs/common';
import { MapPointController } from './map-point.controller';
import { MapPointService } from './map-point.service';
import { MapPointRepository } from '../../database/repositories/map-point.repository';

@Module({
  controllers: [MapPointController],
  providers: [MapPointService, MapPointRepository],
  exports: [MapPointService],
})
export class MapPointModule {}
