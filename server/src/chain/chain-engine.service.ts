/**
 * Chain 编排引擎核心服务
 *
 * 实现：
 * - PromptChain 链定义加载与校验
 * - ChainExecutor 顺序执行/条件分支/重试逻辑
 * - Handlebars 模板变量注入
 * - 节点级别质量门检查
 * - 执行上下文管理
 *
 * 设计基于 Prompt Chain 架构文档的引擎层规范
 */
import { Injectable, Logger } from '@nestjs/common';
import { PromptRegistryService } from './prompt-registry.service';
import { QualityGateService } from './quality-gate.service';
import { RealLLMService } from './real-llm.service';
import {
  PromptChain,
  ChainNode,
  ExecutionContext,
  ChainResult,
  NodeResult,
  ChainError,
  ChainState,
  NodeType,
  QualityGateConfig,
  GateCheckType,
} from './chain.types';

/**
 * Chinese prose is close to one token per character for the configured models.
 * Keep a small completion margin, but never advertise enough budget for a
 * second full chapter when the chapter contract is 3200–4000 words.
 */
export const chapterSynthesisMaxTokens = (targetWords: number): number => (
  Math.min(4_800, Math.max(3_800, Math.ceil(targetWords * 1.15)))
);

/** 节点执行上下文（运行时） */
interface NodeExecutionContext {
  node: ChainNode;
  resolvedInput: Record<string, unknown>;
  retryCount: number;
}

@Injectable()
export class ChainEngineService {
  private readonly logger = new Logger(ChainEngineService.name);

  /** 模拟节点延迟（开发用） */
  private readonly mockNodeDelay = 100;

  constructor(
    private readonly promptRegistry: PromptRegistryService,
    private readonly qualityGate: QualityGateService,
    private readonly llm: RealLLMService,
  ) {}

  // ==================== 公共 API ====================

