/**
 * 短篇故事三步骤 Chain 服务
 *
 * 基于短故事三步骤.md 实现三个 Chain：
 *
 * Chain C: 正文生成（大纲→正文，天龙8步法）
 *   - 节点0: 上下文装配
 *   - 节点1-8: 天龙8步逐步生成
 *   - 节点9: 正文合成
 *   - 节点10: 质量门检测
 */
import { Injectable, Logger } from '@nestjs/common';
import { ChainEngineService } from './chain-engine.service';
import { PromptRegistryService } from './prompt-registry.service';
import {
  PromptChain,
  ChainNode,
  ChainResult,
  ExecutionMode,
  ThemeReport,
  FullOutline,
  ChapterQAReport,
  TianlongStepResult,
  ChapterContext,
  QualityGateConfig,
  GateCheckType,
} from './chain.types';

@Injectable()
export class StoryChainService {
  private readonly logger = new Logger(StoryChainService.name);

  constructor(
    private readonly chainEngine: ChainEngineService,
    private readonly promptRegistry: PromptRegistryService,
  ) {}

  // ==================== Chain C: 天龙8步正文生成 ====================

  /**
   * 执行阶段三：天龙8步正文生成 Chain
   *
   * @param userInput 用户输入 { outline, chapterContext }
   * @returns Chain 执行结果，包含完整章节正文和质检报告
   */
  async executeStage3(
    userInput: {
      outline: FullOutline;
      chapterContext: ChapterContext;
      chapterNumber: number;
      chapterOutline: string;
      chapterFunction: string;
    },
    onProgress?: (nodeIndex: number, nodeId: string, status: 'started' | 'completed' | 'failed', result?: any) => void,
  ): Promise<ChainResult> {
    this.logger.log(`执行阶段三：天龙8步正文生成 Chain (第${userInput.chapterNumber}章)`);

    const chain = this.buildStage3Chain();
    return this.chainEngine.execute(chain, userInput as unknown as Record<string, unknown>, onProgress);
  }

  /**
   * 构建阶段三 Chain 定义
   * Chain C: 上下文装配 → 天龙8步(8个节点) → 正文合成 → 章节质检
   */
  private buildStage3Chain(): PromptChain {
    // 节点0: 上下文装配（Transform 节点，非 LLM）
    const node0: ChainNode = {
      id: 'node_0_context_assembly',
      name: '上下文装配',
      type: 'transform',
      chainId: 'tianlong-8step',
      promptTemplateId: undefined,
      modelConfig: { primary: 'deepseek', temperature: 0.5, tier: 'economy' },
      inputMapping: {
        outline: 'user_input.outline',
        chapterContext: 'user_input.chapterContext',
        chapterNumber: 'user_input.chapterNumber',
        chapterOutline: 'user_input.chapterOutline',
      },
      outputMapping: {},
      timeout: 10,
      retryCount: 0,
      description: '装配 RAG 上下文：本章大纲+角色状态+伏笔状态+前文摘要',
    };

    // 节点1: 目标
    const node1: ChainNode = {
      id: 'node_1_goal',
      name: '天龙8步-目标',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step1-goal',
      modelConfig: { primary: 'claude', fallback: 'gpt4o', temperature: 0.5, tier: 'performance' },
      inputMapping: {
        outline: 'user_input.outline',
        chapterContext: 'user_input.chapterContext',
        chapterNumber: 'user_input.chapterNumber',
        chapterOutline: 'user_input.chapterOutline',
      },
      outputMapping: { goal: 'node_1.goal', motivation: 'node_1.motivation', winCondition: 'node_1.winCondition', protagonist: 'node_1.protagonist' },
      timeout: 30,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_1_goal',
        checkType: 'rule_and_llm',
        criteria: [
          { name: '目标一致性', description: '目标与角色动机一致', weight: 1.0, minScore: 80 },
        ],
        threshold: 70,
        level: 'WARNING',
        onFailure: 'retry',
        maxRetries: 2,
      },
      description: '设定本章主角目标：主角想达成什么',
    };

