/**
 * Prompt Chain 模块
 *
 * 当前仅通过 ChainTemplateService 的两条固定长篇规划链使用 ChainEngine；
 * PromptRegistryService.registerFixedTemplates 只维护这两条链实际引用的五个模板。
 * 正文生成走 ChainWritingController → ChainController 的现行生成与质量闭环，
 * 不是历史八步合成节点，也不能称为只有一次 LLM 物理调用。
 * RealLLM 提供实际模型调用，IdempotentRealLLMService 管理可复用的同输入调用。
 * /chain/* 路由按 planning / writing / utility Controller 注册；
 * 小说业务判据只来自 server/shared/src/执行标准.ts。
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
import { ChainPlanningController } from './chain-planning.controller';
import { ChainWritingController } from './chain-writing.controller';
import { ChainUtilityController } from './chain-utility.controller';
import { IdeaAppealGateService } from './idea-appeal-gate.service';
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
  controllers: [
    ChainPlanningController,
    ChainWritingController,
    ChainUtilityController,
    BenchmarkController,
  ],
  providers: [
    // Incremental decomposition: HTTP routing lives in focused controllers while the
    // existing large class remains the single internal orchestrator. Move orchestration
    // methods to dedicated services gradually; do not register this class as a controller again.
    ChainController,
    ChainEngineService,
    ChainTemplateService,
    PromptRegistryService,
    { provide: RealLLMService, useClass: IdempotentRealLLMService },
    NewsRssService,
    GenerationRecoveryService,
    IdeaAppealGateService,
  ],
  exports: [
    ChainEngineService,
    PromptRegistryService,
    RealLLMService,
    GenerationRecoveryService,
  ],
})
export class ChainModule {}
