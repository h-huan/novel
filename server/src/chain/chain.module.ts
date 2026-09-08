/**
 * Prompt Chain 模块
 *
 * 提供完整的链式编排引擎，包含：
 * - Chain 编排引擎（顺序执行/条件分支/重试）
 * - Prompt 模板仓库（短篇三步骤全套模板；天龙8步已于 2026-07-24 取消，正文改由 /chain/generate 单次 LLM 严格按大纲生成）
 * - 短篇三步骤 Chain 服务（题材→大纲→正文）
 * - RealLLM 服务（真实 LLM API 调用）
 * - ChainController (REST API /chain/*)
 *
 * ⚠️ MockLLMService 已移除 — 研发中禁用模拟数据，必须接入真实 LLM
 */

import { Module, forwardRef } from '@nestjs/common';
import { ChainTemplateService } from './chain-template.service';
import { ChainEngineService } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import { RealLLMService } from './real-llm.service';
import { NewsRssService } from './news-rss.service';
import { GenerationRecoveryService } from './generation-recovery.service';
import { ChainController } from './chain.controller';
import { StateModule } from '../state/state.module';
import { StateManagementModule } from '../state/state-management.module';
import { FileStorageModule } from '../modules/file-storage/file-storage.module';

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
    StateModule,
    StateManagementModule,
    FileStorageModule,
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
  controllers: [ChainController],
  providers: [
    ChainEngineService,
    ChainTemplateService,
    PromptRegistryService,
    RealLLMService,
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