  /**
   * 执行一个完整的 Prompt Chain
   *
   * @param chain Chain 定义
   * @param userInput 用户输入变量
   * @param onProgress 可选，节点执行进度回调（用于 SSE 推送）
   * @returns Chain 执行结果
   */
  async execute(
    chain: PromptChain,
    userInput: Record<string, unknown>,
    onProgress?: (nodeIndex: number, nodeId: string, status: 'started' | 'completed' | 'failed', result?: any) => void,
  ): Promise<ChainResult> {
    const startTime = new Date();
    this.logger.log(`开始执行 Chain: ${chain.id}(${chain.name}) v${chain.version}`);

    const context = this.createContext(chain.id, userInput);
    const nodeResults: NodeResult[] = [];
    const errors: ChainError[] = [];
    let overallState: ChainState = 'running';

    try {
      // 按序执行节点
      for (let i = 0; i < chain.nodes.length; i++) {
        const node = chain.nodes[i];

        // 进度回调：节点开始
        onProgress?.(i, node.id, 'started');

        // 检查分支跳转标记
        if (context.metadata['_branch_jump'] && context.metadata['_branch_jump'] !== node.id) {
          continue;
        }
        // 清除跳转标记
        delete context.metadata['_branch_jump'];

        const nodeResult = await this.executeNode(node, context, chain);
        nodeResults.push(nodeResult);

        // 进度回调：节点完成/失败
        onProgress?.(i, node.id, nodeResult.status === 'success' ? 'completed' : 'failed', nodeResult);

        // 更新上下文
        context.timestamps[node.id] = new Date();
        context.nodeOutputs[node.id] = nodeResult.output;

        // 将节点输出映射到全局变量
        if (nodeResult.status === 'success' && nodeResult.output) {
          this.applyOutputMapping(node, nodeResult.output, context);
        }

        // 处理失败情况
        if (nodeResult.status === 'failed') {
          errors.push({
            nodeId: node.id,
            message: nodeResult.error || '节点执行失败',
            type: 'llm_error',
            recoverable: false,
          });

          if (chain.config.strictMode) {
            overallState = 'failed';
            break;
          }

          // 降级执行
          if (node.nextOnFailure) {
            const fallbackNodeIndex = chain.nodes.findIndex(
              (n) => n.id === node.nextOnFailure,
            );
            if (fallbackNodeIndex > -1) {
              i = fallbackNodeIndex - 1; // 循环会 +1
              continue;
            }
          }
        }

        // 处理质量门失败
        if (nodeResult.gateResult && !nodeResult.gateResult.passed) {
          if (chain.config.strictMode) {
            overallState = node.qualityGate?.level === 'CRITICAL' ? 'failed' : 'partial';
            if (overallState === 'failed') break;
          }
        }
      }

      // 检查是否有分支跳转
      if (context.metadata['_branch_jump']) {
        const targetId = context.metadata['_branch_jump'] as string;
        const targetNode = chain.nodes.find((n) => n.id === targetId);
        if (targetNode) {
          this.logger.log(`[${chain.id}] 条件分支跳转到: ${targetId}`);
        }
      }

      // 汇总结果
      if (overallState === 'running') {
        overallState = errors.length > 0 ? 'partial' : 'completed';
      }

      const endTime = new Date();
      const totalLatency = endTime.getTime() - startTime.getTime();

      // 收集所有质量门结果
      const gateResults: Record<string, any> = {};
      for (const nr of nodeResults) {
        if (nr.gateResult) {
          gateResults[nr.nodeId] = nr.gateResult;
        }
      }

      this.logger.log(
        `Chain ${chain.id} 执行完成，状态: ${overallState}，耗时: ${totalLatency}ms`,
      );

      return {
        chainId: chain.id,
        chainName: chain.name,
        status: overallState,
        outputs: { ...context.nodeOutputs },
        nodeResults,
        gateResults,
        errors,
        totalLatency,
        startTime,
        endTime,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Chain ${chain.id} 执行异常: ${errMsg}`);

      overallState = 'failed';
      errors.push({
        nodeId: 'chain',
        message: errMsg,
        type: 'internal',
        recoverable: false,
      });

      return {
        chainId: chain.id,
        chainName: chain.name,
        status: overallState,
        outputs: { ...context.nodeOutputs },
        nodeResults,
        gateResults: {},
        errors,
        totalLatency: new Date().getTime() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    }
  }

  /**
   * 执行单个节点（支持重试逻辑）
   */
  async executeNode(
    node: ChainNode,
    context: ExecutionContext,
    chain: PromptChain,
  ): Promise<NodeResult> {
    const startTime = Date.now();
    const nodeLog = `[${node.chainId}/${node.id}]`;
    this.logger.log(`${nodeLog} 开始执行`);

    let currentRetryCount = 0;
    const maxRetries = node.qualityGate?.maxRetries ?? node.retryCount;
    let lastOutput: unknown = null;
    let lastError: string | null = null;

    while (currentRetryCount <= maxRetries) {
      try {
        // 1. 输入映射：从上下文提取本节点需要的变量
        const resolvedInput = this.resolveInputMapping(node.inputMapping, context);

        // 2. 检查是否跳过
        if (node.skipOnEmptyInput && this.isInputEmpty(resolvedInput)) {
          this.logger.log(`${nodeLog} 输入为空，跳过此节点`);
          return {
            nodeId: node.id,
            nodeName: node.name,
            status: 'skipped',
            output: null,
            latency: Date.now() - startTime,
            retryCount: 0,
            timestamp: new Date(),
          };
        }

        // 3. 根据节点类型执行
        let output: unknown;

        switch (node.type) {
          case 'prompt':
            output = await this.executePromptNode(node, resolvedInput, context, currentRetryCount, chain);
            break;
          case 'transform':
            output = await this.executeTransformNode(node, resolvedInput, context);
            break;
          case 'condition':
            output = this.executeConditionNode(node, resolvedInput, context);
            break;
          default:
            output = await this.executePromptNode(node, resolvedInput, context, currentRetryCount, chain);
        }

        lastOutput = output;

        // 4. 质量门检查
        if (node.qualityGate && chain.config.enableQualityGate) {
          const gateResult = await this.runQualityGate(
            node.qualityGate,
            output,
            node.id,
          );

          if (!gateResult.passed) {
            // 更新重试计数器
            context.retryCounters[node.id] = (context.retryCounters[node.id] || 0) + 1;
            context.qualityGateFailures[node.id] = [
              ...(context.qualityGateFailures[node.id] || []),
              gateResult,
            ];

            const shouldRetry = this.qualityGate.shouldRetry(
              gateResult,
              node.qualityGate.level,
              maxRetries,
              currentRetryCount,
            );

            if (shouldRetry) {
              currentRetryCount++;
              this.logger.warn(
                `${nodeLog} 质量门未通过(得分:${gateResult.score})，第${currentRetryCount}次重试`,
              );
              continue;
            }

            // 重试用尽
            const status = node.qualityGate.level === 'CRITICAL' ? 'failed' : 'partial';
            return {
              nodeId: node.id,
              nodeName: node.name,
              status,
              output,
              gateResult,
              error: `质量门未通过: ${gateResult.summary}`,
              latency: Date.now() - startTime,
              retryCount: currentRetryCount,
              timestamp: new Date(),
            };
          }

          this.logger.debug(`${nodeLog} 质量门通过(得分:${gateResult.score})`);

          return {
            nodeId: node.id,
            nodeName: node.name,
            status: 'success',
            output,
            gateResult,
            latency: Date.now() - startTime,
            retryCount: currentRetryCount,
            timestamp: new Date(),
          };
        }

        // 无质量门配置，直接返回成功
        return {
          nodeId: node.id,
          nodeName: node.name,
          status: 'success',
          output,
          latency: Date.now() - startTime,
          retryCount: currentRetryCount,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.error(`${nodeLog} 执行错误: ${lastError}`);

        if (currentRetryCount < maxRetries) {
          currentRetryCount++;
          this.logger.warn(`${nodeLog} 第${currentRetryCount}次重试`);
          await this.delay(500); // 重试前短暂等待
          continue;
        }

        return {
          nodeId: node.id,
          nodeName: node.name,
          status: 'failed',
          output: lastOutput,
          error: lastError,
          latency: Date.now() - startTime,
          retryCount: currentRetryCount,
          timestamp: new Date(),
        };
      }
    }

    // 不应到达这里
    return {
      nodeId: node.id,
      nodeName: node.name,
      status: 'failed',
      output: lastOutput,
      error: lastError || '达到最大重试次数',
      latency: Date.now() - startTime,
      retryCount: currentRetryCount,
      timestamp: new Date(),
    };
  }

  // ==================== Prompt 节点执行 ====================

  /**
   * 执行 Prompt 节点
   * 1. 获取模板并渲染
   * 2. 调用 LLM
   * 3. 尝试解析 JSON 输出
   */
  private async executePromptNode(
    node: ChainNode,
    input: Record<string, unknown>,
    context: ExecutionContext,
    retryCount: number,
    chain: PromptChain,
  ): Promise<unknown> {
    // 获取并渲染 Prompt 模板
    let prompt: string;
    if (node.promptTemplateId) {
      prompt = this.promptRegistry.render(node.promptTemplateId, {
        ...context.variables,
        ...input,
        user_input: { ...(context.variables['user_input'] as Record<string, unknown> || {}) },
        chain_output: { ...context.nodeOutputs },
        retry_count: retryCount,
      });
    } else {
      // 无模板 ID 时，使用输入拼接
      prompt = JSON.stringify(input, null, 2);
    }

    // 调用 LLM
    const response = await this.llm.generate({
      prompt,
      temperature: this.calculateTemperature(node.modelConfig.temperature, retryCount),
      timeout: node.timeout * 1000,
      scenario: chain.id,
      retryCount,
    });

    // 尝试解析 JSON
    return this.tryParseJSON(response.content);
  }

  /**
   * 执行 Transform 节点（非 LLM 处理节点）
   * 负责数据转换、上下文装配、结果合成
   */
  private async executeTransformNode(
    node: ChainNode,
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): Promise<unknown> {
    this.logger.log(`[${node.id}] Transform 节点执行`);

    // ---- 节点0：上下文装配 ----
    if (node.id === 'node_0_context_assembly') {
      const outline = input['outline'] as any;
      const chapterContext = input['chapterContext'] as any;
      const chapterNumber = input['chapterNumber'] as number;
      const chapterOutline = input['chapterOutline'] as any;

      // 从 context.variables 里取 RAG 增强的上下文（如果有的话）
      const ragContext = context.variables['ragContext'] as any;
      const characterStates = context.variables['characterStates'] as any[];
      const foreshadowingStatus = context.variables['foreshadowingStatus'] as any[];

      const assembled = {
        outline,
        chapterContext,
        chapterNumber,
        chapterOutline,
        // RAG 上下文：前文摘要、角色最新状态、伏笔状态
        ragContext: ragContext || null,
        characterStates: characterStates || [],
        foreshadowingStatus: foreshadowingStatus || [],
        // 装配时间戳（用于调试）
        assembledAt: new Date().toISOString(),
      };

      this.logger.log(`[node_0] 上下文装配完成：章节${chapterNumber}，角色${characterStates?.length || 0}个，伏笔${foreshadowingStatus?.length || 0}条`);
      return assembled;
    }

    // ---- 节点9：正文合成 ----
    if (node.id === 'node_9_chapter_synthesis') {
      // input 里的字段来自 inputMapping，可能是对象也可能是字符串
      const extractText = (val: unknown): string => {
        if (typeof val === 'string') return val;
        if (val && typeof val === 'object') {
          // 尝试取常见文本字段
          const obj = val as Record<string, unknown>;
          return (obj['actionText'] || obj['reversalText'] || obj['costText'] || obj['hookText'] || obj['text'] || obj['content'] || JSON.stringify(val)) as string;
        }
        return String(val || '');
      };

      const goalText = extractText(input['goal']);
      const triggerText = extractText(input['trigger']);
      const actionText = extractText(input['action']);
      const obstacleText = extractText(input['obstacle']);
      const misjudgeText = extractText(input['misjudge']);
      const reversalText = extractText(input['reversal']);
      const costText = extractText(input['cost']);
      const hookText = extractText(input['hook']);
      const targetWords = Number(input['targetWords']);
      if (!Number.isInteger(targetWords) || targetWords < 3200 || targetWords > 4000) {
        throw new Error('本章缺少有效的3200-4000字动态目标，拒绝生成正文');
      }
      const countNarrativeWords = (text: string) => {
        const chinese = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
        const english = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').split(/\s+/).filter(token => /[a-zA-Z]/.test(token)).length;
        return chinese + english;
      };
      const outputMaxTokens = chapterSynthesisMaxTokens(targetWords);

      // 将8步输出拼接为完整章节正文
      const sections: string[] = [];

      if (goalText) sections.push(goalText);
      if (triggerText) sections.push(triggerText);
      if (actionText) sections.push(actionText);
      if (obstacleText) sections.push(`\n${obstacleText}`);
      if (misjudgeText) sections.push(`\n${misjudgeText}`);
      if (reversalText) sections.push(`\n${reversalText}`);
      if (costText) sections.push(`\n${costText}`);
      if (hookText) sections.push(`\n${hookText}`);

      const fullText = sections.join('\n\n').trim();

      // 通过 LLM 将拼接的8步文本润色为连贯、有风格的章节正文
      let polishedText = fullText;
      try {
        const sceneContext = typeof context.variables['chapterFunction'] === 'string' ? context.variables['chapterFunction'] : '';
        const chapterOutline = String(input['chapterOutline'] || context.variables['chapterOutline'] || '').trim();
        const chapterContext = input['chapterContext'] || context.variables['chapterContext'];
        if (!chapterOutline || chapterOutline.length < 20) {
          throw new Error('本章缺少可执行的详细大纲，拒绝用八步法自行编造故事');
        }
        const serializedContext = typeof chapterContext === 'string'
          ? chapterContext
          : JSON.stringify(chapterContext || {});
        const chapterContract = `【本章不可偏离的创作合同】\n章节：第${input['chapterNumber'] || context.variables['chapterNumber'] || ''}章\n详细大纲：\n${chapterOutline}\n\n确认的故事上下文（人物、世界观、时间线、前文与伏笔）：\n${serializedContext}\n\n合同执行规则：正文必须把详细大纲中的核心事件、冲突、人物行动和结尾钩子写成实际发生的叙事；不得用同主题的另一件事替代，不得引入合同外的主线人物、设定、案件或结局。若八步草稿与合同冲突，以合同为准并重写草稿。`;
        const stylePrompt = `你是中文小说作者。请将以下8步草稿扩写并重写为连贯、完整、可直接阅读的章节正文。不要分段加小标题，自然融合为连续叙事。
本章动态目标为${targetWords}字；最终正文必须在3200-4000字之间。不得概述、压缩、跳过场景或以提纲代替叙事；请用事件推进、行动、对话、细节和心理变化自然达到篇幅。只输出正文，不输出字数、说明或JSON。

要求：
1. 正文必须服从已确认的大纲、角色状态、世界观规则、时间线和伏笔；八步法只作为内部骨架，正文不得出现步骤标识，也不得为了文风改写既有事实。
2. 使用自然短段落而非整齐分节；句式、段长、信息密度要随人物和场景变化，禁止排比、对仗、总结式升华和模板化收束。
3. 具体不空泛：让情节通过可观察的动作、物件、声音、光线、气味、触感和即时选择发生；少用“紧张”“悲伤”“他很愤怒”这类结论代替现场。
4. 角色必须像独立的人：说话节奏、词汇、回避方式、注意的东西和行动逻辑都要从其已知设定、立场和经历推出。不要让所有人语气相同，也不要为制造差异凭空增加设定。
5. 留白而非讲解：不要替读者解释每个动机、因果和情绪。允许答非所问、话说半截、沉默、误会、被忽略的物件和没有立刻追问的细节，让读者自行连接含义。
6. 不要过度工整，但“毛边”只能来自人物的犹豫、偏见、临时选择或信息差；不得偏离本章剧情任务、破坏角色逻辑或跳过应有的关键事件。
7. 开头尽快进入事件，对话必须带有各自目的和潜台词，避免角色轮流完整解释；结尾保留与本章大纲一致的钩子或未解信息。
8. 本章功能是：${sceneContext}。确保剧情推进匹配此功能定位。

${chapterContract}

草稿内容：
${fullText}`;

        const llmResp = await this.llm.generate({
          prompt: stylePrompt,
          scenario: 'chapter_synthesis',
          temperature: 0.7,
          maxTokens: outputMaxTokens,
        });
        if (!llmResp?.content || llmResp.content.length <= fullText.length * 0.3) {
          throw new Error('章节合成结果为空或明显不完整');
        }
        polishedText = llmResp.content;
        const generatedWords = countNarrativeWords(polishedText);
        if (generatedWords < 3200) {
          const expansion = await this.llm.generate({
            prompt: `以下章节初稿只有${generatedWords}字，未达到本章${targetWords}字的写作合同。请在不改变既有角色、世界观规则、事件顺序、时间线、伏笔和结局钩子的前提下，输出一篇完整重写后的正文，不是续写片段。必须通过补足可感知的行动、场景转换、人物对话、细节、心理与因果推进，将全文控制在3200-4000字，目标约${targetWords}字。
人物不许同声同气：让每人按自己的立场、习惯与信息量说话、回避或行动；不要把动机和真相替读者解释完，用停顿、错答、物件、未被追问的细节保留推想空间。允许节奏有毛边，但不得偏离章节大纲或制造新设定。只输出正文，不要解释。\n\n${chapterContract}\n\n初稿：\n${polishedText}`,
            scenario: 'chapter_synthesis',
            temperature: 0.7,
            maxTokens: outputMaxTokens,
          });
          if (!expansion?.content) throw new Error('章节补写未返回正文');
          polishedText = expansion.content;
        }
        const expandedWords = countNarrativeWords(polishedText);
        if (expandedWords > 4000) {
          const compression = await this.llm.generate({
            prompt: `以下完整章节为${expandedWords}字，超过本章${targetWords}字的写作合同。请在不删除详细大纲要求的核心事件、冲突、人物行动、因果、伏笔和结尾钩子的前提下，输出一篇完整精炼重写后的正文，不是摘要、删节片段或续写。删去重复解释、同义反复和无效场景，保留可感知的动作、对话和关键细节。全文必须严格为3200-4000字，目标约${targetWords}字。只输出正文，不要解释。\n\n${chapterContract}\n\n待精炼全文：\n${polishedText}`,
            scenario: 'chapter_synthesis',
            temperature: 0.55,
            maxTokens: outputMaxTokens,
          });
          if (!compression?.content) throw new Error('章节精炼未返回正文');
          polishedText = compression.content;
        }
        const finalWords = countNarrativeWords(polishedText);
        if (finalWords < 3200 || finalWords > 4000) {
          throw new Error(`章节合成后的正文为${finalWords}字，不符合3200-4000字要求`);
        }
      } catch (e) {
        throw new Error(`章节合成失败，未使用原始步骤拼接内容降级：${e instanceof Error ? e.message : String(e)}`);
      }

      this.logger.log(`[node_9] 正文合成完成：原始 ${fullText.length} → 润色后 ${polishedText.length} 字符`);

      return {
        fullText: polishedText,
        wordCount: polishedText.length,
        stepsUsed: 8,
      };
    }

    // ---- 其他 Transform 节点：默认透传 ----
    this.logger.debug(`[${node.id}] Transform 节点透传`);
    return input;
  }

  /**
   * 执行 Condition 节点（条件分支）
   */
  private executeConditionNode(
    node: ChainNode,
    input: Record<string, unknown>,
    context: ExecutionContext,
  ): unknown {
    this.logger.debug(`[${node.id}] Condition 节点执行`);

    if (node.branches && node.branches.length > 0) {
      // 简单条件评估（当前选择第一个匹配的分支）
      const matchedBranch = node.branches[0];
      context.metadata['_branch_jump'] = matchedBranch.targetNodeId;
      this.logger.log(`[${node.id}] 条件分支: ${matchedBranch.description} → ${matchedBranch.targetNodeId}`);

      return {
        matched: true,
        targetNodeId: matchedBranch.targetNodeId,
        description: matchedBranch.description,
      };
    }

    return { matched: false };
  }

  // ==================== 辅助方法 ====================

  /**
   * 创建执行上下文
   */
  private createContext(
    chainId: string,
    userInput: Record<string, unknown>,
  ): ExecutionContext {
    return {
      chainId,
      variables: {
        user_input: userInput,
        ...userInput,
      },
      nodeOutputs: {},
      retryCounters: {},
      qualityGateFailures: {},
      startTime: new Date(),
      timestamps: {},
      metadata: {},
    };
  }

  /**
   * 解析输入映射
   * 从上下文中提取节点输入变量
   */
  private resolveInputMapping(
    mapping: Record<string, string>,
    context: ExecutionContext,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, path] of Object.entries(mapping)) {
      resolved[key] = this.resolvePath(context, path);
    }

    return resolved;
  }

  /**
   * 按路径解析变量值
   * 支持点号路径：chain_output.node_1.coreTheme
   */
  private resolvePath(context: ExecutionContext, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = context.variables;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 将节点输出映射到上下文变量
   */
  private applyOutputMapping(
    node: ChainNode,
    output: unknown,
    context: ExecutionContext,
  ): void {
    if (typeof output !== 'object' || output === null) return;

    const outputObj = output as Record<string, unknown>;
    // 自动映射：node.id → nodeOutputs[node.id]
    context.nodeOutputs[node.id] = output;

    // 按 outputMapping 显式映射
    for (const [key, path] of Object.entries(node.outputMapping)) {
      const value = outputObj[key];
      if (value !== undefined) {
        this.setPath(context, `chain_output.${path}`, value);
      }
    }
  }

  /**
   * 按路径设置变量值
   */
  private setPath(context: ExecutionContext, path: string, value: unknown): void {
    const parts = path.split('.');
    const varName = parts[0];

    if (!context.variables[varName]) {
      context.variables[varName] = {};
    }

    let current = context.variables[varName] as Record<string, unknown>;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    if (parts.length > 1) {
      current[parts[parts.length - 1]] = value;
    }
  }

  /**
   * 执行质量门检查
   */
  private async runQualityGate(
    config: QualityGateConfig,
    output: unknown,
    nodeId: string,
  ) {
    switch (config.checkType) {
      case 'rule':
        return this.qualityGate.evaluateByRule(
          config,
          (typeof output === 'object' ? output : {}) as Record<string, unknown>,
          nodeId,
        );
      case 'llm_judge':
        return this.qualityGate.evaluateByLLM(
          config,
          typeof output === 'string' ? output : JSON.stringify(output),
          nodeId,
        );
      case 'rule_and_llm':
        return this.qualityGate.evaluateCombined(
          config,
          (typeof output === 'object' ? output : {}) as Record<string, unknown>,
          typeof output === 'string' ? output : JSON.stringify(output),
          nodeId,
        );
      default:
        return this.qualityGate.evaluateByRule(
          config,
          (typeof output === 'object' ? output : {}) as Record<string, unknown>,
          nodeId,
        );
    }
  }

  /**
   * 计算执行温度（支持重试升温）
   */
  private calculateTemperature(baseTemp: number, retryCount: number): number {
    let temp = baseTemp;
    if (retryCount > 0) {
      temp += 0.05 * retryCount; // 每次重试 +0.05
    }
    return Math.max(0.2, Math.min(1.2, temp));
  }

  /**
   * 尝试解析 JSON 字符串
   */
  private tryParseJSON(text: string): unknown {
    // 尝试提取 JSON 块
    const jsonMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // JSON 解析失败，返回原文
      }
    }
    return text;
  }

  /**
   * 检查输入是否为空
   */
  private isInputEmpty(input: Record<string, unknown>): boolean {
    return Object.keys(input).length === 0 ||
      Object.values(input).every(
        (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0),
      );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
