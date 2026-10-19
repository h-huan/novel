import { OUTLINE_STATE_CONTINUITY_POLICY } from '../../shared/src/system-workflow-rules.registry';

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

/** Diagnose the model's delta, not a null normalized record. An unknown ledger
 * id must not falsely report a correct consistent flag as missing. */
export function describeOutlineFactUpdateProtocol(value:unknown,previous:OutlineFactLedgerEntry[]):string[]{
  if(!value||typeof value!=='object'||Array.isArray(value))return ['事实审查须返回JSON对象'];
  const raw=value as Record<string,any>,issues:string[]=[],known=new Set(previous.map(row=>row.id)),seen=new Set<string>();
  if(typeof raw.consistent!=='boolean')issues.push('consistent必须为布尔值');
  if(!Array.isArray(raw.contradictions))issues.push('contradictions必须为带两处逐字证据的结构化冲突数组');
  else raw.contradictions.forEach((row:unknown,index:number)=>{
    if(!normalizeContradictionEvidence(row))issues.push(`contradictions[${index}]缺少两处位置、逐字引文或具体冲突关系`);
  });
  if(!Array.isArray(raw.ledger))issues.push('ledger必须为状态更新数组');
  else raw.ledger.forEach((row:any,index:number)=>{
    const at=`ledger[${index}]`;
    if(!row||typeof row!=='object'||Array.isArray(row)){issues.push(at+'须为更新对象');return;}
    const extras=Object.keys(row).filter(key=>key!=='id'&&key!=='current');
    if(extras.length)issues.push(at+'不允许改写字段：'+extras.join('、')+'；只返回id和current');
    if(!nonEmptyText(row.current))issues.push(at+'.current须为非空事实文本');
    if(Object.hasOwn(row,'id')){
      if(typeof row.id!=='string'||!row.id.trim())issues.push(at+'.id须引用前批已有编号；新增事实省略id');
      else if(!known.has(row.id.trim()))issues.push(at+'.id='+row.id+'不在前批台账中；新增事实省略id，由服务器分配，不得自行编号');
      else if(seen.has(row.id.trim()))issues.push(at+'.id重复更新同一事实：'+row.id);
      seen.add(nonEmptyText(row.id));
    }
  });
  return issues;
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


/** Lossless prompt-only encoding; persistence keeps the original ledger schema. */
export function serializeOutlineFactLedger(ledger: OutlineFactLedgerEntry[]): string {
  const plain = JSON.stringify(ledger);
  const states: Record<string, string> = {}, ids = new Map<string, string>();
  const ref = (text: string) => {
    let id = ids.get(text);
    if (!id) { id = 'S' + (ids.size + 1); ids.set(text, id); states[id] = text; }
    return id;
  };
  const entries = ledger.map(row => ({id:row.id,baseline:ref(row.baseline),history:row.history.map(ref),current:ref(row.current)}));
  const encoded = JSON.stringify({encoding:'exact_state_refs',states,entries});
  return encoded.length < plain.length ? encoded : plain;
}

export interface OutlineFactAnchor { id:string; path:string; text:string }
/** Raw sources only: derived ledger summaries must never become source evidence. */
export function outlineFactEvidenceAnchors(input: {canonicalBrief:string;world:unknown;sourceChapters?:unknown[];chapters:unknown[]}): OutlineFactAnchor[] {
  const anchors: OutlineFactAnchor[] = [];
  const walk = (value:unknown,path:string):void => {
    if(typeof value==='string' && value.trim()) {
      anchors.push({id:'F'+(anchors.length+1),path,text:value});
      try { const parsed=JSON.parse(value); if(parsed && typeof parsed==='object')walk(parsed,path+'.json'); } catch {}
    } else if(Array.isArray(value)) value.forEach((item,index)=>walk(item,path+'['+index+']'));
    else if(value && typeof value==='object') Object.entries(value).forEach(([key,item])=>walk(item,path+'.'+key));
  };
  walk(input.canonicalBrief,'确认故事');walk(input.world,'保存世界');
  for(const [name,rows] of [['前章',input.sourceChapters||[]],['本批',input.chapters]] as const) {
    normalizeOutlineChaptersForFactReview([...rows]).forEach((row:any,index:number)=>walk(row,name+'·'+(Number.isInteger(row?.chapterNumber)?'第'+row.chapterNumber+'章':'条目'+(index+1))));
  }
  return anchors;
}

export function resolveOutlineFactEvidence(value:unknown,anchors:OutlineFactAnchor[]):unknown {
  if(!value || typeof value!=='object' || Array.isArray(value))return value;
  const review=value as any;
  if(!Array.isArray(review.contradictions))return value;
  const byId=new Map(anchors.map(anchor=>[anchor.id,anchor]));
  return {...review,contradictions:review.contradictions.map((row:any)=>{
    if(!row || typeof row!=='object' || Array.isArray(row))return row;
    const next={...row};
    for(const side of [1,2]) {
      const id=next['anchor'+side];
      if(id===undefined)continue; // Existing stored reports remain valid only with exact quotes.
      const anchor=byId.get(id);
      if(!anchor) { next['quote'+side]='';continue; }
      // A conflicting literal quote is not silently repaired into a different finding.
      if(next['quote'+side]!==undefined && next['quote'+side]!==anchor.text) { next['quote'+side]='';continue; }
      next['quote'+side]=anchor.text;
      next['location'+side]=next['location'+side]||anchor.path;
    }
    return next;
  })};
}

/** Generation consumes the same evidence and history as review and repair. */
export function buildOutlineContinuityContext(sourceChapters: unknown[], previousLedger: OutlineFactLedgerEntry[], includePolicy = true): string {
  return `${includePolicy ? OUTLINE_STATE_CONTINUITY_POLICY : "按已注入CTX-005、CTX-008核对累计状态与时间。"}\n【已确认前章原始资料】${JSON.stringify(normalizeOutlineChaptersForFactReview(sourceChapters))}\n【前批事实台账】${serializeOutlineFactLedger(previousLedger)}`;
}

/** Review quotations must exist in actual supplied text, not just sound plausible. */
export function describeOutlineFactEvidence(review: OutlineFactReview | null, sources: unknown[], chapterSources: unknown[] = []): string[] {
  if (!review) return [];
  const texts: string[] = [];
  const collect = (value: unknown, target = texts): void => {
    if (typeof value === 'string') {
      target.push(value);
      try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') collect(parsed, target); } catch {}
    } else if (Array.isArray(value)) value.forEach(item => collect(item, target));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => collect(item, target));
  };
  collect(sources);
  const numbered = normalizeOutlineChaptersForFactReview(chapterSources) as Array<Record<string, unknown>>;
  const chapterNumber = (location: string): number | undefined => {
    const match = location.match(/第\s*([\d一二三四五六七八九十百千零〇两]+)\s*章|chapter(?:Number)?\s*[:=#]?\s*(\d+)/i);
    if (!match) return undefined;
    const raw = match[1] || match[2];
    if (/^\d+$/.test(raw)) return Number(raw);
    const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 零: 0, 〇: 0, 两: 2 };
    const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
    let total = 0, digit = 0;
    for (const char of raw) {
      if (char in units) { total += (digit || 1) * units[char]; digit = 0; }
      else digit = digits[char];
    }
    return total + digit;
  };
  return review.contradictions.flatMap((item, index) => {
    const evidence = JSON.parse(item);
    return ['quote1', 'quote2'].flatMap((key, side) => {
      if (!texts.some(text => text.includes(evidence[key]))) return [`第${index + 1}条矛盾的${key}不能逐字定位到本次输入原始资料；重新核对证据，不得据此改写小说事实`];
      const number = chapterNumber(evidence['location' + (side + 1)]);
      if (number === undefined || !numbered.length) return [];
      const chapterTexts: string[] = [];
      numbered.filter(c => c.chapterNumber === number).forEach(c => collect(c, chapterTexts));
      return chapterTexts.some(text => text.includes(evidence[key])) ? []
        : [`第${index + 1}条矛盾的${key}虽存在于其他资料，但不在声明的第${number}章；按chapterNumber重新定位，不得据此改写小说事实`];
    });
  });
}

export function buildOutlineFactReviewPrompt(input: {
  canonicalBrief: string;
  world: unknown;
  previousLedger: OutlineFactLedgerEntry[];
  chapters: unknown[];
  sourceChapters?: unknown[];
  includePolicy?: boolean;
}): string {
  const reviewChapters = normalizeOutlineChaptersForFactReview(input.chapters);
  const sourceChapters = normalizeOutlineChaptersForFactReview(input.sourceChapters || []);
  return `${input.includePolicy !== false ? OUTLINE_STATE_CONTINUITY_POLICY : "按已注入CTX-005、CTX-008核对累计状态与时间。"}\n按执行标准核对已保存的世界观与详细章纲，只检查事实连续性。台账若为exact_state_refs格式，states是逐字原文，entries中baseline/history/current的S编号必须按states还原并逐条核对，不能把编号当成事实文字、丢弃历史或只看current。按生效执行标准中的事实台账覆盖范围逐条建立并继承事实，核对全部当前章字段与前章事实。必须核对 content、scenes、characterActions 和其中嵌入的伏笔证据，不能只看章标题。跨章节、跨批次遇到同一对象须延续已有台账，不能重新设定基线；事实身份由服务端id确定，标题和章节状态可正常变化。前批baseline与history由服务端保留，不能重写。ledger只提交本批状态更新：更新已有事实用{id,current}，原样引用已有id；新增事实用{current}，编号由服务端分配；未变化条目可省略，服务端自动继承。即使省略条目，也必须核对其baseline、history、current与本章是否真正互斥；真实冲突必须在contradictions中提供双方原文证据。若材料没有明确数字，不得猜数；若本批没有新增或变化，ledger可为空，旧台账仍完整继承。\n判定纪律：contradictions 只允许放“同一事实在两处材料中无法同时成立”的冲突。每条冲突优先给出原文目录的anchor1、anchor2和conflict，服务端按编号回填完整原文与实际路径；不得引用前批台账摘要编号充当原始资料。兼容旧格式时必须给出 location1、quote1、location2、quote2、conflict；涉及数量/时间时再给 calculation。像“配比一致”“数量仍为1”“当前已签署但未归档”“伏笔已埋设且本批未回收”这种状态摘要属于 ledger，不是矛盾；不得因为信息暂未明写就自行判冲突。给不出两处逐字证据时必须视为没有被证明的冲突，不得写入 contradictions。\n【唯一故事基准】${input.canonicalBrief}\n【已保存世界观】${JSON.stringify(input.world)}\n【已确认前章原始资料】${JSON.stringify(sourceChapters)}\n【前批事实台账】${serializeOutlineFactLedger(input.previousLedger)}\n【本批完整章纲】${JSON.stringify(reviewChapters)}\n【原始资料编号目录（原文只出现于上述输入，按路径选取，不手抄）】${JSON.stringify(outlineFactEvidenceAnchors(input).map(({id,path})=>({id,path})))}\n只输出合法JSON。无冲突：{\"consistent\":true,\"contradictions\":[],\"ledger\":[{\"current\":\"对象：起始事实与本批状态\"}]}。确有冲突：{\"consistent\":false,\"contradictions\":[{\"anchor1\":\"第一处实际F编号\",\"anchor2\":\"第二处实际F编号\",\"conflict\":\"两处为何无法同时成立\",\"calculation\":\"涉及数量或时间时写算式，否则留空\"}],\"ledger\":[{\"id\":\"前批已有id\",\"current\":\"有依据的本批状态\"}]}。`;
}
