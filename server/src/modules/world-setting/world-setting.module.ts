/**
 * 世界观 Module
 */
import { Module } from '@nestjs/common';
import { WorldSettingController } from './world-setting.controller';
import { WorldSettingService } from './world-setting.service';
import { WorldSettingRepository } from '../../database/repositories/world-setting.repository';
import { ConflictEngineModule } from '../conflict-engine/conflict.module';
import { StateModule } from '../../state/state.module';

@Module({
  imports: [ConflictEngineModule, StateModule],
  controllers: [WorldSettingController],
  providers: [WorldSettingService, WorldSettingRepository],
  exports: [WorldSettingService],
})
export class WorldSettingModule {}
