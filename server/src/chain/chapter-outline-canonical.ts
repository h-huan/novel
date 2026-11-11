/**
 * 章纲规范化：让同一事实只存在一份。
 *
 * 背景（防复发）：短篇创建时 `content` 会被追加 `人物行动/冲突设计/爽点设置/...`
 * 的文本副本，对象数组还会被 JSON.stringify；同一批字段又结构化写进 `scenes`。
 * 之后任何一次普通 PUT 只改其中一份，另一份就成为“旧副本”，正文生成和 Gate
 * 会同时读到互斥的两份合同。只在 prompt 里覆盖旧副本属于掩盖，旧数据仍在库里，
 * 其它读取方/下一次更新仍会读到它。
 *
 * 本模块的唯一规则：
 *   - `content` 只保留核心事件链；
 *   - `scenes` 是结构化字段（scenes/characterActions/conflicts/highlights/hook/
 *     emotionalTone/foreshadowing/characterStates/responsibilityContract）的唯一来源；
 *   - 派生列由 scenes 投影，不独立编辑；
 *   - 迁移/保存时把旧副本原文写入 outline_normalization_log，再写规范值。
 *
 * 不做语义猜测：scenes 无法解析、或规范化后没有事件链时返回 conflicts，由调用方
 * 阻断并列出字段差异；不静默丢内容。
 */
import { createHash, randomUUID } from 'node:crypto';

export const STRUCTURED_OUTLINE_SECTION_MARKERS = [
  '主要场景',
  '人物行动',
  '冲突设计',
  '爽点设置',
  '热血镜头',
  '高光镜头',
  '伏笔设置',
  '伏笔回收',
  '结尾设置',
  '下章预告',
  '情绪基调',
  '反转点',
  '目标字数',
] as const;

export type StructuredOutlineSectionMarker = typeof STRUCTURED_OUTLINE_SECTION_MARKERS[number];

export interface OutlineCanonicalChange {
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface OutlineCanonicalConflict {
  field: string;
  message: string;
  contentValue: string;
  structuredValue: string;
}

export interface OutlineCanonicalResult {
  content: string;
  scenes: string | null;
  derived: Record<string, string>;
  changes: OutlineCanonicalChange[];
  conflicts: OutlineCanonicalConflict[];
  canonicalHash: string;
  changed: boolean;
}

type MarkerPosition = {
  marker: StructuredOutlineSectionMarker;
  start: number;
  bodyStart: number;
  body: string;
  structuredValue: string;
};

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === '' ? [] : [value];
}

function sceneListValue(plan: any): string {
  return asArray(plan?.scenes ?? plan?.mainScenes)
    .map(scene => typeof scene === 'string' ? scene.trim() : text((scene as any)?.location ?? (scene as any)?.name))
    .filter(Boolean)
    .join(' → ');
}

function actionListValue(plan: any): string {
  const actions = plan?.characterActions ?? plan?.['人物行动'] ?? plan?.actions;
  if (Array.isArray(actions)) {
    return actions
      .map(action => typeof action === 'string'
        ? action.trim()
        : `${text(action?.character) || '?'}：${text(action?.action)}→${text(action?.result)}`)
      .filter(Boolean)
      .join('；');
  }
  return text(actions);
}

function conflictListValue(plan: any): string {
  const conflicts = plan?.conflicts ?? plan?.conflict ?? plan?.conflictDesign;
  if (Array.isArray(conflicts)) {
    return conflicts
      .map(conflict => typeof conflict === 'string'
        ? conflict.trim()
        : `${text(conflict?.name)}：${text(conflict?.trigger)}→${text(conflict?.escalation)}→${text(conflict?.resolution)}`)
      .filter(Boolean)
      .join('；');
  }
  return text(conflicts);
}

function highlightListValue(plan: any): string {
  const highlights = plan?.highlights ?? plan?.highlight ?? plan?.hotScenes ?? plan?.hot_scenes;
  if (Array.isArray(highlights)) {
    return highlights
      .map(highlight => {
        if (typeof highlight === 'string') return highlight.trim();
        const label = text(highlight?.point ?? highlight?.name ?? highlight?.title ?? highlight);
        const trigger = text(highlight?.trigger);
        return trigger ? `${label}（${trigger}）` : label;
      })
      .filter(Boolean)
      .join('；');
  }
  return text(highlights);
}

function hookValue(plan: any): string {
  return text(plan?.hook ?? plan?.nextHook ?? plan?.nextChapterHook ?? plan?.endingSetup);
}

function emotionalToneValue(plan: any): string {
  return text(plan?.emotionalTone ?? plan?.emotional_tone);
}

function foreshadowingValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === 'string'
        ? item.trim()
        : [text(item?.content ?? item?.reference), text(item?.method)].filter(Boolean).join('：'))
      .filter(Boolean)
      .join('；');
  }
  return text(value);
}

