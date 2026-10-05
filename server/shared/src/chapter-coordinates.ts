/** order is a zero-based sibling position; chapterIndex is a one-based story number. */
export function chapterNumberFromOrder(order: number): number {
  if (!Number.isSafeInteger(order) || order < 0) throw new Error('章节内部排序必须为非负整数');
  return order + 1;
}