    // 节点2: 诱因
    const node2: ChainNode = {
      id: 'node_2_trigger',
      name: '天龙8步-诱因',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step2-trigger',
      modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.6, tier: 'economy' },
      inputMapping: { goal: 'chain_output.node_1' },
      outputMapping: { triggerEvent: 'node_2.triggerEvent', triggerMethod: 'node_2.triggerMethod', urgency: 'node_2.urgency' },
      timeout: 30,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_2_trigger',
        checkType: 'llm_judge',
        criteria: [
          { name: '诱因质量', description: '诱因具体、突然、有压迫感', weight: 1.0, minScore: 70 },
        ],
        threshold: 70,
        level: 'WARNING',
        onFailure: 'retry',
        maxRetries: 2,
      },
      description: '设计刺激主角行动的事件：什么事件逼主角行动',
    };

    // 节点3: 行动
    const node3: ChainNode = {
      id: 'node_3_action',
      name: '天龙8步-行动',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step3-action',
      modelConfig: { primary: 'deepseek', fallback: 'kimi', temperature: 0.8, tier: 'economy' },
      inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2' },
      outputMapping: {},
      timeout: 60,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_3_action',
        checkType: 'rule_and_llm',
        criteria: [
          { name: 'OOC检测', description: '角色行为不违背人设', weight: 1.0, minScore: 70 },
          { name: '主动行动', description: '主角主动做事，非纯心理', weight: 1.0, minScore: 70 },
        ],
        threshold: 70,
        level: 'CRITICAL',
        onFailure: 'retry',
        maxRetries: 3,
      },
      description: '描写主角的具体行动：主角具体做了什么',
    };

    // 节点4: 阻碍
    const node4: ChainNode = {
      id: 'node_4_obstacle',
      name: '天龙8步-阻碍',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step4-obstacle',
      modelConfig: { primary: 'claude', fallback: 'deepseek', temperature: 0.6, tier: 'balanced' },
      inputMapping: { action: 'chain_output.node_3' },
      outputMapping: { obstacleType: 'node_4.obstacleType', description: 'node_4.description', protagonistReaction: 'node_4.protagonistReaction' },
      timeout: 30,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_4_obstacle',
        checkType: 'llm_judge',
        criteria: [
          { name: '阻碍合理性', description: '阻碍合理且有张力', weight: 1.0, minScore: 70 },
        ],
        threshold: 70,
        level: 'WARNING',
        onFailure: 'retry',
        maxRetries: 2,
      },
      description: '设计主角遇到的阻力：主角遇到什么阻力',
    };

    // 节点5: 误判
    const node5: ChainNode = {
      id: 'node_5_misjudge',
      name: '天龙8步-误判',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step5-misjudge',
      modelConfig: { primary: 'gpt4o', fallback: 'claude', temperature: 0.7, tier: 'balanced' },
      inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', action: 'chain_output.node_3', obstacle: 'chain_output.node_4' },
      outputMapping: { protagonistThinks: 'node_5.protagonistThinks', actualTruth: 'node_5.actualTruth', infoGapSource: 'node_5.infoGapSource', consequenceOfMisjudgment: 'node_5.consequenceOfMisjudgment' },
      timeout: 30,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_5_misjudge',
        checkType: 'rule_and_llm',
        criteria: [
          { name: '误判合理性', description: '误判与前文信息一致（非降智）', weight: 1.0, minScore: 70 },
        ],
        threshold: 70,
        level: 'CRITICAL',
        onFailure: 'retry',
        maxRetries: 3,
      },
      description: '设定主角的错误判断：主角做出什么错误判断',
    };

    // 节点6: 反转（核心高潮节点）
    const node6: ChainNode = {
      id: 'node_6_reversal',
      name: '天龙8步-反转',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step6-reversal',
      modelConfig: { primary: 'claude', temperature: 0.7, tier: 'performance' },
      inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', action: 'chain_output.node_3', obstacle: 'chain_output.node_4', misjudge: 'chain_output.node_5' },
      outputMapping: { reversalType: 'node_6.reversalType', reversalMoment: 'node_6.reversalMoment', reactions: 'node_6.reactions' },
      timeout: 60,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_6_reversal',
        checkType: 'rule_and_llm',
        criteria: [
          { name: '伏笔支撑', description: '反转有前文伏笔支撑', weight: 1.2, minScore: 80 },
          { name: '冲击力', description: '反转的冲击力', weight: 1.0, minScore: 80 },
        ],
        threshold: 80,
        level: 'CRITICAL',
        onFailure: 'retry',
        maxRetries: 3,
      },
      description: '设计本章的信息或局势反转：局势或信息如何反转',
    };

    // 节点7: 代价
    const node7: ChainNode = {
      id: 'node_7_cost',
      name: '天龙8步-代价',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step7-cost',
      modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.7, tier: 'economy' },
      inputMapping: { reversal: 'chain_output.node_6' },
      outputMapping: { costType: 'node_7.costType', description: 'node_7.description', subsequentImpact: 'node_7.subsequentImpact' },
      timeout: 30,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_7_cost',
        checkType: 'rule',
        criteria: [
          { name: '代价匹配', description: '代价与反转匹配', weight: 1.0, minScore: 60 },
        ],
        threshold: 60,
        level: 'WARNING',
        onFailure: 'retry',
        maxRetries: 2,
      },
      description: '描写反转后的代价：主角因此付出什么代价',
    };

    // 节点8: 钩子
    const node8: ChainNode = {
      id: 'node_8_hook',
      name: '天龙8步-钩子',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-step8-hook',
      modelConfig: { primary: 'gpt4o', fallback: 'claude', temperature: 0.8, tier: 'performance' },
      inputMapping: { goal: 'chain_output.node_1', trigger: 'chain_output.node_2', reversal: 'chain_output.node_6', cost: 'chain_output.node_7' },
      outputMapping: { hookType: 'node_8.hookType', hookText: 'node_8.hookText', nextChapterDirection: 'node_8.nextChapterDirection' },
      timeout: 30,
      retryCount: 2,
      qualityGate: {
        nodeId: 'node_8_hook',
        checkType: 'llm_judge',
        criteria: [
          { name: '钩子强度', description: '钩子制造"想看下一章"的欲望', weight: 1.0, minScore: 70 },
        ],
        threshold: 70,
        level: 'CRITICAL',
        onFailure: 'retry',
        maxRetries: 3,
      },
      description: '设计本章结尾的强钩子：本章结尾留下什么悬念',
    };

    // 节点9: 正文合成（Transform 节点，非 LLM）
    const node9: ChainNode = {
      id: 'node_9_chapter_synthesis',
      name: '正文合成',
      type: 'transform',
      chainId: 'tianlong-8step',
      promptTemplateId: undefined,
      modelConfig: { primary: 'deepseek', temperature: 0.5, tier: 'economy' },
      inputMapping: {
        action: 'chain_output.node_3',
        reversal: 'chain_output.node_6',
        cost: 'chain_output.node_7',
        hook: 'chain_output.node_8',
      },
      outputMapping: {},
      timeout: 10,
      retryCount: 0,
      description: '将行动+反转+代价+钩子拼接为完整章节',
    };

    // 节点10: 章节质检
    const node10: ChainNode = {
      id: 'node_10_chapter_qa',
      name: '章节质检',
      type: 'prompt',
      chainId: 'tianlong-8step',
      promptTemplateId: 'tianlong-chapter-qa',
      modelConfig: { primary: 'claude', fallback: 'gpt4o', temperature: 0.3, tier: 'performance' },
      inputMapping: {
        chapterOutline: 'user_input.chapterOutline',
        fullChapter: 'chain_output.node_9',
      },
      outputMapping: {},
      timeout: 30,
      retryCount: 1,
      qualityGate: {
        nodeId: 'node_10_chapter_qa',
        checkType: 'rule_and_llm',
        criteria: [
          { name: '综合质量', description: '综合质量评分', weight: 1.0, minScore: 70 },
          { name: '天龙8步完整性', description: '8步要素是否齐全', weight: 1.0, minScore: 80 },
          { name: '钩子强度', description: '结尾钩子检查', weight: 1.0, minScore: 70 },
          { name: '字数检查', description: '字数不少于目标50%', weight: 0.8, minScore: 50 },
        ],
        threshold: 70,
        level: 'CRITICAL',
        onFailure: 'retry',
        maxRetries: 2,
        fallbackNodeId: 'node_6_reversal', // 不通过回退到反转节点
      },
      description: '章节质量门检测：检查8步要素/字数/钩子强度',
    };

    return {
      id: 'tianlong-8step',
      name: '天龙8步正文生成',
      version: '1.0.0',
      description: '阶段三：基于大纲使用天龙8步法生成完整章节正文',
      nodes: [node0, node1, node2, node3, node4, node5, node6, node7, node8, node9, node10],
      variables: [
        { name: 'outline', source: 'user_input', path: 'outline', required: true, description: '完整大纲' },
        { name: 'chapterContext', source: 'user_input', path: 'chapterContext', required: true, description: '章节执行上下文' },
        { name: 'chapterNumber', source: 'user_input', path: 'chapterNumber', required: true, description: '当前章节号' },
        { name: 'chapterOutline', source: 'user_input', path: 'chapterOutline', required: true, description: '本章大纲' },
        { name: 'chapterFunction', source: 'user_input', path: 'chapterFunction', required: true, description: '本章剧情功能' },
      ],
      executionMode: 'sequential',
      config: {
        timeout: 300,
        maxRetries: 3,
        enableLogging: true,
        enableQualityGate: true,
        strictMode: false,
      },
    };
  }

  // ==================== 长篇大纲 Chain ====================

  /**
   * 执行长篇大纲生成
   * 基于游蜂千层饼架构：全书→卷→章→节四层
   */
  async executeLongOutline(userInput: {
    projectTitle: string;
    outline: string;
    volumeCount: number;
    chaptersPerVolume: number;
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
      inputMapping: { globalSettings: 'chain_output.node_1', volumeCount: 'user_input.volumeCount', chaptersPerVolume: 'user_input.chaptersPerVolume' },
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
