/**
 * Prompt Chain 引擎核心类型定义
 *
 * 定义 PromptChain、ChainNode、ExecutionContext、ChainResult 等
 * 所有 Chain 相关模块共享的类型
 */

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

// ==================== Quality Gate ====================

/** 质量门级别 */
export type GateLevel = 'CRITICAL' | 'WARNING' | 'INFO';

/** 质量门检查类型 */
export type GateCheckType = 'rule' | 'llm_judge' | 'rule_and_llm';

/** 失败处理方式 */
export type OnFailure = 'retry' | 'skip' | 'fallback' | 'stop';

/** 质量门配置 */
export interface QualityGateConfig {
  nodeId: string;
  checkType: GateCheckType;
  criteria: GateCriterion[];
  threshold: number;           // 0-100 分，低于此值触发失败
  level: GateLevel;
  onFailure: OnFailure;
  maxRetries: number;          // 最大重试次数
  fallbackNodeId?: string;     // fallback 时执行的节点 ID
}

/** 质量门检查标准 */
export interface GateCriterion {
  name: string;                // 检查项名称
  description: string;         // 检查项描述
  weight: number;              // 权重 (0-1)
  minScore: number;            // 最低分 (0-100)
}

/** 质量门检查结果 */
export interface GateResult {
  passed: boolean;
  score: number;              // 总分 0-100
  details: GateDetail[];
  summary: string;            // 总结信息
  retryCount: number;
  retrySuggestions?: string[];// 重试建议
}

/** 质量门单项详情 */
export interface GateDetail {
  criterion: string;
  score: number;
  reason: string;
  level: GateLevel;
}

// ==================== 模型配置 ====================

/** 模型规格 */
export interface ModelSpec {
  primary: string;
  fallback?: string;
  temperature: number;
  tier: 'performance' | 'balanced' | 'economy';
  maxTokens?: number;  // 新增：限制模型输出长度，加快速度
}

/** LLM 调用请求 */
export interface LLMRequest {
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
  /** 当前重试次数，用于 temperature 动态调节 */
  retryCount?: number;
  /** 角色（writer / reviewer / planner） */
  role?: string;
  /** 要求兼容 OpenAI 协议的提供商返回严格 JSON 对象。 */
  responseFormat?: 'text' | 'json_object';
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
  qualityGate?: QualityGateConfig;
  branches?: Branch[];
  nextOnSuccess?: string[];   // 成功后的下一个节点 ID，默认按序
  nextOnFailure?: string;     // 失败后的降级节点 ID
  timeout: number;            // 超时秒数
  retryCount: number;         // 最大重试次数
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
  qualityGateFailures: Record<string, GateResult[]>;  // 各节点的质量门失败记录
  startTime: Date;
  timestamps: Record<string, Date>;       // 各节点的执行时间戳
  metadata: Record<string, unknown>;      // 扩展元数据
}

// ==================== Chain ====================

/** Prompt Chain 定义 */
export interface PromptChain {
  id: string;                  // 如 "tianlong-8step"
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
  enableQualityGate: boolean;
  strictMode: boolean;         // 严格模式：质量门失败即停止
}

// ==================== 执行结果 ====================

/** 节点执行结果 */
export interface NodeResult {
  nodeId: string;
  nodeName: string;
  status: 'success' | 'failed' | 'skipped' | 'partial';
  output: unknown;
  gateResult?: GateResult;
  error?: string;
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
  gateResults: Record<string, GateResult>;  // 各节点质量门结果
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
  type: 'quality_gate' | 'timeout' | 'llm_error' | 'template_error' | 'internal';
  recoverable: boolean;
}

// ==================== 天龙8步专用类型 ====================

/** 天龙8步执行结果片段 */
export interface TianlongStepResult {
  stepNumber: number;          // 1-8
  stepName: string;
  content: string;
  qualityScore?: number;
}

/** 天龙8步章节装配上下文 */
export interface ChapterContext {
  outline: string;             // 本章大纲
  previousChapterEnd: string;  // 上一章结尾
  characters: CharacterState[];// 出场角色
  foreshadowings: ForeshadowState[];  // 应回收伏笔
  previousChaptersSummary: string;    // 前几章摘要
  chapterNumber: number;
  totalChapters: number;
}

