/**
 * AI 路由模块
 *
 * 提供完整的模型路由、多模型协作、成本策略、故障转移和结果复核能力。
 * 基于 ILLMService 抽象接口，所有模型调用均通过抽象层，便于测试和替换。
 *
 * 包含服务：
 * - ModelRouterService    模型路由引擎（注册表/场景路由/BYOK/Temperature调节）
 * - MultiModelCollabService 多模型协作（写手+评审+策划 三角色流水线）
 * - CostStrategyService   成本策略（阶梯定价/预算控制/消耗统计）
 * - StreamingService      流式生成（SSE/WebSocket）
 * - FailoverService       故障转移（超时重试/降级链/熔断）
 * - ChainOrchestratorService Prompt Chain 编排器（JSON配置/变量替换/条件分支/循环）
 * - ResultReviewService   结果复核（5维评分/通过/修改/重生成）
 *
 * 导入到 AppModule 后即可通过依赖注入使用
 */
import { Module } from '@nestjs/common';
import { ModelRouterService } from './model-router.service';
import { MultiModelCollabService } from './multi-model-collab.service';
import { CostStrategyService } from './cost-strategy.service';
import { StreamingService } from './streaming.service';
import { FailoverService } from './failover.service';
import { ChainOrchestratorService } from './chain-orchestrator.service';
import { ResultReviewService } from './result-review.service';
import { RoutingController } from './routing.controller';

@Module({
  controllers: [RoutingController],
  providers: [
    ModelRouterService,
    MultiModelCollabService,
    CostStrategyService,
    StreamingService,
    FailoverService,
    ChainOrchestratorService,
    ResultReviewService,
  ],
  exports: [
    ModelRouterService,
    MultiModelCollabService,
    CostStrategyService,
    StreamingService,
    FailoverService,
    ChainOrchestratorService,
    ResultReviewService,
  ],
})
export class RoutingModule {}
