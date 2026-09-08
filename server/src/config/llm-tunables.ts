/**
 * LLM 生成可调参数 —— 全部集中于此，且均可通过环境变量覆盖。
 *
 * 设计原则（来自用户硬性要求）：
 * 1. 不把超时/边界写死在业务代码里。任何一处生成调用都从这里取值。
 * 2. 默认值足够宽容（≥5 分钟），避免慢模型或复杂跨模块修订被过早掐断。
 *    此前把 TIMEOUT 写死成 45s/120s/180s/240s，导致复杂修订在 240s 被掐断、
 *    结构化审查输出被 maxTokens=8192 截断——这正是"写死时间"引发的故障。
 * 3. 连接层（WebSocket）本身无超时，进度靠长连接推送；这里的 timeout 只是
 *    LLM HTTP 调用的安全网，不是给用户的"无响应报错"计时器。
 * 4. 所有值可由环境变量覆盖，无需重新编译即可调参。设为 0 表示不传该 timeout，
 *    回退到 real-llm.service 的 600_000ms 兜底默认值。
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 把 env 值转换成传给 realLLM.generate 的 timeout（0 → undefined，回退到服务兜底值）。 */
function toTimeout(ms: number): number | undefined {
  return ms > 0 ? ms : undefined;
}

export const LLM_TUNABLES = {
  // ============ 生成超时（毫秒），默认宽容档 ============
  TIMEOUT_SIMPLE: envInt('LLM_TIMEOUT_SIMPLE_MS', 300_000), // 标题/短文本：5 分钟
  TIMEOUT_MEDIUM: envInt('LLM_TIMEOUT_MEDIUM_MS', 420_000), // 角色/世界观/伏笔：7 分钟
  TIMEOUT_CONTENT: envInt('LLM_TIMEOUT_CONTENT_MS', 540_000), // 大纲/正文：9 分钟
  TIMEOUT_COMPLEX: envInt('LLM_TIMEOUT_COMPLEX_MS', 600_000), // 跨模块修订/全扫描：10 分钟

  // ============ 跨模块一致性检查 maxTokens 边界 ============
  CONSISTENCY_CHECK_MIN: envInt('LLM_CC_MAXTOKENS_MIN', 16384),
  CONSISTENCY_CHECK_MAX: envInt('LLM_CC_MAXTOKENS_MAX', 24576),
  CONSISTENCY_CHECK_BASE: envInt('LLM_CC_MAXTOKENS_BASE', 4096),
  CONSISTENCY_CHECK_PER_CONFLICT: envInt('LLM_CC_MAXTOKENS_PER_CONFLICT', 1024),

  // ============ 质量评审与局部修复输出预算 ============
  // 推理模型会把内部推理计入 max_tokens。8192 会在复杂评审输出 JSON
  // 之前耗尽，因此评审从第一次调用就使用完整预算，不再先失败再扩容。
  QUALITY_REVIEW_MAXTOKENS: envInt('LLM_QUALITY_REVIEW_MAXTOKENS', 32768),
  QUALITY_REPAIR_MAXTOKENS: envInt('LLM_QUALITY_REPAIR_MAXTOKENS', 32768),

  // ============ outline 写入 maxTokens 边界 ============
  // deepseek-v4-flash 推理模型：max_tokens 必须容纳"思考(reasoning)+输出"，否则思考吃光预算返回空内容。
  // 实测复杂任务 reasoning 可达 7500+，故上限给足预算（这修复了"空返回"根因）。
  OUTLINE_WRITE_MIN: envInt('LLM_OW_MAXTOKENS_MIN', 24576),
  OUTLINE_WRITE_MAX: envInt('LLM_OW_MAXTOKENS_MAX', 32768),
  OUTLINE_WRITE_PER_CHAPTER: envInt('LLM_OW_MAXTOKENS_PER_CHAPTER', 1200),

  // ============ 正文生成 maxTokens 公式参数 ============
  // deepseek-v4-flash 推理模型：max_tokens 必须容纳"思考(reasoning)+输出"，否则思考吃光预算
  // 返回空内容或把正文截断在 3200 字以下。实测复杂任务 reasoning 可达 7500+，故 EXTRA 预留
  // 足够推理预算（与 OUTLINE_WRITE 同策略）；封顶 32768 已覆盖"推理+3200-4000字正文"。
  BODY_MAXTOKENS_CAP: envInt('LLM_BODY_MAXTOKENS_CAP', 32768),
  BODY_MAXTOKENS_PER_TARGET: envFloat('LLM_BODY_MAXTOKENS_PER_TARGET', 1.6),
  BODY_MAXTOKENS_EXTRA: envInt('LLM_BODY_MAXTOKENS_EXTRA', 10000),

  // ============ 进度心跳 / 重试节奏 ============
  PROGRESS_HEARTBEAT_MS: envInt('LLM_PROGRESS_HEARTBEAT_MS', 15000), // 长篇综合生成心跳
  HEARTBEAT_INLINE_MS: envInt('LLM_HEARTBEAT_INLINE_MS', 30000), // 单章生成阶段心跳
  HEARTBEAT_GLOBAL_MS: envInt('LLM_HEARTBEAT_GLOBAL_MS', 10000), // 建项目全局心跳
  HEARTBEAT_SHORT_MS: envInt('LLM_HEARTBEAT_SHORT_MS', 20000), // 短篇生成心跳
  STEP_PACE_MS: envInt('LLM_STEP_PACE_MS', 1000), // 步骤间停顿，避免瞬时打满限流
  RETRY_BASE_DELAY_MS: envInt('LLM_RETRY_BASE_DELAY_MS', 1000),

  /** 转成 realLLM.generate 接受的 timeout（0 → undefined，回退服务兜底）。 */
  timeoutSimple: () => toTimeout(LLM_TUNABLES.TIMEOUT_SIMPLE),
  timeoutMedium: () => toTimeout(LLM_TUNABLES.TIMEOUT_MEDIUM),
  timeoutContent: () => toTimeout(LLM_TUNABLES.TIMEOUT_CONTENT),
  timeoutComplex: () => toTimeout(LLM_TUNABLES.TIMEOUT_COMPLEX),
};

export type LlmTunables = typeof LLM_TUNABLES;
