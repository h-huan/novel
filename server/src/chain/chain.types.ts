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
  /**
   * 对应 generation_runs.id。固定生产链把它作为 AI 产物来源凭证一路带到 Canon 提交边界；
   * 没有 runId 的结构化结果只能作为临时候选，不能证明自己通过了项目 Gate。
   */
  runId?: string;
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

// ==================== Execution Context ====================

export interface ExecutionContext {
  chainId: string;
  variables: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  retryCounters: Record<string, number>;
  startTime: Date;
  timestamps: Record<string, Date>;
  metadata: Record<string, unknown>;
  /** 所属小说项目：项目内场景埋点/宪法注入的归属；平台级链路（灵感发现/定时任务）为 undefined */
  projectId?: string;
}

// ==================== Chain ====================

export interface PromptChain {
  id: string;
  name: string;
  version: string;
  description: string;
  nodes: ChainNode[];
  variables: VariableDef[];
  executionMode: ExecutionMode;
  config: ChainConfig;
}

export interface ChainConfig {
  timeout: number;
  maxRetries: number;
  enableLogging: boolean;
  strictMode: boolean;
}

// ==================== 执行结果 ====================

export interface NodeResult {
  nodeId: string;
  nodeName: string;
  status: 'success' | 'failed' | 'skipped' | 'partial';
  output: unknown;
  error?: string;
  /** Prompt 节点对应的 generation_runs.id；非 LLM 节点为空。 */
  runId?: string;
  /**
   * 节点被质量 Gate 拒绝时的完整报告（结构化，原样透传，不在中间层压成字符串）。
   */
  gateReport?: GateFailureReport;
  latency: number;
  retryCount: number;
  timestamp: Date;
}

export interface ChainResult {
  chainId: string;
  chainName: string;
  status: ChainState;
  outputs: Record<string, unknown>;
  nodeResults: NodeResult[];
  errors: ChainError[];
  totalLatency: number;
  startTime: Date;
  endTime?: Date;
  partialOutput?: unknown;
}

export interface ChainError {
  nodeId: string;
  message: string;
  type: 'llm_error' | 'validation_error' | 'timeout' | 'internal';
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface ChainExecutionLog {
  id: string;
  chainId: string;
  projectId?: string;
  status: ChainState;
  startTime: Date;
  endTime?: Date;
  totalLatency: number;
  nodeResults: NodeResult[];
  errors: ChainError[];
  inputSnapshot: Record<string, unknown>;
  outputSnapshot: Record<string, unknown>;
}

export interface ChainProgressEvent {
  type: 'chain_start' | 'node_start' | 'node_complete' | 'node_error' | 'chain_complete' | 'chain_error';
  chainId: string;
  nodeId?: string;
  nodeName?: string;
  progress: number;
  message: string;
  timestamp: Date;
  data?: unknown;
}

export interface ChainExecutionOptions {
  onProgress?: (event: ChainProgressEvent) => void;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface ChainExecutionResult {
  success: boolean;
  result?: ChainResult;
  error?: string;
  duration: number;
}
