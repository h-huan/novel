/**
 * Chain 编排引擎核心服务
 *
 * 实现：
 * - PromptChain 链定义加载与校验
 * - ChainExecutor 顺序执行/条件分支/重试逻辑
 * - Handlebars 模板变量注入
 * - 执行上下文管理
 *
 * 仅由当前固定长篇基础与章纲编排消费，具体业务约束以唯一执行标准为准
 */
import { Injectable, Logger } from '@nestjs/common';
import { PromptRegistryService } from './prompt-registry.service';
import { RealLLMService } from './real-llm.service';
import { gateFailureLabel, isGateRejection, GateRejectionError, classifyGateFailure, type GateFailureReport } from '../modules/writing-quality/gate-failure';
import { describeChapterResponsibilityPlan } from '../../shared/src/chapter-responsibility-review';
import { jsonrepair } from 'jsonrepair';
import { standardScene } from '../routing/scenario-taxonomy';
import {
  PromptChain,
  ChainNode,
  ExecutionContext,
  ChainResult,
  NodeResult,
  ChainError,
  ChainState,
} from './chain.types';

/** 节点执行上下文（运行时） */
interface NodeExecutionContext {
  node: ChainNode;
  resolvedInput: Record<string, unknown>;
  retryCount: number;
}

interface PromptNodeExecutionResult {
  output: unknown;
  runId?: string;
}

@Injectable()
export class ChainEngineService {
  private readonly logger = new Logger(ChainEngineService.name);

  /** 模拟节点延迟（开发用） */
  private readonly mockNodeDelay = 100;

