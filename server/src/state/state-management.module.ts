/**
 * 状态管理模块 (State Management Module)
 *
 * 整合所有状态管理相关的服务、仓库和控制器
 * 根据子衿的 RAG 状态管理规范实现
 */
import { Module } from '@nestjs/common';
import { StateEngineService } from './state-engine.service';
import { StateExtractionService } from './state-extraction.service';
import { ConsistencyCheckService } from './consistency-check.service';
import { StateManagementController } from './state-management.controller';
import { CharacterStateRepository } from '../database/repositories/character-state.repository';
import { DatabaseModule } from '../database/database.module';
import { RoutingModule } from '../routing/routing.module';
import { RealLLMService } from '../chain/real-llm.service';

@Module({
  imports: [DatabaseModule, RoutingModule],
  controllers: [StateManagementController],
  providers: [
    StateEngineService,
    StateExtractionService,
    ConsistencyCheckService,
    CharacterStateRepository,
    RealLLMService,
  ],
  exports: [
    StateEngineService,
    StateExtractionService,
    ConsistencyCheckService,
  ],
})
export class StateManagementModule {}
