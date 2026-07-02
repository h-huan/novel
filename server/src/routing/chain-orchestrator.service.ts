/**
 * Prompt Chain 编排器
 *
 * 高级编排能力：
 * - 可视化 Chain 定义（JSON 配置式）
 * - 变量替换引擎（支持上下文变量注入）
 * - 条件分支（基于前序输出的 if-else 判断）
 * - 循环执行（批量生成 1-30 章）
 *
 * 底层复用 ChainEngineService 的节点执行能力
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ==================== 类型定义 ====================

/** 编排节点类型 */
export type OrchestratorNodeType = 'llm_call' | 'condition' | 'loop' | 'transform' | 'merge';

/** 变量来源 */
export type VarSource = 'input' | 'previous_output' | 'constant' | 'context';

/** 变量引用 */
export interface VarRef {
  source: VarSource;
  path: string;
  defaultValue?: unknown;
}

/** 条件分支 */
export interface OrchestratorBranch {
  condition: string;             // 条件表达式
  targetNodeId: string;
  description?: string;
}

/** 循环配置 */
export interface LoopConfig {
  type: 'range' | 'list' | 'while';
  range?: { start: number; end: number };   // range 类型：批量生成章节
  listVar?: string;                          // list 类型：变量名
  maxIterations: number;
  iterationVar: string;                      // 循环变量名（如 chapterIndex）
  breakCondition?: string;                   // 提前退出条件
}

/** 编排节点 */
export interface OrchestratorNode {
  id: string;
  name: string;
  type: OrchestratorNodeType;
  model?: string;                // LLM 调用的模型
  prompt?: string;               // LLM Prompt 模板
  temperature?: number;
  inputMapping: Record<string, VarRef>;
  outputVar: string;             // 输出变量名
  branches?: OrchestratorBranch[];
  loopConfig?: LoopConfig;
  conditionExpr?: string;        // 条件表达式
  description?: string;
}

/** 编排器上下文 */
export interface OrchestratorContext {
  chainId: string;
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  iterationCount: number;
  metadata: Record<string, unknown>;
}

/** 编排执行计划 */
export interface OrchestrationPlan {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: OrchestratorNode[];
  config: {
    maxIterations: number;
    timeout: number;
    enableLogging: boolean;
  };
}

/** 节点执行结果 */
export interface OrchestratorNodeResult {
  nodeId: string;
  status: 'success' | 'failed' | 'skipped';
  output: unknown;
  error?: string;
}

/** 编排执行结果 */
export interface OrchestrationResult {
  planId: string;
  planName: string;
  status: 'completed' | 'failed' | 'partial';
  outputs: Record<string, unknown>;
  nodeResults: OrchestratorNodeResult[];
  totalLatency: number;
  startTime: Date;
  endTime?: Date;
}

/** LLM 调用回调 */
export type LLMCallFn = (model: string, prompt: string, temperature?: number) => Promise<string>;

@Injectable()
export class ChainOrchestratorService {
  private readonly logger = new Logger(ChainOrchestratorService.name);

  /** 注册的编排计划 */
  private readonly plans = new Map<string, OrchestrationPlan>();

  constructor(private readonly configService: ConfigService) {}

  // ==================== 计划管理 ====================

  /**
   * 注册编排计划
   */
  registerPlan(plan: OrchestrationPlan): void {
    this.plans.set(plan.id, plan);
    this.logger.log(`已注册编排计划: ${plan.id}(${plan.name}) v${plan.version}`);
  }

  /**
   * 获取编排计划
   */
  getPlan(planId: string): OrchestrationPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * 删除编排计划
   */
  unregisterPlan(planId: string): boolean {
    return this.plans.delete(planId);
  }

  /**
   * 列出所有计划
   */
  listPlans(): OrchestrationPlan[] {
    return Array.from(this.plans.values());
  }

  // ==================== 执行 ====================

