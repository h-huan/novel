/**
 * 结构化输出「被长度截断」的唯一结构化标记。
 *
 * 为什么必须唯一：截断有且只有一种物理成因——申请的输出配额装不下这一次的结构化结果。
 * 它的正确处理是「同一模型、同一提示词口径、同一 JSON 模式，把单批规模缩小后重发」，
 * 而不是换模型、去掉 response_format（那是降级），也不是靠错误文案里的中文前缀去猜。
 *
 * 之前没有任何结构化标记，调用方只能拿 message.includes / 正则去嗅探，
 * 于是文案一改、行为就变——与 gate-failure.ts 要解决的是同一类问题。
 * 本模块给出唯一错误类型 + 唯一判定函数 + 唯一上限常量。
 */

/** 结构化标记：调用方靠它判定，不靠中文前缀嗅探。 */
export const STRUCTURED_TRUNCATION_FLAG = 'structuredOutputTruncated';

/**
 * 结构化输出（json_object）允许申请的输出上限。
 * 与现有最大场景配置 writing=32768 对齐，不申请未经上游验证的更大值。
 * 调用侧的「单批预算」与这里的硬顶必须是同一个数，否则规划出来的批次仍会撞顶。
 */
export const STRUCTURED_JSON_OUTPUT_CEILING = 32768;

export interface StructuredTruncationContext {
  /** 本次实际申请的输出上限。 */
  maxTokens: number;
  scenario?: string;
  model?: string;
}

export class StructuredOutputTruncatedError extends Error {
  /** 结构化标记。 */
  readonly structuredOutputTruncated = true;
  constructor(message: string, readonly context: StructuredTruncationContext) {
    super(message);
    this.name = 'StructuredOutputTruncatedError';
  }
}

/** 只认结构化标记；不认文案。 */
export function isStructuredOutputTruncated(err: unknown): err is StructuredOutputTruncatedError {
  return !!(err as { structuredOutputTruncated?: unknown } | null | undefined)?.structuredOutputTruncated;
}

/**
 * 构造截断错误。保留原有文案（既有断言依赖它以「结构化生成因输出长度被截断」开头），
 * 只额外挂上结构化标记与上下文；不降级、不改状态码。
 */
export function structuredTruncationError(
  reason: string,
  context: StructuredTruncationContext,
): StructuredOutputTruncatedError {
  const suffix = `: model=${context.model ?? 'unknown'}, scenario=${context.scenario || 'daily'}, maxTokens=${context.maxTokens}`;
  return new StructuredOutputTruncatedError(reason + suffix, context);
}