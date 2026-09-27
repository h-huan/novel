/**
 * 生成步骤遥测 Module
 * - Controller 提供只读聚合查询（首页 / 项目仪表盘）
 * - Service 被 RealLLMService 注入，用于一处织入的全链路埋点与首版自校准
 * - GeneratedCanonGuardService 只验证已有 generation run 的 Gate/上下文凭证，
 *   不评分、不修复、不产生第二套质量系统
 */
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { GenerationMetricsService } from './generation-metrics.service';
import { GenerationMetricsController } from './generation-metrics.controller';
import { GeneratedCanonGuardService } from './generated-canon-guard.service';

@Module({
  imports: [DatabaseModule],
  controllers: [GenerationMetricsController],
  providers: [GenerationMetricsService, GeneratedCanonGuardService],
  exports: [GenerationMetricsService, GeneratedCanonGuardService],
})
export class GenerationMetricsModule {}
