/**
 * Prompt Chain 引擎核心类型定义
 *
 * 定义 PromptChain、ChainNode、ExecutionContext、ChainResult 等
 * 所有 Chain 相关模块共享的类型
 */

// 仅类型引用：Gate 报告是节点级结果的一部分，必须原样带出节点边界（见 NodeResult.gateReport）。
import type { GateFailureReport } from '../modules/writing-quality/gate-failure';

// ==================== 基础类型 ====================

/** 节点执行类型 */
export type NodeType = 'prompt' | 'condition' | 'parallel' | 'loop' | 'transform';

/** 执行模式 */
export type ExecutionMode = 'sequential' | 'condition_branch' | 'parallel' | 'loop' | 'hybrid';

/** 链状态 */
export type ChainState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'partial';

/** 变量来源前缀 */
export type VariableSource =
  | 'user_input'
  | 'chain_output'
  | 'rag_result'
  | 'state_engine'
  | 'constant';

// ==================== 模型配置 ====================

/** 模型规格 */
export interface ModelSpec {
  temperature: number;
  maxTokens?: number;
}

/** LLM 调用请求 */
export interface LLMRequest {
  /** Internal only: partial body fragments are evaluated after assembly. */
  deferQualityGate?: boolean;
  /**
   * 判定单元（与 deferQualityGate 同性质：由调用方按内容单位显式声明）。
   *
   * 'chapter'（缺省）：整章单元。不声明就是整章口径，任何整章级指标都不放宽。
   * 'segment'：片段单元（红线段落级精修、质检局部精修、二次加工分块改写的一段）。
   *
   * 为什么必须显式声明：片段拿不到整章的篇幅、开篇字位、章尾留钩、爽点分布与章节结构。
   * 拿片段去套「番茄章节 3000–5000 字 / 对话占比 30%–55%」只会产出作者无法执行的假问题
   * （实证：22 字 / 43 字 / 47 字片段被判「章节 3000-5000 字不足」并据此阻断局部精修，
   * 二次加工入口整体不可用）。这不是降级：同一内容在整章单元上仍逐条产出，severity 一字不动，
   * 改变的只是判定单元；空宪法（未执行标准）在任何单元都照样阻断。
   */
  evaluationUnit?: 'chapter' | 'segment';
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  /** 写作场景，用于模型路由选择（如 idea_generation, body_writing 等） */
  scenario?: string;
  /** 章节功能，用于动态路由（如 exposition, climax 等） */
  chapterFunction?: string;
  /** 当前修订次数，仅用于遥测或模板上下文；不得据此自动升温 */
  retryCount?: number;
  /** 角色（writer / reviewer / planner） */
  role?: string;
  /** 要求兼容 OpenAI 协议的提供商返回严格 JSON 对象。 */
  responseFormat?: 'text' | 'json_object';
  /**
   * 空内容允许补发的次数。运行时统一封顶为 1：空内容没有可修订材料，
   * 可补发一次；再次为空立即停止，避免与网络层/业务层重试叠加。
   */
  maxEmptyRetries?: number;
  /**
   * 埋点上下文（业务步骤语义，可选）。由调用方透传，用于全链路步骤遥测：
   * 哪个业务步骤、第几轮（0=首版）、目标/上一版字数，供首页透明展示与首版自优化。
   * 不传时按 scenario 自动归类，仍会被埋点覆盖。
   */
  metrics?: {
    runId?: string;
    projectId?: string | null;
    chapterIndex?: number | null;
    stepKey?: string | null;
    attempt?: number;
    targetWords?: number | null;
    prevWords?: number | null;
  };
  /** 是否注入"当前功能模块标准"（默认注入；标准归纳等元任务显式关闭以防递归污染） */
  injectStandard?: boolean;
}

/** LLM 调用响应 */
export interface LLMResponse {
  content: string;
  model: string;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;           // 毫秒
}

// ==================== Chain Node ====================