/** 角色状态 */
export interface CharacterState {
  name: string;
  identity: string;
  status: string;
  motivation: string;
  relationToProtagonist: string;
}

/** 伏笔状态 */
export interface ForeshadowState {
  content: string;
  buriedAt: string;
  recoveredAt?: string;
  impact: string;
}

// ==================== 短篇三步骤输出类型 ====================

/** 题材项（阶段一输出） */
export interface StoryIdea {
  title: string;
  hook: string;               // 一句话钩子
  protagonist: string;        // 第一人称主角身份
  setting: string;            // 故事发生地
  anomaly: string;            // 核心异常事件
  conflict: string;           // 核心冲突
  emotion: string;            // 情绪卖点
  reversal: string;           // 主要反转
  platform: string;           // 适合平台
  potential: string;          // 爆点判断
}

/** 题材报告（阶段一最终输出） */
export interface ThemeReport {
  platform: string;
  styleProfile: StyleProfile;
  ideas: StoryIdea[];
}

/** 平台风格分析 */
export interface StyleProfile {
  platform: string;
  userProfile: string;
  successFactors: string[];
  taboos: string[];
  wordRange: string;
}

/** 核心设定（阶段二） */
export interface CoreSetting {
  title: string;
  highConcept: string;        // 一句话高概念
  protagonist: string;        // 主角"我"的身份
  initialDilemma: string;     // 主角最初困境
  wantMost: string;           // 最想要什么
  fearMost: string;           // 最害怕什么
  antagonist: string;         // 反派或阻碍力量
  setting: string;            // 故事发生地
  coreAnomaly: string;        // 核心异常事件
  emotionalEnding: string;    // 最终情绪落点
}

/** 人物关系（阶段二） */
export interface CharacterRelation {
  name: string;               // 人物名
  surfaceIdentity: string;    // 表面身份
  realPurpose: string;        // 真实目的
  relationToMe: string;       // 与"我"的关系
  wants: string;              // 想要什么
  hides: string;              // 隐瞒了什么
  reversalInvolvement: string;// 在第几次反转中起作用
  finalFate: string;          // 最终结局
}

/** 9段章节结构（阶段二） */
export interface ChapterStructure {
  openingHook: string;        // 开篇钩子
  chapter1Anomaly: string;    // 异常降临
  chapter2Probe: string;      // 试探与误判
  chapter3Crisis: string;     // 危机升级
  chapter4Reversal: string;   // 第一次大反转
  chapter5Truth: string;      // 真相逼近
  chapter6Climax: string;     // 高潮对峙
  chapter7FinalReversal: string;// 终局反转
  chapter8Epilogue: string;   // 尾声余味
}

/** 递进反转（阶段二） */
export interface ReversalEntry {
  position: string;           // 反转位置
  surfaceTruth: string;       // 表面真相
  actualTruth: string;        // 实际真相
  foreshadow: string;         // 前文伏笔
  revealMethod: string;       // 揭露方式
  impactOnProtagonist: string;// 对主角的打击
  impactOnReader: string;     // 对读者的冲击
  changesPriorReading: string;// 是否会改变前文理解
}

/** 伏笔回收（阶段二） */
export interface ForeshadowEntry {
  content: string;            // 伏笔内容
  position: string;           // 出现位置
  initialInterpretation: string;  // 当时读者会如何理解
  recoveryMethod: string;     // 后文如何回收
  impactAfterRecovery: string;// 回收后的冲击效果
}

/** 完整大纲（阶段二最终输出） */
export interface FullOutline {
  coreSetting: CoreSetting;
  characters: CharacterRelation[];
  chapterStructure: ChapterStructure;
  reversals: ReversalEntry[];
  foreshadows: ForeshadowEntry[];
}

/** 正文章节质检报告 */
export interface ChapterQAReport {
  passed: boolean;
  overallScore: number;
  outlineMatch: number;      // 大纲吻合度 0-10
  characterConsistency: number;
  aiTraceIndex: number;      // AI 痕迹指数 0-100
  emotionalImpact: number;   // 热血感评分
  chapterEndAppeal: number;  // 章节结尾吸引力
  copyrightRisk: boolean;
  issues: QAItem[];
}

/** 质检项 */
export interface QAItem {
  type: 'error' | 'warning' | 'info';
  dimension: string;
  description: string;
  suggestion?: string;
}