  constructor(
    private readonly promptRegistry: PromptRegistryService,
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

          // Quality-rejected dependencies are unusable even in a chain that
          // permits ordinary optional-node failures. Preserve the upstream
          // report and stop before downstream generation invents a substitute.
          if (chain.config.strictMode || nodeResult.gateReport || node.type !== 'prompt') {
            overallState = 'failed';
            break;
          }

        }

      }

      // 汇总结果
      if (overallState === 'running') {
        overallState = errors.length > 0 ? 'partial' : 'completed';
      }

      const endTime = new Date();
      const totalLatency = endTime.getTime() - startTime.getTime();

      this.logger.log(
        `Chain ${chain.id} 执行完成，状态: ${overallState}，耗时: ${totalLatency}ms`,
      );

      return {
        chainId: chain.id,
        chainName: chain.name,
        status: overallState,
        outputs: { ...context.nodeOutputs },
        nodeResults,
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
    // A generic node retry has no validator feedback and would replay the same
    // prompt. Transport recovery is already handled once inside RealLLMService;
    // content corrections belong to the evidence-aware business workflow.
    const maxRetries = 0;
    let lastOutput: unknown = null;
    let lastError: string | null = null;
    // Gate 拒绝的结构化报告：Error 实例跨节点边界会退化成字符串，报告必须单独留住，
    // 否则上游只能看到「缺少世界观/volumes 为空」这类下游症状，真实成因被吞掉。
    let lastGateReport: GateFailureReport | undefined;

    while (currentRetryCount <= maxRetries) {
      try {
        // 1. 输入映射：从上下文提取本节点需要的变量
        const resolvedInput = this.resolveInputMapping(node.inputMapping, context);

        // Only current Prompt nodes may participate in a fixed production chain.
        // Enforce this before skipOnEmptyInput: a retired node with empty input
        // must not silently skip and unlock downstream generation.
        if (node.type !== 'prompt') {
          throw new Error('当前固定生产链不支持历史 Transform/Condition 节点，拒绝执行');
        }

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

        const promptResult = await this.executePromptNode(node, resolvedInput, context, currentRetryCount, chain);
        const output = promptResult.output;
        const runId = promptResult.runId;

        lastOutput = output;

        return {
          nodeId: node.id,
          nodeName: node.name,
          status: 'success',
          output,
          ...(runId ? { runId } : {}),
          latency: Date.now() - startTime,
          retryCount: currentRetryCount,
          timestamp: new Date(),
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (isGateRejection(error)) {
          lastGateReport = error.report;
          this.logger.error(`${nodeLog} 被质量 Gate 拒绝（${gateFailureLabel(error.report)}）: ${lastError}`);
        } else {
          this.logger.error(`${nodeLog} 执行错误: ${lastError}`);
        }

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
          gateReport: lastGateReport,
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
      gateReport: lastGateReport,
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
   * 3. 尝试解析 JSON 输出，同时保留 generation_runs.id
   */
  private async executePromptNode(
    node: ChainNode,
    input: Record<string, unknown>,
    context: ExecutionContext,
    retryCount: number,
    chain: PromptChain,
  ): Promise<PromptNodeExecutionResult> {
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
      planningResponsibilityPreflight: chain.id === 'long-novel-flexible-outline' && node.id === 'node_1_analysis',
      planningSources: chain.id === 'long-novel-flexible-outline' && node.id !== 'node_1_analysis'
        ? JSON.parse(JSON.stringify({ analysis: context.nodeOutputs.node_1_analysis,
          ...(node.id === 'node_3_chapters' ? { volumes: context.nodeOutputs.node_2_volumes } : {}) })) : undefined,
      temperature: this.calculateTemperature(node.modelConfig.temperature),
      timeout: node.timeout * 1000,
      scenario: node.chainId || chain.id,
      // 项目归属必须显式声明，不能只靠请求上下文兜底：
      // 两条固定长篇链由后台任务执行，ALS 里不保证有项目 id，
      // 缺了它 beginRun 拿不到创作宪法，埋点也只进平台级（静默空值）。
      // stepKey 走唯一别名表 standardScene，使质量阶段 / 中文标签 / 归属判定同口径；
      // 平台级链路（context.projectId 为空）保持原样，不强行归属。
      metrics: {
        stepKey: standardScene(node.chainId || chain.id),
        ...(context.projectId ? { projectId: context.projectId } : {}),
      },
      retryCount,
      // 当前两条固定长篇链的所有生产 Prompt 节点均要求合法 JSON。
      // 显式声明 JSON 模式后，real-llm 会在 finish_reason=length（输出被截断）时
      // 用同一模型、同一 prompt、更大输出上限重发；这是同模型扩容，不是降级。
      responseFormat: 'json_object',
      // 节点显式配置的输出上限优先；未配置时由 real-llm 按 scenario 经
      // resolveScenarioRoute 解析，绝不静默落到 defaults。
      maxTokens: node.modelConfig.maxTokens,
    });

    // 尝试解析 JSON。解析失败必须留下可诊断证据（长度/首尾片段/finishReason），
    // 否则调用方只会看到"缺少某字段"，真实故障（截断/非法 JSON/字段名不符）被掩盖。
    const parsedOutput = this.tryParseJSON(response.content);
    if (typeof parsedOutput !== 'object' || parsedOutput === null
      || (['long-novel-flexible-outline', 'long-novel-init-foundation'].includes(chain.id) && Array.isArray(parsedOutput))) {
      const raw = typeof response.content === 'string' ? response.content : String(response.content);
      this.logger.error(
        `[${chain.id}/${node.id}] LLM 输出不是合法 JSON：contentLength=${raw.length}, `
        + `finishReason=${response.finishReason ?? 'unknown'}, `
        + `head=${JSON.stringify(raw.slice(0, 300))}, tail=${JSON.stringify(raw.slice(-300))}`,
      );
      if (['long-novel-flexible-outline', 'long-novel-init-foundation'].includes(chain.id)) {
        throw new GateRejectionError(classifyGateFailure({ evaluationStatus: 'not_evaluated', topic: 'quality_gate', gateStatus: 'not_evaluated',
          buckets: { review_incomplete: [`上游节点${node.id}未返回合法JSON对象，禁止将原文当作已完成结构继续下游`] } }), raw);
      }
    }
    if (node.chainId === 'long-novel-flexible-outline' && node.id === 'node_1_analysis') {
      const issues = describeChapterResponsibilityPlan(parsedOutput, context.variables['user_input'] && (context.variables['user_input'] as any).chapterLimit);
      if (issues.length) throw new GateRejectionError(classifyGateFailure({
        evaluationStatus: 'evaluated', topic: 'quality_gate', gateStatus: 'blocked',
        buckets: { outline_alignment: issues.map(issue => 'ARCH-005上游章节职责：' + issue) },
      }), response.content);
    }
    return { output: parsedOutput, ...(response.runId ? { runId: response.runId } : {}) };
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
      startTime: new Date(),
      timestamps: {},
      // 项目归属：项目内节点的埋点/宪法注入必须能定位到这本书；平台级链路（无 projectId）保持 undefined。
      projectId: typeof userInput.projectId === 'string' ? userInput.projectId : undefined,
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

  /** 保持调用方配置温度；重复运行不得靠升温碰运气。 */
  private calculateTemperature(baseTemp: number): number {
    return Math.max(0.2, Math.min(1.2, baseTemp));
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
        // Only recover missing escapes on existing quotes. No fields, values,
        // delimiters or truncated strings may be supplied by a repair library.
        try {
          const original = jsonMatch[0];
          const repaired = jsonrepair(original);
          let index = 0;
          for (let cursor = 0; cursor < repaired.length; cursor++) {
            if (repaired[cursor] === original[index]) index++;
            else if (!(repaired[cursor] === '\\' && original[index] === '"' && repaired[cursor + 1] === '"')) throw new Error('非引号转义修复');
          }
          if (index !== original.length) throw new Error('修复改变原文');
          const value = JSON.parse(repaired);
          this.logger.warn('结构化输出仅补齐字符串中既有引号的转义，未改动原文字符、字段或数值');
          return value;
        } catch { /* Keep malformed output for diagnostics and stop fixed production chains. */ }
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