function reversalValue(plan: any): string {
  const value = plan?.turningPoint ?? plan?.reversalPoint ?? plan?.reversals;
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean).join('；') : text(value);
}

function structuredValueFor(marker: StructuredOutlineSectionMarker, plan: any): string {
  switch (marker) {
    case '主要场景': return sceneListValue(plan);
    case '人物行动': return actionListValue(plan);
    case '冲突设计': return conflictListValue(plan);
    case '爽点设置': return highlightListValue(plan);
    case '热血镜头':
    case '高光镜头': return text(plan?.rousing ?? plan?.hotScenes ?? plan?.hot_scenes);
    case '伏笔设置': return foreshadowingValue(plan?.foreshadowing ?? plan?.foreshadowingSetting);
    case '伏笔回收': return foreshadowingValue(plan?.foreshadowingRecover ?? plan?.foreshadowingRecovery ?? plan?.foreshadowingPayoff);
    case '结尾设置': return hookValue(plan);
    case '下章预告': return hookValue(plan);
    case '情绪基调': return emotionalToneValue(plan);
    case '反转点': return reversalValue(plan);
    case '目标字数': return text(plan?.targetWords);
    default: return '';
  }
}

/**
 * content 里的结构化段落是“尾部副本”，同一 marker 在事件链正文中偶尔也会出现。
 * 取每个 marker 的最后一次出现，按位置排序；后者只到下一个 marker 为止。
 */
function markerPositions(content: string, plan: any): MarkerPosition[] {
  const found: Array<Pick<MarkerPosition, 'marker' | 'start' | 'bodyStart'>> = [];
  for (const marker of STRUCTURED_OUTLINE_SECTION_MARKERS) {
    const re = new RegExp(`${marker}\\s*[：:]`, 'g');
    let last: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) last = match;
    if (last) found.push({ marker, start: last.index, bodyStart: last.index + last[0].length });
  }
  found.sort((a, b) => a.start - b.start);
  const positions: MarkerPosition[] = [];
  for (let index = 0; index < found.length; index += 1) {
    const current = found[index];
    if (positions.length && current.start < positions[positions.length - 1].bodyStart) continue;
    const nextStart = found.slice(index + 1).find(item => item.start >= current.bodyStart)?.start ?? content.length;
    positions.push({
      ...current,
      body: content.slice(current.bodyStart, nextStart).trim(),
      structuredValue: structuredValueFor(current.marker, plan),
    });
  }
  return positions;
}

function derivedFromPlan(plan: any, row: any): Record<string, string> {
  const scenes = asArray(plan?.scenes ?? plan?.mainScenes);
  const locations = scenes
    .map(scene => typeof scene === 'string' ? scene.trim() : text((scene as any)?.location ?? (scene as any)?.name))
    .filter(Boolean)
    .filter((location, index, all) => index === 0 || location !== all[index - 1]);
  const highlights = plan?.highlights ?? plan?.highlight ?? plan?.hotScenes ?? plan?.hot_scenes;
  const highlightArray = Array.isArray(highlights) ? highlights : highlights ? [highlights] : [];
  return {
    chapter_type: text(row?.chapter_type || row?.chapter_function || plan?.chapterFunction || plan?.responsibilityContract?.function),
    pov_ratio: text(plan?.pov_ratio ?? plan?.povRatio ?? row?.pov_ratio),
    hot_scenes: highlights === undefined || highlights === null || highlights === ''
      ? text(row?.hot_scenes)
      : text(highlights),
    setback_scenes: text(plan?.setback_scenes ?? plan?.setbackScenes ?? row?.setback_scenes),
    ending_setup: hookValue(plan) || text(row?.ending_setup),
    conflict_design: (plan?.conflicts ?? plan?.conflict) === undefined
      ? text(row?.conflict_design)
      : text(plan?.conflicts ?? plan?.conflict),
    system_hints: text(plan?.system_hints ?? plan?.systemHints ?? row?.system_hints),
    location_summary: locations.length ? locations.join(' → ') : text(row?.location_summary),
    highlight_points: highlightArray.length ? JSON.stringify(highlightArray) : text(row?.highlight_points),
  };
}

