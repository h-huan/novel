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
      model: node.modelConfig.primary,
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
        const stylePrompt = `你是第一人称短篇小说写手。请将以下8步草稿重写为连贯的章节正文。不要分段加小标题，自然融合为连续叙事。

要求：
1. 一整段流畅的第一人称叙事，不要保留"目标""诱因""行动"等步骤标识
2. 去AI味：删除"不禁""仿佛""内心深处""似乎""渐渐地"等套话；句式长短错落，不要排比/对仗
3. 具体不空泛：用五感细节替代抽象形容词——写了什么声音、什么颜色、什么气味、什么触感
4. 角色有差异：每个人说话方式不同，小动作不同。有人啰嗦有人只说半句，有人习惯性摸东西有人死盯着你看
5. 留白：不要把所有信息说完。用没说出口的话、被忽略的物件、反常的停顿来暗示
6. 不要过度工整——真实的叙事会跑题、有毛边、有临时改变主意的时候
7. 段落短（手机阅读），对话占比高，开头三句内进入事件
8. 本章功能是：${sceneContext}。确保剧情推进匹配此功能定位。

草稿内容：
${fullText}`;

        const llmResp = await this.llm.generate({
          prompt: stylePrompt,
          scenario: 'chapter_synthesis',
          temperature: 0.7,
          maxTokens: Math.min(fullText.length + 1500, 4096),
        });
        if (llmResp?.content && llmResp.content.length > fullText.length * 0.3) {
          polishedText = llmResp.content;
        }
      } catch (e) { /* 合成润色失败不影响主流程，回退到原始拼接 */ }

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