/** 条件分支 */
export interface Branch {
  condition: string;          // 条件表达式
  targetNodeId: string;       // 条件满足时跳转的节点 ID
  description?: string;
}

/** Chain 节点 */
export interface ChainNode {
  id: string;                 // 如 "node_1_material_parse"
  name: string;               // 如 "素材解析"
  type: NodeType;
  chainId: string;            // 所属 Chain ID
  promptTemplateId?: string;  // 指向模板库的模板 ID
  modelConfig: ModelSpec;
  inputMapping: Record<string, string>;   // 变量路径 → 节点输入
  outputMapping: Record<string, string>;  // 节点输出 → 上下文路径
  branches?: Branch[];
  nextOnSuccess?: string[];   // 成功后的下一个节点 ID，默认按序
  timeout: number;            // 超时秒数
  retryCount: number;         // 兼容旧模板；通用引擎不据此原样重放节点
  skipOnEmptyInput?: boolean; // 输入为空时是否跳过此节点
  description?: string;
}

// ==================== Variable ====================

/** 变量定义 */
export interface VariableDef {
  name: string;
  source: VariableSource;
  path: string;
  defaultValue?: unknown;
  required: boolean;
  description?: string;
}

/** 执行上下文 */
export interface ExecutionContext {
  chainId: string;
  variables: Record<string, unknown>;    // 当前所有变量
  nodeOutputs: Record<string, unknown>;  // 各节点的输出缓存
  retryCounters: Record<string, number>; // 各节点的重试计数
  startTime: Date;
  timestamps: Record<string, Date>;       // 各节点的执行时间戳
  metadata: Record<string, unknown>;      // 扩展元数据
  /** 所属小说项目：项目内场景埋点/宪法注入的归属；平台级链路（灵感发现/定时任务）为 undefined */
  projectId?: string;
}

// ==================== Chain ====================

/** Prompt Chain 定义 */
export interface PromptChain {
  id: string;                  // 如 "inspiration-seed-enrich" / "body-by-outline"
  name: string;                // 人类可读名称
  version: string;             // 语义版本 (major.minor.patch)
  description: string;
  nodes: ChainNode[];          // 有序节点列表
  variables: VariableDef[];    // 全局变量定义
  executionMode: ExecutionMode;
  config: ChainConfig;
}

/** Chain 全局配置 */
export interface ChainConfig {
  timeout: number;             // 全局超时秒数
  maxRetries: number;
  enableLogging: boolean;
  strictMode: boolean;
}

// ==================== 执行结果 ====================

/** 节点执行结果 */
export interface NodeResult {
  nodeId: string;
  nodeName: string;
  status: 'success' | 'failed' | 'skipped' | 'partial';
  output: unknown;
  error?: string;
  /**
   * 节点被质量 Gate 拒绝时的完整报告（结构化，原样透传，不在中间层压成字符串）。
   *
   * 为什么必须挂在节点结果上：Error 实例跨节点边界会退化成 error 字符串，
   * 报告一旦丢失，上游只能看到「缺少世界观」「volumes 为空」这类下游症状，
   * 真实成因被吞掉之后，报错就变成了永远指错方向的噪音。
   */
  gateReport?: GateFailureReport;
  latency: number;             // 毫秒
  retryCount: number;
  timestamp: Date;
}

/** Chain 执行结果 */
export interface ChainResult {
  chainId: string;
  chainName: string;
  status: ChainState;
  outputs: Record<string, unknown>;    // 最终输出（各节点输出汇总）
  nodeResults: NodeResult[];           // 各节点执行详情
  errors: ChainError[];
  totalLatency: number;                // 总耗时 ms
  startTime: Date;
  endTime?: Date;
  partialOutput?: unknown;             // 失败时的部分输出
}

/** Chain 执行错误 */
export interface ChainError {
  nodeId: string;
  message: string;
  type: 'timeout' | 'llm_error' | 'template_error' | 'internal';
  recoverable: boolean;
}
