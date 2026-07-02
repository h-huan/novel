/**
 * MultiModelService - 多模型协作服务
 * 写手/评审/策划 三模型路由
 */
import { Injectable, Logger } from '@nestjs/common';
import { RealLLMService } from './real-llm.service';

export type ModelRole = 'writer' | 'reviewer' | 'planner';
export type ModelTier = 'premium' | 'standard' | 'economy';

interface ModelRoute {
  role: ModelRole;
  preferredTier: ModelTier;
  modelName: string;
  temperature: number;
}

@Injectable()
export class MultiModelService {
  private readonly logger = new Logger(MultiModelService.name);

  constructor(private readonly realLLM: RealLLMService) {}

  private routes: Record<ModelRole, ModelRoute> = {
    writer: { role: 'writer', preferredTier: 'premium', modelName: 'gpt4o', temperature: 0.7 },
    reviewer: { role: 'reviewer', preferredTier: 'standard', modelName: 'claude', temperature: 0.3 },
    planner: { role: 'planner', preferredTier: 'economy', modelName: 'deepseek', temperature: 0.5 },
  };

  getRoute(role: ModelRole, chapterFunction?: string): ModelRoute {
    const route = this.routes[role];

    // 根据章节功能自动分配成本策略
    if (chapterFunction === 'explosion' || chapterFunction === 'closing') {
      // 高潮/收束章节 → 高性能模型
      return { ...route, preferredTier: 'premium', modelName: 'gpt4o' };
    }
    if (chapterFunction === 'breathing' || chapterFunction === 'transition') {
      // 过渡/呼吸章节 → 低成本模型
      return { ...route, preferredTier: 'economy', modelName: 'deepseek' };
    }

    return route;
  }

  async generateWithBestModel(role: ModelRole, prompt: string, chapterFunction?: string): Promise<{ content: string; model: string; tier: ModelTier; latency: number }> {
    const route = this.getRoute(role, chapterFunction);
    const start = Date.now();

    this.logger.log(`[${role}] 使用 ${route.modelName} (${route.preferredTier}) 生成`);
    try {
      const response = await this.realLLM.generate({
        prompt,
        model: route.modelName,
        temperature: route.temperature,
        maxTokens: 2048,
      });
      return {
        content: response.content,
        model: route.modelName,
        tier: route.preferredTier,
        latency: Date.now() - start,
      };
    } catch (err: any) {
      this.logger.error(`[${role}] 生成失败: ${err.message}`);
      return {
        content: `[${role}生成失败: ${err.message}]`,
        model: route.modelName,
        tier: route.preferredTier,
        latency: Date.now() - start,
      };
    }
  }
}