export function canonicalizeChapterOutline(row: any): OutlineCanonicalResult {
  const originalContent = String(row?.content ?? '');
  const originalScenes = row?.scenes === undefined || row?.scenes === null
    ? null
    : (typeof row.scenes === 'string' ? row.scenes : JSON.stringify(row.scenes));
  const conflicts: OutlineCanonicalConflict[] = [];

  let plan: any = row?.scenes;
  if (typeof plan === 'string') {
    try { plan = JSON.parse(plan); } catch {
      return {
        content: originalContent, scenes: originalScenes, derived: {},
        changes: [], canonicalHash: '', changed: false,
        conflicts: [{ field: 'scenes', message: 'scenes 不是可解析的 JSON 对象，无法确定结构化事实源', contentValue: originalContent, structuredValue: String(row?.scenes ?? '') }],
      };
    }
  }
  if (Array.isArray(plan)) plan = { scenes: plan };
  if (!plan || typeof plan !== 'object') {
    return {
      content: originalContent, scenes: originalScenes, derived: {},
      changes: [], canonicalHash: '', changed: false,
      conflicts: [{ field: 'scenes', message: 'scenes 为空或不是对象，无法确定结构化事实源', contentValue: originalContent, structuredValue: '' }],
    };
  }

  const positions = markerPositions(originalContent, plan);
  const firstStart = positions.length ? positions[0].start : -1;
  const head = firstStart >= 0 ? originalContent.slice(0, firstStart).trimEnd() : originalContent.trim();

  // 没有事件链时不要为了“规范化”把 content 清空：保留原文，交给调用方/作者处理。
  if (!head.trim() && positions.length) {
    return {
      content: originalContent, scenes: originalScenes, derived: derivedFromPlan(plan, row),
      changes: [], canonicalHash: '', changed: false, conflicts,
    };
  }

  const changes: OutlineCanonicalChange[] = [];
  const keptSections: string[] = [];
  for (const position of positions) {
    if (!position.structuredValue) {
      // 结构化字段缺失：这一份是唯一来源，保留，不丢内容。
      keptSections.push(`${position.marker}：${position.body}`);
      continue;
    }
    if (position.body && position.body !== position.structuredValue) {
      changes.push({
        field: `content.${position.marker}`,
        oldValue: position.body,
        newValue: position.structuredValue,
        reason: '结构化字段已覆盖该段；旧副本归档到 outline_normalization_log，content 只保留事件链',
      });
    } else if (position.body) {
      // 内容与结构化值一致也要记录“移除重复副本”，否则审计里看不出这段被迁移过。
      changes.push({
        field: `content.${position.marker}`,
        oldValue: position.body,
        newValue: position.structuredValue,
        reason: 'content 与结构化字段重复；移除副本，content 只保留事件链',
      });
    }
  }

  const canonicalContent = [head, ...keptSections].filter(part => String(part).trim()).join('\n').trim();
  const derived = derivedFromPlan(plan, row);
  for (const [field, newValue] of Object.entries(derived)) {
    const oldValue = text(row?.[field]);
    if (oldValue !== newValue) {
      changes.push({
        field,
        oldValue,
        newValue,
        reason: '派生列由 scenes 投影重算',
      });
    }
  }
  const canonicalScenes = typeof row?.scenes === 'string' ? row.scenes : JSON.stringify(plan);
  const canonicalHash = createHash('sha256')
    .update(JSON.stringify({ content: canonicalContent, scenes: plan, derived }))
    .digest('hex');
  const changed = canonicalContent !== originalContent
    || canonicalScenes !== (originalScenes ?? '')
    || Object.entries(derived).some(([key, value]) => String(row?.[key] ?? '') !== value)
    || String(row?.canonical_hash ?? '') !== canonicalHash;

  return { content: canonicalContent, scenes: canonicalScenes, derived, changes, conflicts, canonicalHash, changed };
}

/**
 * 持久化规范化结果：活动列只保留规范值，旧副本原文写入审计表。
 * 返回是否真的写入了新版本。
 */
export function writeCanonicalOutline(
  db: any,
  row: any,
  result: OutlineCanonicalResult,
  reason: string,
  now = new Date().toISOString(),
): boolean {
  if (result.conflicts.length) throw new Error(`章纲存在未解决的多版本冲突：${result.conflicts.map(item => `${item.field}: ${item.message}`).join('；')}`);
  if (!result.changed) return false;

  const update = db.prepare(`UPDATE outlines SET content=?, scenes=?, chapter_type=?, pov_ratio=?,
      hot_scenes=?, setback_scenes=?, ending_setup=?, conflict_design=?, system_hints=?,
      location_summary=?, highlight_points=?, outline_revision=COALESCE(outline_revision,0)+1,
      canonical_hash=?, normalized_at=?, updated_at=? WHERE id=? AND project_id=?`);
  const changed = update.run(
    result.content, result.scenes, result.derived.chapter_type ?? '', result.derived.pov_ratio ?? '',
    result.derived.hot_scenes ?? '', result.derived.setback_scenes ?? '', result.derived.ending_setup ?? '',
    result.derived.conflict_design ?? '', result.derived.system_hints ?? '',
    result.derived.location_summary ?? '', result.derived.highlight_points ?? '',
    result.canonicalHash, now, now, row.id, row.project_id,
  );
  if (Number(changed.changes || 0) !== 1) throw new Error(`章纲规范化写回失败：${row.id}`);

  const insertLog = db.prepare(`INSERT INTO outline_normalization_log
    (id, outline_id, project_id, field, old_value, new_value, reason, created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const change of result.changes) {
    insertLog.run(randomUUID(), row.id, row.project_id, change.field, change.oldValue, change.newValue, `${reason}：${change.reason}`, now);
  }
  return true;
}
