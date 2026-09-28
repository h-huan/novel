/**
 * Prompt Chain 模块
 *
 * 提供完整的链式编排引擎，包含：
 * - Chain 编排引擎（顺序执行/条件分支/重试）
 * - Prompt 模板仓库（只注册有真实消费者的模板；清单与理由见 prompt-registry.service 的 registerAllTemplates）
 * - 天龙8步已于 2026-07-24 取消，短篇与长篇正文统一由 /chain/generate 单次 LLM 严格按大纲生成
 * - RealLLM 服务（真实 LLM API 调用；同输入创建阶段由同一 provider 做持久化幂等复用）
 * - ChainController (REST API /chain/*)
 *
 * ⚠️ MockLLMService 已移除 — 研发中禁用模拟数据，必须接入真实 LLM
 */

import { Module, forwardRef } from '@nestjs/common';
import { BenchmarkController } from './benchmark.controller';
import { DatabaseModule } from '../database/database.module';
import { ChainTemplateService } from './chain-template.service';
import { ChainEngineService } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import { RealLLMService } from './real-llm.service';
import { IdempotentRealLLMService } from './idempotent-real-llm.service';
import { NewsRssService } from './news-rss.service';
import { GenerationRecoveryService } from './generation-recovery.service';
import { ChainController } from './chain.controller';
import { StateModule } from '../state/state.module';
import { StateManagementModule } from '../state/state-management.module';

import { RagModule } from '../rag/rag.module';
import { RoutingModule } from '../routing/routing.module';
import { CharacterModule } from '../modules/character/character.module';
import { WorldSettingModule } from '../modules/world-setting/world-setting.module';
import { OrganizationModule } from '../modules/organization/organization.module';
import { MapPointModule } from '../modules/map-point/map-point.module';
import { WorkflowGuardModule } from '../modules/workflow-guard/workflow-guard.module';
import { WebSocketModule } from '../modules/websocket/websocket.module';
import { GenerationMetricsModule } from '../modules/generation-metrics/generation-metrics.module';
import { OriginalityModule } from '../modules/originality/originality.module';

@Module({
  imports: [
    DatabaseModule,
    StateModule,
    StateManagementModule,
    RagModule,
    RoutingModule,
    CharacterModule,
    WorldSettingModule,
    OrganizationModule,
    MapPointModule,
    forwardRef(() => WorkflowGuardModule),
    WebSocketModule,
    GenerationMetricsModule,
    OriginalityModule,
  ],
  controllers: [ChainController, BenchmarkController],
  providers: [
    ChainEngineService,
    ChainTemplateService,
    PromptRegistryService,
    { provide: RealLLMService, useClass: IdempotentRealLLMService },
    NewsRssService,
    GenerationRecoveryService,
  ],
  exports: [
    ChainEngineService,
    PromptRegistryService,
    RealLLMService,
    GenerationRecoveryService,
  ],
})
export class ChainModule {}