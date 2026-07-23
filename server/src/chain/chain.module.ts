/**
 * Prompt Chain 模块
 *
 * 提供完整的链式编排引擎，包含：
 * - Chain 编排引擎（顺序执行/条件分支/重试）
 * - Prompt 模板仓库（短篇三步骤+天龙8步全套模板）
 * - QualityGate 质量门（CRITICAL/WARNING/INFO 三级）
 * - 短篇三步骤 Chain 服务（题材→大纲→正文）
 * - WritingMode 写作模式切换（全自动/半自动/自由模式）
 * - RealLLM 服务（真实 LLM API 调用）
 * - ChainController (REST API /chain/*)
 *
 * ⚠️ MockLLMService 已移除 — 研发中禁用模拟数据，必须接入真实 LLM
 */

import { Module, forwardRef } from '@nestjs/common';
import { ChainTemplateService } from './chain-template.service';
import { ChainEngineService } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import { QualityGateService } from './quality-gate.service';
import { StoryChainService } from './story-chain.service';
import { RealLLMService } from './real-llm.service';
import { WritingModeService } from './writing-mode.service';
import { NewsRssService } from './news-rss.service';
import { StyleTemplateService } from './style-template.service';
import { MultiModelService } from './multi-model.service';
import { SeedEnrichChainService } from './seed-enrich-chain.service';
import { GenerationRecoveryService } from './generation-recovery.service';
import { ChainController } from './chain.controller';
import { StateModule } from '../state/state.module';
import { FileStorageModule } from '../modules/file-storage/file-storage.module';

import { RagModule } from '../rag/rag.module';
import { RoutingModule } from '../routing/routing.module';
import { CharacterModule } from '../modules/character/character.module';
import { WorldSettingModule } from '../modules/world-setting/world-setting.module';
import { OrganizationModule } from '../modules/organization/organization.module';
import { MapPointModule } from '../modules/map-point/map-point.module';
import { WorkflowGuardModule } from '../modules/workflow-guard/workflow-guard.module';

@Module({
  imports: [
    StateModule,
    FileStorageModule,
    RagModule,
    RoutingModule,
    CharacterModule,
    WorldSettingModule,
    OrganizationModule,
    MapPointModule,
    forwardRef(() => WorkflowGuardModule),
  ],
  controllers: [ChainController],
  providers: [
    ChainEngineService,
    ChainTemplateService,
    PromptRegistryService,
    QualityGateService,
    StoryChainService,
    RealLLMService,
    WritingModeService,
    NewsRssService,
    StyleTemplateService,
    MultiModelService,
    SeedEnrichChainService,
    GenerationRecoveryService,
  ],
  exports: [
    ChainEngineService,
    PromptRegistryService,
    QualityGateService,
    StoryChainService,
    RealLLMService,
    WritingModeService,
    SeedEnrichChainService,
    GenerationRecoveryService,
  ],
})
export class ChainModule {}