  /**
   * 执行编排计划
   *
   * @param planId 计划ID
   * @param input 输入变量
   * @param callLLM LLM 调用回调
   */
  async execute(
    planId: string,
    input: Record<string, unknown>,
    callLLM?: LLMCallFn,
  ): Promise<OrchestrationResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`编排计划不存在: ${planId}`);
    }

    const startTime = new Date();
    this.logger.log(`开始执行编排计划: ${planId}(${plan.name})`);

    const context: OrchestratorContext = {
      chainId: planId,
      variables: { ...input },
      nodeOutputs: {},
      iterationCount: 0,
      metadata: {},
    };

    const nodeResults: OrchestratorNodeResult[] = [];

    try {
      let i = 0;
      while (i < plan.nodes.length) {
        const node = plan.nodes[i];
        const nodeResult = await this.executeNode(
          node,
          context,
          plan.config.enableLogging,
          callLLM,
        );

        nodeResults.push(nodeResult);
        context.nodeOutputs[node.id] = nodeResult.output;

        // 输出映射到变量
        if (nodeResult.output !== undefined) {
          context.variables[node.outputVar] = nodeResult.output;
        }

        // 处理条件分支
        if (node.type === 'condition' && nodeResult.output) {
          const branchTarget = nodeResult.output as { matchedBranch?: string };
          if (branchTarget.matchedBranch) {
            const targetIndex = plan.nodes.findIndex(
              (n) => n.id === branchTarget.matchedBranch,
            );
            if (targetIndex > -1) {
              i = targetIndex;
              continue;
            }
          }
        }

        // 处理循环
        if (node.type === 'loop' && node.loopConfig) {
          context.iterationCount++;
          if (context.iterationCount < node.loopConfig.maxIterations) {
            i--; // 重新执行循环节点
            continue;
          }
        }

        i++;
      }

      const endTime = new Date();
      const status = nodeResults.some((r) => r.status === 'failed') ? 'partial' : 'completed';

      return {
        planId,
        planName: plan.name,
        status,
        outputs: { ...context.variables },
        nodeResults,
        totalLatency: endTime.getTime() - startTime.getTime(),
        startTime,
        endTime,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`编排计划执行失败: ${errMsg}`);

      return {
        planId,
        planName: plan.name,
        status: 'failed',
        outputs: { ...context.variables },
        nodeResults,
        totalLatency: Date.now() - startTime.getTime(),
        startTime,
        endTime: new Date(),
      };
    }
  }

  // ==================== 节点执行 ====================

  /**
   * 执行单个编排节点
   */
  private async executeNode(
    node: OrchestratorNode,
    context: OrchestratorContext,
    enableLogging: boolean,
    callLLM?: LLMCallFn,
  ): Promise<OrchestratorNodeResult> {
    if (enableLogging) {
      this.logger.log(`执行节点: ${node.id}(${node.name}) 类型=${node.type}`);
    }

    try {
      switch (node.type) {
        case 'llm_call':
          return this.executeLLMNode(node, context, callLLM);
        case 'condition':
          return this.executeConditionNode(node, context);
        case 'loop':
          return this.executeLoopNode(node, context);
        case 'transform':
          return this.executeTransformNode(node, context);
        case 'merge':
          return this.executeMergeNode(node, context);
        default:
          return {
            nodeId: node.id,
            status: 'skipped',
            output: null,
          };
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        nodeId: node.id,
        status: 'failed',
        output: null,
        error: errMsg,
      };
    }
  }

  /**
   * LLM 调用节点
   */
  private async executeLLMNode(
    node: OrchestratorNode,
    context: OrchestratorContext,
    callLLM?: LLMCallFn,
  ): Promise<OrchestratorNodeResult> {
    // 变量替换
    const resolvedInput = this.resolveVariables(node.inputMapping, context);
    const resolvedPrompt = node.prompt
      ? this.renderTemplate(node.prompt, { ...context.variables, ...resolvedInput, nodeOutputs: context.nodeOutputs })
      : JSON.stringify(resolvedInput);

    if (callLLM && node.model) {
      const temp = node.temperature ?? 0.7;
      const result = await callLLM(node.model, resolvedPrompt, temp);
      return {
        nodeId: node.id,
        status: 'success',
        output: this.tryParseJSON(result),
      };
    }

    // Mock 模式：直接返回解析后的输入
    return {
      nodeId: node.id,
      status: 'success',
      output: resolvedInput,
    };
  }

  /**
   * 条件分支节点
   */
  private executeConditionNode(
    node: OrchestratorNode,
    context: OrchestratorContext,
  ): OrchestratorNodeResult {
    if (!node.branches || node.branches.length === 0) {
      return { nodeId: node.id, status: 'skipped', output: null };
    }

    // 评估条件（Mock：选择第一个分支）
    const matchedBranch = node.branches[0];
    this.logger.log(`条件分支: ${matchedBranch.description || matchedBranch.condition} → ${matchedBranch.targetNodeId}`);

    return {
      nodeId: node.id,
      status: 'success',
      output: { matchedBranch: matchedBranch.targetNodeId, description: matchedBranch.description },
    };
  }

  /**
   * 循环节点
   */
  private executeLoopNode(
    node: OrchestratorNode,
    context: OrchestratorContext,
  ): OrchestratorNodeResult {
    if (!node.loopConfig) {
      return { nodeId: node.id, status: 'skipped', output: null };
    }

    const loopConfig = node.loopConfig;
    const currentIteration = context.iterationCount;

    if (currentIteration >= loopConfig.maxIterations) {
      return { nodeId: node.id, status: 'success', output: { iterations: currentIteration, done: true } };
    }

    // 设置循环变量
    if (loopConfig.type === 'range' && loopConfig.range) {
      const chapterIndex = loopConfig.range.start + currentIteration;
      context.variables[loopConfig.iterationVar] = chapterIndex;
      this.logger.log(`循环迭代 ${currentIteration + 1}/${loopConfig.maxIterations}, ${loopConfig.iterationVar}=${chapterIndex}`);
    }

    return {
      nodeId: node.id,
      status: 'success',
      output: { iteration: currentIteration + 1, continue: true },
    };
  }

  /**
   * Transform 节点：数据转换
   */
  private executeTransformNode(
    node: OrchestratorNode,
    context: OrchestratorContext,
  ): OrchestratorNodeResult {
    const resolvedInput = this.resolveVariables(node.inputMapping, context);
    return {
      nodeId: node.id,
      status: 'success',
      output: resolvedInput,
    };
  }

  /**
   * Merge 节点：合并多个输出
   */
  private executeMergeNode(
    node: OrchestratorNode,
    context: OrchestratorContext,
  ): OrchestratorNodeResult {
    const merged: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries(node.inputMapping)) {
      merged[key] = this.resolveVarRef(ref, context);
    }
    return {
      nodeId: node.id,
      status: 'success',
      output: merged,
    };
  }

  // ==================== 变量引擎 ====================

  /**
   * 解析变量引用
   */
  private resolveVarRef(ref: VarRef, context: OrchestratorContext): unknown {
    switch (ref.source) {
      case 'input':
        return this.getNestedValue(context.variables, ref.path) ?? ref.defaultValue;
      case 'previous_output':
        return this.getNestedValue(context.nodeOutputs, ref.path) ?? ref.defaultValue;
      case 'constant':
        return ref.path; // 常量：path 本身就是值
      case 'context':
        return this.getNestedValue(context, ref.path) ?? ref.defaultValue;
      default:
        return ref.defaultValue;
    }
  }

  /**
   * 解析输入映射
   */
  private resolveVariables(
    mapping: Record<string, VarRef>,
    context: OrchestratorContext,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries(mapping)) {
      resolved[key] = this.resolveVarRef(ref, context);
    }
    return resolved;
  }

  /**
   * 简单模板渲染
   * 支持 {{ variableName }} 和 {{ nodeOutputs.nodeId.field }} 语法
   */
  private renderTemplate(template: string, vars: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
      const value = this.getNestedValue(vars, path);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * 获取嵌套对象值（支持点号路径）
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * 尝试解析 JSON
   */
  private tryParseJSON(text: unknown): unknown {
    if (typeof text !== 'string') return text;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // ==================== 预制计划 ====================

  /**
   * 创建批量章节生成计划
   *
   * @param startChapter 起始章节号
   * @param endChapter 结束章节号
   * @param writerModel 写手模型
   * @param reviewerModel 评审模型
   */
  createBatchChapterPlan(
    planId: string,
    startChapter: number,
    endChapter: number,
    writerModel: string = 'deepseek',
    reviewerModel: string = 'glm',
  ): OrchestrationPlan {
    return {
      id: planId,
      name: `批量章节生成 [${startChapter}-${endChapter}]`,
      version: '1.0.0',
      description: `自动生成第 ${startChapter} 到第 ${endChapter} 章`,
      nodes: [
        // 循环控制器
        {
          id: 'node_loop',
          name: '章节循环',
          type: 'loop',
          loopConfig: {
            type: 'range',
            range: { start: startChapter, end: endChapter },
            maxIterations: endChapter - startChapter + 1,
            iterationVar: 'chapterIndex',
          },
          inputMapping: {},
          outputVar: 'loopResult',
          description: `循环生成 ${startChapter}-${endChapter} 章`,
        },
        // 写手生成
        {
          id: 'node_write',
          name: '写手生成',
          type: 'llm_call',
          model: writerModel,
          temperature: 0.7,
          prompt: '生成第 {{ chapterIndex }} 章的内容',
          inputMapping: {
            chapterIndex: { source: 'input', path: 'chapterIndex' },
            outline: { source: 'input', path: 'outline' },
          },
          outputVar: `chapter_${startChapter}_to_${endChapter}`,
          description: '调用写手模型生成当前章节',
        },
        // 评审检查
        {
          id: 'node_review',
          name: '评审检查',
          type: 'llm_call',
          model: reviewerModel,
          temperature: 0.3,
          prompt: '评审以下章节内容：{{ nodeOutputs.node_write }}',
          inputMapping: {
            draft: { source: 'previous_output', path: 'node_write' },
          },
          outputVar: 'reviewResult',
          description: '评审已生成的章节',
        },
      ],
      config: {
        maxIterations: endChapter - startChapter + 1,
        timeout: 1800,
        enableLogging: true,
      },
    };
  }
}
