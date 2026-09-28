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
  // deepseek-flash 等推理模型把 reasoning 计入 max_tokens。真实短篇创建已出现 review
  // 16384→32768 的长度截断补发：第一次调用完整耗时但结果不可用，随后同 prompt 再付费一次。
  // 与 outline/body/quality review 一致，首版直接给结构化硬顶。maxTokens 是上限而非必须消费量；
  // 不会强迫模型生成 32768 token，只消除“先用已知不足的上限试一次”的重复流程。
  CONSISTENCY_CHECK_MIN: envInt('LLM_CC_MAXTOKENS_MIN', 32768),
  CONSISTENCY_CHECK_MAX: envInt('LLM_CC_MAXTOKENS_MAX', 32768),
  CONSISTENCY_CHECK_BASE: envInt('LLM_CC_MAXTOKENS_BASE', 4096),
  CONSISTENCY_CHECK_PER_CONFLICT: envInt('LLM_CC_MAXTOKENS_PER_CONFLICT', 1024),

  // ============ 质量评审与局部修复输出预算 ============
  // 推理模型会把内部推理计入 max_tokens。8192 会在复杂评审输出 JSON
  // 之前耗尽，因此评审从第一次调用就使用完整预算，不再先失败再扩容。
  QUALITY_REVIEW_MAXTOKENS: envInt('LLM_QUALITY_REVIEW_MAXTOKENS', 32768),
  QUALITY_REPAIR_MAXTOKENS: envInt('LLM_QUALITY_REPAIR_MAXTOKENS', 32768),

  // ============ outline 写入 maxTokens ============
  // ⚠️ 防复发（勿再引入）：这里曾有一组 OUTLINE_WRITE_MIN / OUTLINE_WRITE_MAX /
  // OUTLINE_WRITE_PER_CHAPTER 的 env 开关，全库【零消费者】——真正生效的是
  // routing/route-config.json 的 scenarios.outline.maxTokens（经
  // RealLLMService.getConfiguredMaxTokens -> resolveScenarioRoute 解析）。
  // 后果：运维改 LLM_OW_MAXTOKENS_MIN 以为能调大纲预算，实际一个字节都不生效，
  // 而大纲仍在被截断、白烧扩容轮。已删除；大纲预算的唯一调法 = 改 route-config.json。

  // ============ 正文生成 maxTokens ============
  // deepseek-flash 是推理模型：max_tokens 必须同时容纳「思考(reasoning) + 正文输出」，否则思考
  // 吃光预算就会返回空内容、或在 3200 字以下截断。实测 reasoning 可达 7500+ token，且章节越长
  // 越大，所以不做「按目标字数线性外推」——那样算出来的值永远低于真实需要。
  //
  // ⚠️ 防复发（勿再引入）：这里曾有一组组合式预算参数 BODY_MAXTOKENS_CAP / BODY_MAXTOKENS_MIN /
  // BODY_MAXTOKENS_PER_TARGET / BODY_MAXTOKENS_EXTRA，取值 min(CAP, max(MIN, target*1.6+EXTRA))。
  // 本平台单章目标区间 CHAPTER_WORD_RANGE 按该式算出来只有 14800-18000，恒被 MIN=24576 抬起，
  // 只有 target>9100 才用得上 CAP —— 四个参数里有两个永远不会生效，注释却写着「首版直接给足」，
  // 与真实行为相反。后果：运维改 LLM_BODY_MAXTOKENS_CAP / _PER_TARGET / _EXTRA 以为能调正文预算，
  // 实际一个字节都不生效，真正决定预算的只有 _MIN；而「截断→同模型扩容」那一轮白烧始终存在
  // （实测 125s/轮）。现收敛为单值，与 route-config.json 的 outline.maxTokens 同策略：
  // 首版即给到硬顶，从源头消除这一轮。预算的唯一调法 = LLM_BODY_MAXTOKENS 环境变量。
  BODY_MAXTOKENS: envInt('LLM_BODY_MAXTOKENS', 32768),

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
