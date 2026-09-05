/**
 * 大纲 Module
 */
import { Module } from '@nestjs/common';
import { OutlineController } from './outline.controller';
import { OutlineService } from './outline.service';
import { OutlineRepository } from '../../database/repositories/outline.repository';
import { StateModule } from '../../state/state.module';
import { StateManagementModule } from '../../state/state-management.module';
import { RagModule } from '../../rag/rag.module';
import { MapPointModule } from '../map-point/map-point.module';

@Module({
  imports: [StateModule, StateManagementModule, RagModule, MapPointModule],
  controllers: [OutlineController],
  // ConsistencyCheckService 由 StateManagementModule 统一提供并导出（它还依赖 RealLLMService，
  // 不能在本模块局部 new——否则 Nest 在 OutlineModule 上下文解析不到 RealLLMService 会直接启动失败）
  providers: [OutlineService, OutlineRepository],
  exports: [OutlineService],
})
export class OutlineModule {}
