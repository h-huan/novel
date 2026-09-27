/**
 * 全仓唯一的「文本 -> token」估算口径。
 *
 * 为什么必须唯一：此前同一个物理量有两套互不相同的启发式——
 *   · rag/chunker.service：CJK 记 2、空白记 0、其它记 1，最后 ceil(t * 0.7)
 *   · chain/real-llm.service：按「每 4 个字符 1 token」的拉丁文启发式
 * 中文真实约 0.6 token/字，而「4 字符 1 token」等价于 0.25 token/字，
 * 于是长篇规划器把每章成本低估约 2.4 倍，据此把单批章数放大 2.4 倍，
 * 结果必然撞上结构化输出硬顶被截断，再触发同模型扩容重发，白烧一整轮生成时间。
 *
 * 为什么用「整数权重 + 整数除法」而不是浮点累加：
 *   1.0 累加 0.6 一千次会得到 600.0000000000001，Math.ceil 后变成 601（已实测）。
 * 本模块把权重放大成整数分子，最后一次性做 ceil(总权重 / divisor)，结果稳定可复现。
 *
 * 分工：本模块只负责「一段文本值多少 token」这一个判断，不负责决定预算怎么切。
 * 预算切分（单批章数、分块大小）由各自的调用方按同一份口径计算。
 */

export interface TokenWeights {
  /** 单个 CJK 字符的权重（分子） */
  cjk: number;
  /** 单个非 CJK、非空白字符的权重（分子） */
  other: number;
  /** 单个空白字符的权重（分子） */
  space: number;
  /** 除数：token = ceil(总权重 / divisor) */
  divisor: number;
}

/**
 * 规划/预算口径：中文 0.6、其它 0.35、空白 0.3。
 * 用于把「已生成内容的真实体量」换算成规划预算，决定单批能承载多少章。
 *
 * 诚实披露偏差：中文的数字与全角标点会落到 other（0.35）而不是 cjk（0.6），
 * 所以这个口径整体偏保守（略低估）。宁可留余量，也不放大批次再撞截断。
 */
export const PLANNING_TOKEN_WEIGHTS: TokenWeights = { cjk: 60, other: 35, space: 30, divisor: 100 };

/**
 * RAG 分块口径：与历史实现逐字节等价。
 * 历史实现为 CJK +2 / 空白 +0 / 其它 +1 后 ceil(t * 0.7)；
 * 这里写成 CJK +14 / 空白 +0 / 其它 +7 后 ceil(w / 10)，
 * 因为 ceil((2c + o) * 0.7) 与 ceil((14c + 7o) / 10) 在整数输入下恒等（已穷举验证）。
 * 保留该口径是为了不改变既有分块边界；分块规则本身不在本次收敛范围内。
 */
export const RAG_CHUNK_TOKEN_WEIGHTS: TokenWeights = { cjk: 14, other: 7, space: 0, divisor: 10 };

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const SPACE_PATTERN = /\s/;

/** 累加文本的整数权重总和。判空返回 0，不做任何隐式默认。 */
export function countTextWeights(text: string, weights: TokenWeights): number {
  if (!text) return 0;
  let total = 0;
  for (const char of text) {
    if (SPACE_PATTERN.test(char)) total += weights.space;
    else if (CJK_PATTERN.test(char)) total += weights.cjk;
    else total += weights.other;
  }
  return total;
}

/** 估算文本 token 数。默认使用规划口径；分块等场景显式传入自己的口径。 */
export function estimateTokens(text: string, weights: TokenWeights = PLANNING_TOKEN_WEIGHTS): number {
  if (!text) return 0;
  return Math.ceil(countTextWeights(text, weights) / weights.divisor);
}