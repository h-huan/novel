export interface OutlineFactLedgerEntry {
  /** Identity is assigned by the server, independently of titles/chapter numbers. */
  id: string;
  baseline: string;
  history: string[];
  current: string;
}

/** Review the complete accepted draft, including all supported field aliases. */
export function chapterFactsForReview(order: number, candidate: Record<string, unknown>): Record<string, unknown> {
  return { ...candidate, order };
}

export interface OutlineFactReview {
  consistent: boolean;
  contradictions: string[];
  ledger: OutlineFactLedgerEntry[];
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

export function normalizeOutlineFactReview(value: unknown, previous: OutlineFactLedgerEntry[] = []): OutlineFactReview | null {
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

  // The server inherits unchanged entries and owns immutable baselines/history.
  const ledger = previous.map(entry => ({ ...entry, history: [...entry.history] }));
  const byId = new Map(ledger.map(entry => [entry.id, entry]));
  const inheritedIds = new Set(previous.map(entry => entry.id));
  const updatedIds = new Set<string>();
  let nextId = ledger.length + 1;
  for (const item of review.ledger) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some(key => key !== 'id' && key !== 'current')) return null;
    const current = nonEmptyText(record.current);
    if (!current || ('id' in record && (typeof record.id !== 'string' || !record.id.trim()))) return null;
    const id = nonEmptyText(record.id);
    if (id) {
      const prior = byId.get(id);
      if (!prior || !inheritedIds.has(id) || updatedIds.has(id)) return null;
      updatedIds.add(id);
      if (prior.current !== current) {
        prior.history.push(prior.current);
        prior.current = current;
      }
    } else if (!ledger.some(entry => entry.current === current)) {
      while (byId.has('fact_' + nextId)) nextId += 1;
      const entry = { id: 'fact_' + nextId++, baseline: current, history: [], current };
      ledger.push(entry);
      byId.set(entry.id, entry);
    }
  }

  return {
    consistent: review.consistent,
    contradictions,
    ledger,
  };
}

export function describeOutlineFactReview(value: unknown): string[] {
  const review = value as Partial<OutlineFactReview> | null;
  const issues: string[] = [];
  if (!review || typeof review.consistent !== 'boolean') issues.push('consistent必须为布尔值');
  if (!Array.isArray(review?.contradictions) || review.contradictions.some(item => typeof item !== 'string')) {
    issues.push('contradictions必须为带两处逐字证据的结构化冲突数组');
  }
  if (!Array.isArray(review?.ledger) || review.ledger.some(item => !item ||
    typeof item.id !== 'string' || !item.id.trim() || typeof item.baseline !== 'string' || !item.baseline.trim() ||
    typeof item.current !== 'string' || !item.current.trim() || !Array.isArray(item.history) ||
    item.history.some(state => typeof state !== 'string' || !state.trim()))) {
    issues.push('ledger必须提交有效current；更新须引用已有id，不得伪造编号或覆盖历史');
  }
  if (review?.consistent === false && Array.isArray(review?.contradictions) && review.contradictions.length === 0) {
    issues.push('consistent=false时必须给出两处位置、两段原文与明确冲突关系');
  }
  if (review?.consistent === true && Array.isArray(review?.contradictions) && review.contradictions.length > 0) {
    issues.push('consistent=true时contradictions必须为空数组');
  }
  return issues;
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
    return { ...rest, chapterNumber: order + 1 };
  });
}

export function buildOutlineFactReviewPrompt(input: {
  canonicalBrief: string;
  world: unknown;
  previousLedger: OutlineFactLedgerEntry[];
  chapters: unknown[];
  sourceChapters?: unknown[];
}): string {
  const reviewChapters = normalizeOutlineChaptersForFactReview(input.chapters);
  const sourceChapters = normalizeOutlineChaptersForFactReview(input.sourceChapters || []);
  return `按执行标准核对已保存的世界观与详细章纲，只检查事实连续性。按生效执行标准中的事实台账覆盖范围逐条建立并继承事实，核对全部当前章字段与前章事实。必须核对 content、scenes、characterActions 和其中嵌入的伏笔证据，不能只看章标题。跨章节、跨批次遇到同一对象须延续已有台账，不能重新设定基线；事实身份由服务端id确定，标题和章节状态可正常变化。前批baseline与history由服务端保留，不能重写。ledger只提交本批状态更新：更新已有事实用{id,current}，原样引用已有id；新增事实用{current}，编号由服务端分配；未变化条目可省略，服务端自动继承。即使省略条目，也必须核对其baseline、history、current与本章是否真正互斥；真实冲突必须在contradictions中提供双方原文证据。若材料没有明确数字，不得猜数；若本批没有新增或变化，ledger可为空，旧台账仍完整继承。\n判定纪律：contradictions 只允许放“同一事实在两处材料中无法同时成立”的冲突。每条冲突必须给出 location1、quote1、location2、quote2、conflict；涉及数量/时间时再给 calculation。像“配比一致”“数量仍为1”“当前已签署但未归档”“伏笔已埋设且本批未回收”这种状态摘要属于 ledger，不是矛盾；不得因为信息暂未明写就自行判冲突。给不出两处逐字证据时必须视为没有被证明的冲突，不得写入 contradictions。\n【唯一故事基准】${input.canonicalBrief}\n【已保存世界观】${JSON.stringify(input.world)}\n【已确认前章原始资料】${JSON.stringify(sourceChapters)}\n【前批事实台账】${JSON.stringify(input.previousLedger)}\n【本批完整章纲】${JSON.stringify(reviewChapters)}\n只输出合法JSON。无冲突：{\"consistent\":true,\"contradictions\":[],\"ledger\":[{\"current\":\"对象：起始事实与本批状态\"}]}。确有冲突：{\"consistent\":false,\"contradictions\":[{\"location1\":\"第一处字段路径\",\"quote1\":\"第一处逐字原文\",\"location2\":\"第二处字段路径\",\"quote2\":\"第二处逐字原文\",\"conflict\":\"两处为何无法同时成立\",\"calculation\":\"涉及数量或时间时写算式，否则留空\"}],\"ledger\":[{\"id\":\"前批已有id\",\"current\":\"有依据的本批状态\"}]}。`;
}
