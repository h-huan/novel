export interface OutlineFactReview {
  consistent: boolean;
  contradictions: string[];
  ledger: string[];
}

interface OutlineFactContradictionEvidence {
  location1: string;
  quote1: string;
  location2: string;
  quote2: string;
  conflict: string;
  calculation?: string;
}

const nonEmptyText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/**
 * 事实冲突必须同时给出两处位置、两段逐字证据和明确冲突关系。
 * 只有“对象：当前状态……”这一类台账摘要，哪怕模型误放进 contradictions，也不能成为阻断证据。
 */
function normalizeContradictionEvidence(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const normalized: OutlineFactContradictionEvidence = {
    location1: nonEmptyText(item.location1),
    quote1: nonEmptyText(item.quote1),
    location2: nonEmptyText(item.location2),
    quote2: nonEmptyText(item.quote2),
    conflict: nonEmptyText(item.conflict),
  };
  const calculation = nonEmptyText(item.calculation);
  if (calculation) normalized.calculation = calculation;
  if (!normalized.location1 || !normalized.quote1 || !normalized.location2 || !normalized.quote2 || !normalized.conflict) {
    return null;
  }
  return JSON.stringify(normalized);
}

export function normalizeOutlineFactReview(value: unknown): OutlineFactReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const review = value as Record<string, unknown>;
  if (typeof review.consistent !== 'boolean' || !Array.isArray(review.contradictions) || !Array.isArray(review.ledger)) return null;

  const contradictions: string[] = [];
  for (const item of review.contradictions) {
    const normalized = normalizeContradictionEvidence(item);
    // 不再接受“自由文本冲突”。此前模型把“配比一致、数量未变、伏笔未回收”等
    // 台账摘要直接塞进 contradictions，业务层只看数组非空就把整本书判死。
    // 格式不合格就让调用层按结构化输出重试，绝不能把无双边证据的摘要升级成事实互斥。
    if (!normalized) return null;
    contradictions.push(normalized);
  }

  const ledger = review.ledger.map(item => typeof item === 'string' ? item.trim() : item) as unknown[];
  if (ledger.some(item => typeof item !== 'string' || !item)) return null;

  return {
    consistent: review.consistent,
    contradictions,
    ledger: ledger as string[],
  };
}

export function describeOutlineFactReview(value: unknown): string[] {
  const review = value as Partial<OutlineFactReview> | null;
  const issues: string[] = [];
  if (!review || typeof review.consistent !== 'boolean') issues.push('consistent必须为布尔值');
  if (!Array.isArray(review?.contradictions) || review.contradictions.some(item => typeof item !== 'string')) {
    issues.push('contradictions必须为带两处逐字证据的结构化冲突数组');
  }
  if (!Array.isArray(review?.ledger) || review.ledger.some(item => typeof item !== 'string' || !item.trim())) {
    issues.push('ledger必须为非空条目的字符串数组（没有数量机制时可为空数组）');
  }
  if (review?.consistent === false && Array.isArray(review?.contradictions) && review.contradictions.length === 0) {
    issues.push('consistent=false时必须给出两处位置、两段原文与明确冲突关系');
  }
  if (review?.consistent === true && Array.isArray(review?.contradictions) && review.contradictions.length > 0) {
    issues.push('consistent=true时contradictions必须为空数组');
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
  return `按执行标准核对已保存的世界观与详细章纲，只检查事实连续性。逐条建立并延续同一事实台账：任何名单、人数、物件等可数项的起始数量；在故事开始前已发生的增减是否已经计入起始数量；每次触发后的增减及当前数量；时间倒退或前进的触发条件、时长和累计位置。必须核对 content、scenes、characterActions 和其中嵌入的伏笔证据，不能只看章标题。跨章节、跨批次遇到同一对象须延续已有台账，不能重新设定基线；上批未变化的条目也必须原样带入新 ledger。若材料没有明确数字，不得猜数；若不存在数量机制，ledger可为空。chapterNumber 是对外唯一章号（1基）；不得从缺失的内部 order 推导第二套章号。\n判定纪律：contradictions 只允许放“同一事实在两处材料中无法同时成立”的冲突。每条冲突必须给出 location1、quote1、location2、quote2、conflict；涉及数量/时间时再给 calculation。像“配比一致”“数量仍为1”“当前已签署但未归档”“伏笔已埋设且本批未回收”这种状态摘要属于 ledger，不是矛盾；不得因为信息暂未明写就自行判冲突。给不出两处逐字证据时必须视为没有被证明的冲突，不得写入 contradictions。\n【唯一故事基准】${input.canonicalBrief}\n【已保存世界观】${JSON.stringify(input.world)}\n【前批事实台账】${JSON.stringify(input.previousLedger)}\n【本批完整章纲】${JSON.stringify(reviewChapters)}\n只输出合法JSON。无冲突：{\"consistent\":true,\"contradictions\":[],\"ledger\":[\"对象：初始值；历史变化；本批每次触发后的值；时间规则与当前时点\"]}。确有冲突：{\"consistent\":false,\"contradictions\":[{\"location1\":\"第一处字段路径\",\"quote1\":\"第一处逐字原文\",\"location2\":\"第二处字段路径\",\"quote2\":\"第二处逐字原文\",\"conflict\":\"两处为何无法同时成立\",\"calculation\":\"涉及数量或时间时写算式，否则留空\"}],\"ledger\":[\"仍需延续的事实台账\"]}。`;
}
