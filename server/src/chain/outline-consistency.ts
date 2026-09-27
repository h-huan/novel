/**
 * 章节大纲内部一致性 · 确定性扫描（纯文本、零 IO、零框架依赖）。
 *
 * 为什么必须存在：正文层硬约束（「本章场景与动作范围以详细大纲的 location_summary
 * 与情节事件为准」）与章末一致性 Gate 都以详细大纲为唯一事实源。当大纲自身自相矛盾时
 * （location_summary 声明「全章不出校门」，ending_setup 的落点却在下一章的主场），
 * 正文无论怎么写都必然违约，Gate 必然 422——这不是评审器误判，是章节合同本身有缺陷。
 * 本模块在大纲阶段就把这类缺陷判出来，交给「就地改写大纲」修复，而不是把矛盾放进正文
 * 再靠 Gate 拦截（module-standards 的 outline 规则要求：确定性校验先判，就地改写）。
 *
 * 判据要求两处同时成立才命中（宁窄勿误报）：
 *  1) 命中的地点词来自「项目内其它章节的 location_summary」，不是任意名词；
 *  2) 该地点词不构成本章自身场景范围的一部分（含子串关系——「店长办公室」在本章
 *     location_summary 的「回魂剧本杀店·店长办公室」里，属本章范围内，不得误判越界）。
 * 判据用生产库 8 个项目 / 24 条章节大纲全量回归过：命中 2 处真缺陷，0 处误报。
 */

/** 参与一致性判定的章节大纲行（只取判定需要的列）。 */
export interface OutlineConsistencyRow {
  id: string;
  order: number;
  title?: string | null;
  location_summary?: string | null;
  ending_setup?: string | null;
  hot_scenes?: string | null;
  setback_scenes?: string | null;
  scenes?: string | null;
}

const OUTLINE_NUMBER_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};
const OUTLINE_NUMBER_CHAR: Record<number, string> = Object.fromEntries(
  Object.entries(OUTLINE_NUMBER_DIGITS).filter(([key]) => key !== '两').map(([key, value]) => [value, key]),
) as Record<number, string>;

/** Only an explicit opening label is corrected; references to later chapters inside prose are untouched. */
export function correctedOutlineOrdinalLabel(row: OutlineConsistencyRow): string | null {
  const summary = String(row.location_summary || '');
  const match = /^(\s*)第([一二两三四五六七八九十\d]+)章(?=空间|场景|地点|范围)/.exec(summary);
  if (!match) return null;
  const written = /^\d+$/.test(match[2]) ? Number(match[2]) : OUTLINE_NUMBER_DIGITS[match[2]];
  const expected = Number(row.order) + 1;
  if (!written || written === expected) return null;
  const replacement = OUTLINE_NUMBER_CHAR[expected] || String(expected);
  return summary.replace(match[0], `${match[1]}第${replacement}章`);
}

export type OutlineConsistencyRule =
  /** location_summary 声明了排他空间范围，落点/场景却跑到范围之外。 */
  | 'scope_exclusive_violation'
  /** 本章把下一章才该登场的核心场景提前抵达/兑现。 */
  | 'next_chapter_scene_preconsumed';

export interface OutlineConsistencyFinding {
  rule: OutlineConsistencyRule;
  outlineId: string;
  order: number;
  title: string;
  /** 命中的字段名（hot_scenes / setback_scenes / ending_setup / scenes.hook）。 */
  field: string;
  fieldLabel: string;
  /** 命中的越界或提前消费的地点词。 */
  matchedPlace: string;
  /** 规则 1：本章声明的排他范围。 */
  scope?: string;
  /** 规则 2：该场景所属的章节 order。 */
  sourceOrder?: number;
  /** 可直接进日志/错误响应的中文说明。 */
  message: string;
}

/** 命中地点词的最短长度：低于 3 个汉字的匹配噪声过大（如「青石村」）。 */
const MIN_PLACE_MATCH = 3;

const SEGMENT_SEPARATOR = /[→\-—>|/]|\r?\n|[；;、，,。]/;
const SCOPE_EXCLUSIVE_RE = /(?:全章|全程|本章|整章)?\s*不(?:出|离开|走出|踏出|迈出|越出|越过|超出)([^\s，。；、,;]{1,12})/;
const SCOPE_INSIDE_RE = /(?:全章|全程|本章|整章|只|仅)?\s*(?:在|限于|限定在)([^\s，。；、,;]{1,12})(?:内|里|之内|以内)/;
/** 含这些词的片段是约束说明/空间描述，不是地点名。 */
const NON_PLACE_FRAGMENT = /不(出|离开|走出|踏出|迈出|越|超)|全章|全程|本章|整章|空间|越收|收窄|必须|不得|禁止|只能|钩子|倒计时/;
/** 括号内子场景只在地点样态（…前/…室/…间 等）且不含描述性连接词时才视为地点。 */
const PLACE_LIKE_ENDING = /[前后里内外上下旁侧口间室厅院墙桌门楼层角廊道场台区房]$/;
const DESCRIPTIVE_CONNECTOR = /[的与和及或者了很再又]/;
/**
 * 地点名不可能以助词/虚词收尾：「母亲的」「驶过第十站之后的」都是从属从句残片，不是地点。
 * 没有这条防线，前缀收缩会把「母亲的床位边」一路截到「母亲的」，从而命中任何一句
 * 「母亲的护理费」。2026-09-23 生产库实测（bcfd17de）：第1章被判「不越出地铁运营与
 * 车库范围」却"越界"到「母亲的」，就地改写 2 轮才"通过"，代价是模型删掉了
 * 「母亲的护理费当场断掉」这条真实主线利害。判据一错，Gate 就从把关变成毁稿。
 */
