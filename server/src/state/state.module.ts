/**
 * 24维状态引擎模块
 *
 * 提供角色状态追踪、自动检测变更、快照持久化能力
 */

import { Module } from '@nestjs/common';
import { StateEngineService } from './state-engine.service';
import { StatePersistenceService } from './state-persistence.service';
import { StateItemService } from './state-item.service';

@Module({
  providers: [StateEngineService, StatePersistenceService, StateItemService],
  exports: [StateEngineService, StatePersistenceService, StateItemService],
})
export class StateModule {}
