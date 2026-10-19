/** Only a proven output-capacity failure justifies partitioning. A failed
 * quality judgment, malformed evidence or timeout is never a capacity signal.
 * Input-context overflow cannot be solved by dropping global comparison data.
 */
export function isReviewOutputCapacityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/context_length_exceeded|maximum context length|上下文.{0,20}(超|不足)/i.test(message)) return false;
  return /结构化生成因输出长度被截断|结构化输出.{0,40}(被.{0,8}截断|硬顶.{0,20}截断)|finish_reason\s*[=:]\s*length/i.test(message);
}

/** Contiguous, lossless halves chosen by actual serialized material size.
 * This changes transport size only; every field and item is retained.
 */
export function splitReviewMaterial<T>(items: readonly T[], material: (item: T) => unknown): T[][] {
  if (items.length < 2) throw new Error('单项审核已无法继续拆分，保留容量失败，不丢弃资料或质量要求');
  const sizes = items.map(item => JSON.stringify(material(item))?.length || 0);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  let left = 0, boundary = 1, difference = Infinity;
  for (let index = 1; index < items.length; index++) {
    left += sizes[index - 1];
    const next = Math.abs(total - left * 2);
    if (next < difference) { difference = next; boundary = index; }
  }
  return [items.slice(0, boundary), items.slice(boundary)];
}