const TRAILING_PARTICLE = /[的之与和及或者了着过就都也又再很更最只才便却得]$/;
/** 以否定副词开头的片段是行为约束描述，不是地点名（「不登门」「不提前进入养老院」）。 */
const LEADING_NEGATION = /^不/;

const FIELD_LABELS: Record<string, string> = {
  hot_scenes: '高光场景(hot_scenes)',
  setback_scenes: '波折场景(setback_scenes)',
  ending_setup: '章末落点(ending_setup)',
  'scenes.hook': '章末钩子(scenes.hook)',
};

function asJson(value: unknown): any {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asStringList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  const parsed = asJson(value);
  if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') return [value];
  return [];
}

/**
 * 段落里常见「从属从句 + 地点」的写法：location_summary 是一段叙述，不是地名表。
 * 「驶过第十站之后的槐荫路站台」「母亲的床位边」「为后文保留第一次正面照面的落点」
 * 的真名词中心语都在最后一个「的」之后。只保留这一截，否则从句残片会进 tokens，
 * 再被前缀收缩命中普通叙述。取不到（结尾就是「的」）时原样返回，交给 TRAILING_PARTICLE 拦。
 */
function normalizePlaceCandidate(candidate: string): string {
  const token = candidate.trim();
  const cut = token.lastIndexOf('的');
  if (cut > 0 && cut < token.length - 1) return token.slice(cut + 1).trim();
  return token;
}

/**
 * 从 location_summary 提取地点词。
 * 括号内只保留「地点样态」的子场景（如「角色卡墙前」「监控主机前」），
 * 丢弃动作/道具备注（如「拨号、复述、装信封、划台历」），否则会产生大量误报。
 */
