/**
 * 短篇 / 长篇 大纲与服务
 *
 * 当前职责（2026-07-24 天龙8部取消后）：
 *   - executeLongOutline：长篇千层饼大纲生成（卷→章→节）
 *
 * 历史：
 *   - 旧版 Chain C「天龙8步正文生成」已在 2026-07-24 取消。
 *   - 取消原因：天龙8步把每章拆成 8 次独立 LLM 调用，step6-reversal 强制
 *     每章反转，与大纲的"递进反转"结构冲突；step3-action 让 LLM 自由
 *     发挥时引入大纲外的角色/场景（如把"报摊摊主"替换为不在大纲中的
 *     "修车老周"），只能由 controller 的 assertGeneratedChapterAlignment
 *     在最末位拒绝保存。修复后短/长篇正文统一改为单次 LLM 调用 + 严格按
 *     detailed outline 生成。
 *
 * 长篇有独立的 /chain/long-write 端点（已不依赖天龙8步），短篇走
 * /chain/generate（也已切换为单次 LLM）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { ChainEngineService } from './chain-engine.service';
import {
  PromptChain,
  ChainNode,
  ChainResult,
  ExecutionMode,
} from './chain.types';

@Injectable()
export class StoryChainService {
  private readonly logger = new Logger(StoryChainService.name);

  constructor(
    private readonly chainEngine: ChainEngineService,
  ) {}

  // ==================== 长篇大纲 Chain ====================

  /**
   * 执行长篇大纲生成
   * 基于游蜂千层饼架构：全书→卷→章→节四层
   */
  async executeLongOutline(userInput: {
    projectTitle: string;
    outline: string;
    targetWords: number;
    chapterWordRange: { min: number; max: number };
    genre: string;
    characters?: Record<string, unknown>[];
  }): Promise<ChainResult> {
    this.logger.log(`执行长篇大纲生成: ${userInput.projectTitle}`);

    const chain = this.buildLongOutlineChain();
    return this.chainEngine.execute(chain, userInput as Record<string, unknown>);
  }

  /**
   * 构建长篇大纲 Chain
   * 节点: 全局设定 → 卷结构 → 人物分配 → 章节功能路由 → 伏笔网络 → 大纲报告
   */
  private buildLongOutlineChain(): PromptChain {
    const node1: ChainNode = {
      id: 'node_1_global_settings',
      name: '全局设定',
      type: 'prompt',
      chainId: 'long-outline',
      promptTemplateId: 'long-outline-global',
      modelConfig: { primary: 'claude', fallback: 'gpt4o', temperature: 0.6, tier: 'balanced' },
      inputMapping: { projectTitle: 'user_input.projectTitle', outline: 'user_input.outline', genre: 'user_input.genre' },
      outputMapping: { worldSettings: 'node_1.worldSettings', coreConflict: 'node_1.coreConflict', theme: 'node_1.theme' },
      timeout: 45,
      retryCount: 2,
      description: '提取长篇的全局世界观、核心冲突与主题',
    };

    const node2: ChainNode = {
      id: 'node_2_volume_structure',
      name: '卷结构规划',
      type: 'prompt',
      chainId: 'long-outline',
      promptTemplateId: 'long-outline-volumes',
      modelConfig: { primary: 'claude', fallback: 'gpt4o', temperature: 0.7, tier: 'balanced' },
      inputMapping: { globalSettings: 'chain_output.node_1', targetWords: 'user_input.targetWords', chapterWordRange: 'user_input.chapterWordRange' },
      outputMapping: { volumes: 'node_2.volumes', mainArc: 'node_2.mainArc' },
      timeout: 60,
      retryCount: 2,
      description: '规划多卷结构，每卷的Goal弧线分配',
    };

    const node3: ChainNode = {
      id: 'node_3_character_allocation',
      name: '人物分配',
      type: 'prompt',
      chainId: 'long-outline',
      promptTemplateId: 'long-outline-characters',
      modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.5, tier: 'economy' },
      inputMapping: { volumes: 'chain_output.node_2', characters: 'user_input.characters' },
      outputMapping: { characterArcs: 'node_3.characterArcs' },
      timeout: 30,
      retryCount: 1,
      description: '将人物分配到各卷，规划成长弧线',
    };

    const node4: ChainNode = {
      id: 'node_4_chapter_routing',
      name: '章节功能路由',
      type: 'prompt',
      chainId: 'long-outline',
      promptTemplateId: 'long-outline-chapter-routing',
      modelConfig: { primary: 'gpt4o', fallback: 'deepseek', temperature: 0.6, tier: 'balanced' },
      inputMapping: { volumes: 'chain_output.node_2', characterArcs: 'chain_output.node_3' },
      outputMapping: { chapterRouting: 'node_4.chapterRouting' },
      timeout: 45,
      retryCount: 2,
      description: '为每章分配章节功能(呼吸/蓄力/爆发/铺垫/过渡/收束)和Goal弧线',
    };

    const node5: ChainNode = {
      id: 'node_5_foreshadow_network',
      name: '伏笔网络',
      type: 'prompt',
      chainId: 'long-outline',
      promptTemplateId: 'long-outline-foreshadow',
      modelConfig: { primary: 'claude', fallback: 'gpt4o', temperature: 0.6, tier: 'balanced' },
      inputMapping: { chapterRouting: 'chain_output.node_4', characterArcs: 'chain_output.node_3' },
      outputMapping: { foreshadowNetwork: 'node_5.foreshadowNetwork' },
      timeout: 45,
      retryCount: 2,
      description: '规划跨卷的伏笔铺设与回收网络',
    };

    return {
      id: 'long-outline',
      name: '长篇大纲生成',
      version: '1.0.0',
      description: '基于千层饼架构生成完整长篇大纲（卷→章→节四层）',
      nodes: [node1, node2, node3, node4, node5],
      variables: [],
      executionMode: 'sequential',
      config: {
        timeout: 300,
        maxRetries: 3,
        enableLogging: true,
        enableQualityGate: false,
        strictMode: false,
      },
    };
  }
}
