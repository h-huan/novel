/**
 * AI 路由模块
 *
 * 只保留真正被使用的模型路由能力：
 * - ModelRouterService 模型路由引擎（注册表/场景路由/BYOK/温度，配置什么模型就原样用什么、不降级）
 * - RoutingController 路由配置/场景模型/自定义 Provider 的 HTTP 接口
 *
 * 说明：早期抽象层的多模型协作/成本策略/流式/故障转移/Chain 编排器/结果复核等服务
 * 因长期零注入、零调用（正文质检唯一事实源为 writing-quality 模块），已作为冗余死代码移除，
 * 避免再出现“两套并存”。
 */
import { Module } from '@nestjs/common';
import { ModelRouterService } from './model-router.service';
import { RoutingController } from './routing.controller';

@Module({
  controllers: [RoutingController],
  providers: [ModelRouterService],
  exports: [ModelRouterService],
})
export class RoutingModule {}
