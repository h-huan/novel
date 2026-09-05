/**
 * 功能模块标准库 Module
 * 依赖方向：本模块 → ChainModule(RealLLMService，归纳用配置模型) + GenerationMetricsModule(指标) + DatabaseModule；
 * RealLLM 生成时通过无 DI 的 standardDirectiveCache 反向读取标准，因此不形成循环依赖。
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ChainModule } from '../../chain/chain.module';
import { GenerationMetricsModule } from '../generation-metrics/generation-metrics.module';
import { ModuleStandardsService } from './module-standards.service';
import { ModuleStandardsController } from './module-standards.controller';

@Module({
  imports: [DatabaseModule, ChainModule, GenerationMetricsModule],
  controllers: [ModuleStandardsController],
  providers: [ModuleStandardsService],
  exports: [ModuleStandardsService],
})
export class ModuleStandardsModule {}
