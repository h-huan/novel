export interface OutlineFactReview {
  consistent: boolean;
  contradictions: string[];
  ledger: string[];
}

export function normalizeOutlineFactReview(value: unknown): OutlineFactReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const review = value as Record<string, unknown>;
  if (!Array.isArray(review.contradictions)) return null;
  const contradictions = review.contradictions.map(item => {
    if (typeof item === 'string') return item;
    // 这里曾有第二份仅接收字符串的矛盾格式：模型给出位置和逐字证据对象时，
    // 完整阻断结果被当作格式错误重试，浪费调用并延迟问题呈现。序列化保留全部字段。
    if (item && typeof item === 'object' && !Array.isArray(item)) return JSON.stringify(item);
    return item;
  });
  return { consistent: review.consistent as boolean, contradictions: contradictions as string[], ledger: review.ledger as string[] };
}

export function describeOutlineFactReview(value: unknown): string[] {
  const review = value as Partial<OutlineFactReview> | null;
  const issues: string[] = [];
  if (!review || typeof review.consistent !== 'boolean') issues.push('consistent必须为布尔值');
  if (!Array.isArray(review?.contradictions) || review.contradictions.some(item => typeof item !== 'string')) {
    issues.push('contradictions必须为字符串数组');
  }
  if (!Array.isArray(review?.ledger) || review.ledger.some(item => typeof item !== 'string' || !item.trim())) {
    issues.push('ledger必须为非空条目的字符串数组（没有数量机制时可为空数组）');
  }
  if (review?.consistent === false && Array.isArray(review?.contradictions) && review.contradictions.length === 0) {
    issues.push('consistent=false时必须指出具体矛盾');
  }
  return issues;
}

export function missingPriorLedgerEntries(previous: string[], current: string[]): string[] {
  const currentKeys = new Set(current.map(entry => entry.split(/[：:]/, 1)[0].trim()).filter(Boolean));
  return previous.filter(entry => !currentKeys.has(entry.split(/[：:]/, 1)[0].trim()));
}

/**
 * outlines.order 是数据库内部 0 基序号，而读者/模型看到的“第N章”是 1 基自然章号。
 * 事实审查绝不能把内部 order 原样暴露给模型，否则第4章会同时出现 order=3 与“第4章”，
 * 被正确但无意义地判成自相矛盾。这里是唯一审查边界：删除内部 order，显式提供 chapterNumber。
 */
export function normalizeOutlineChaptersForFactReview(chapters: unknown[]): unknown[] {
  return chapters.map((chapter) => {
    if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter)) return chapter;
    const source = chapter as Record<string, unknown>;
    const { order, ...rest } = source;
    if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) return source;
    return { chapterNumber: order + 1, ...rest };
  });
}

export function buildOutlineFactReviewPrompt(input: {
  canonicalBrief: string;
  world: unknown;
  previousLedger: string[];
  chapters: unknown[];
}): string {
  const reviewChapters = normalizeOutlineChaptersForFactReview(input.chapters);
  return `按执行标准核对已保存的世界观与详细章纲，只检查事实连续性。逐条建立并延续同一事实台账：任何名单、人数、物件等可数项的起始数量；在故事开始前已发生的增减是否已经计入起始数量；每次触发后的增减及当前数量；时间倒退或前进的触发条件、时长和累计位置。必须核对 content、scenes 和其中嵌入的伏笔证据，不能只看章标题。跨章节、跨批次遇到同一对象须延续已有台账，不能重新设定基线；上批未变化的条目也必须原样带入新 ledger。若材料没有明确数字，不得猜数；若不存在数量机制，ledger可为空。chapterNumber 是对外唯一章号（1基）；不得从缺失的内部 order 推导第二套章号。任何两处互斥事实都令 consistent=false，并在 contradictions 中指明两处原文及算式，不得用解释性脑补调和。\n【唯一故事基准】${input.canonicalBrief}\n【已保存世界观】${JSON.stringify(input.world)}\n【前批事实台账】${JSON.stringify(input.previousLedger)}\n【本批完整章纲】${JSON.stringify(reviewChapters)}\n只输出合法JSON：{\"consistent\":true,\"contradictions\":[],\"ledger\":[\"对象：初始值；历史变化；本批每次触发后的值；时间规则与当前时点\"]}。`;
}