export function extractLocationTokens(locationSummary: unknown): string[] {
  if (!locationSummary) return [];
  const raw = String(locationSummary);
  const tokens = new Set<string>();
  const push = (candidate: string) => {
    const token = normalizePlaceCandidate(candidate);
    if (token.length < 2 || token.length > 24) return;
    if (!/[\u4e00-\u9fa5]/.test(token)) return;
    if (NON_PLACE_FRAGMENT.test(token)) return;
    if (TRAILING_PARTICLE.test(token)) return;
    if (LEADING_NEGATION.test(token)) return;
    tokens.add(token);
  };
  const withoutParentheses = raw.replace(/[（(][^）)]*[）)]/g, '').replace(/[「『“”"']/g, '');
  for (const segment of withoutParentheses.split(SEGMENT_SEPARATOR)) {
    push(segment.replace(/^[\s·・:：\-—>]+|[\s·・:：\-—>]+$/g, ''));
  }
  for (const match of raw.matchAll(/[（(]([^）)]+)[）)]/g)) {
    for (const segment of match[1].split(SEGMENT_SEPARATOR)) {
      const token = segment.replace(/[「『“”"'\s·・:：\-—>]/g, '').trim();
      if (token.length >= 3 && !DESCRIPTIVE_CONNECTOR.test(token) && PLACE_LIKE_ENDING.test(token)) {
        push(token);
      }
    }
  }
  return [...tokens];
}

/** 识别 location_summary 声明的排他空间范围（「全章不出校门」→「校门」）。 */
export function detectExclusiveScope(locationSummary: unknown): string | null {
  if (!locationSummary) return null;
  const text = String(locationSummary);
  const matched = SCOPE_EXCLUSIVE_RE.exec(text) || SCOPE_INSIDE_RE.exec(text);
  if (!matched) return null;
  const scope = matched[1].replace(/[（）()「」『』“”"'\s]/g, '').trim();
  return scope.length >= 2 ? scope : null;
}

function collectFields(row: OutlineConsistencyRow): Array<{ field: string; text: string }> {
  const hook = (() => {
    const parsed = asJson(row.scenes);
    return parsed && typeof parsed === 'object' ? String(parsed.hook || '') : '';
  })();
  return [
    { field: 'hot_scenes', text: asStringList(row.hot_scenes).join(' | ') },
    { field: 'setback_scenes', text: asStringList(row.setback_scenes).join(' | ') },
    { field: 'ending_setup', text: String(row.ending_setup || '') },
    { field: 'scenes.hook', text: hook },
  ];
}

/**
 * 在 text 中寻找「属于 otherTokens、但不属于本章自身范围」的地点词。
 * 只按词首匹配（prefix），并逐级缩短，取最长命中，避免把长地名切碎后误命中。
 */
function findOutOfScopePlace(text: string, otherTokens: string[], ownTokens: string[]): string | null {
  if (!text) return null;
  let best: string | null = null;
  for (const place of otherTokens) {
    for (let length = place.length; length >= MIN_PLACE_MATCH; length -= 1) {
      const candidate = place.slice(0, length);
      // 收缩到虚词上就不再是地点：宁可不判，也不许把「母亲的」当成越界地点。
      if (TRAILING_PARTICLE.test(candidate)) continue;
      if (ownTokens.some((own) => own.includes(candidate))) break;
      if (text.includes(candidate)) {
        if (!best || candidate.length > best.length) best = candidate;
        break;
      }
    }
  }
  return best;
}

/**
 * 扫描一个项目的全部章节大纲（按 order 升序传入）。
 * 返回的每条 finding 都是「大纲合同内部自相矛盾」，必须在大纲阶段就地改写。
 */
export function scanOutlineConsistency(rows: OutlineConsistencyRow[]): OutlineConsistencyFinding[] {
  const findings: OutlineConsistencyFinding[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index];
    const ownTokens = extractLocationTokens(current.location_summary);
    if (!ownTokens.length) continue; // 未声明场景范围时不判定空间矛盾
    const fields = collectFields(current);
    const reported = new Set<string>();
    const scope = detectExclusiveScope(current.location_summary);
    if (scope) {
      const laterTokens = [...new Set(rows.slice(index + 1).flatMap((row) => extractLocationTokens(row.location_summary)))];
      for (const { field, text } of fields) {
        const matchedPlace = findOutOfScopePlace(text, laterTokens, ownTokens);
        if (!matchedPlace) continue;
        reported.add(`${field}:${matchedPlace}`);
        findings.push({
          rule: 'scope_exclusive_violation',
          outlineId: current.id,
          order: current.order,
          title: String(current.title || ''),
          field,
          fieldLabel: FIELD_LABELS[field] || field,
          matchedPlace,
          scope,
          message: `第${current.order + 1}章 location_summary 声明「不越出${scope}」，但 ${FIELD_LABELS[field] || field} 的落点/场景在${scope}之外的「${matchedPlace}」，属后续章节主场被提前抵达；大纲合同自相矛盾。`,
        });
      }
    }
    const next = rows[index + 1];
    if (next) {
      const nextTokens = extractLocationTokens(next.location_summary);
      for (const { field, text } of fields) {
        const matchedPlace = findOutOfScopePlace(text, nextTokens, ownTokens);
        if (!matchedPlace || reported.has(`${field}:${matchedPlace}`)) continue;
        findings.push({
          rule: 'next_chapter_scene_preconsumed',
          outlineId: current.id,
          order: current.order,
          title: String(current.title || ''),
          field,
          fieldLabel: FIELD_LABELS[field] || field,
          matchedPlace,
          sourceOrder: next.order,
          message: `第${current.order + 1}章把第${next.order + 1}章才登场的核心场景「${matchedPlace}」写进了 ${FIELD_LABELS[field] || field}，属提前兑现；应收回该落点，或把该场景下调到第${next.order + 1}章。`,
        });
      }
    }
  }
  return findings;
}

/** 汇总成一行日志/错误信息。 */
export function summarizeOutlineConsistency(findings: OutlineConsistencyFinding[]): string {
  if (!findings.length) return '';
  return findings.map((finding) => `- ${finding.message}`).join('\n');
}

/** 构造「就地改写大纲」的修复指令（只改冲突字段，不得改动其它已确认设定）。 */
export function buildOutlineConsistencyRepairInstruction(
  row: OutlineConsistencyRow,
  findings: OutlineConsistencyFinding[],
): string {
  const fields = [...new Set(findings.map((finding) => finding.field))]
    .map((field) => FIELD_LABELS[field] || field)
    .join('、');
  return `【本次只修一处缺陷 · 大纲内部一致性】
第${row.order + 1}章《${String(row.title || '')}》的章节合同自相矛盾，必须就地改写大纲，不得把矛盾留给正文：
${findings.map((finding) => `- ${finding.message}`).join('\n')}

【本章已声明的场景范围（location_summary，不得改动，除非下述改写明确要求收窄它）】
${String(row.location_summary || '')}

【必须改写的字段】${fields}

【改写要求】
1. 只输出需要改写的字段，用一条可执行的收束把越界/提前兑现的场景收回到本章已声明的空间范围内；章末落点必须收在本章范围内的地点上。
2. 若某个场景本来就是下一章的核心场景，本章只能留线索、不得抵达，也不得让主角走到那个地点的门前。
3. 不得改动人物、时间线、已埋/应回收伏笔、以及本章的功能定位；不得新增本章范围之外的地点。
4. 保持与原文同样的信息密度与文风（沿用同样的人称与叙述格调）。

只输出 JSON：{"hot_scenes":["..."],"setback_scenes":["..."],"ending_setup":"...","hook":"..."}
其中未在【必须改写的字段】里的键可以省略。`;
}
