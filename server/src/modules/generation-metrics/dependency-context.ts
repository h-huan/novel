import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { QualityStage } from '../writing-quality/quality-issue';
import { canonical, compileCharacterContract, object } from '../writing-quality/character-contract';
import { chapterContractFromOutline } from './chapter-contract-context';

function ids(v: any): string[] {
  try {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function boundedRows(db: DatabaseSync, name: string, projectId: string, limit = 48): any[] {
  if (!tableExists(db, name)) return [];
  return db.prepare(`SELECT * FROM ${name} WHERE project_id=? ORDER BY id LIMIT ?`).all(projectId, limit) as any[];
}

function rowsByIds(db: DatabaseSync, name: string, projectId: string, wantedIds: readonly string[]): any[] {
  if (!tableExists(db, name) || wantedIds.length === 0) return [];
  const unique = [...new Set(wantedIds.filter(Boolean))];
  const placeholders = unique.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM ${name} WHERE project_id=? AND id IN (${placeholders}) ORDER BY id`)
    .all(projectId, ...unique) as any[];
}

function mergeById(...groups: any[][]): any[] {
  const out = new Map<string, any>();
  for (const group of groups) for (const row of group) if (row?.id) out.set(String(row.id), row);
  return [...out.values()];
}

function compactText(value: unknown, maxChars = 420): string | string[] | null {
  if (value == null || value === '') return null;
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).slice(0, 16);
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean).slice(0, 16);
    if (parsed && typeof parsed === 'object') {
      const text = canonical(parsed);
      return text.length > maxChars ? `${text.slice(0, maxChars)}…[规则摘要]` : text;
    }
  } catch { /* plain text */ }
  return raw.length > maxChars ? `${raw.slice(0, maxChars)}…[规则摘要]` : raw;
}

function recentChapterExcerpt(content: unknown, budget: number): string {
  const text = String(content || '').trim();
  if (text.length <= budget) return text;
  const marker = '…[中段省略]…';
  const headChars = Math.min(96, Math.max(32, Math.floor(budget * 0.2)));
  const tailChars = Math.max(64, budget - headChars - marker.length);
  return `${text.slice(0, headChars)}${marker}${text.slice(-tailChars)}`;
}

export function dependencyContext(
  db: DatabaseSync,
  input: { projectId: string; stage: QualityStage; chapterIndex?: number | null; maxChars?: number },
) {
  const { projectId, stage } = input;
  const chapterIndex = input.chapterIndex ?? null;
  const max = Math.max(4000, Math.min(48000, input.maxChars ?? (['chapter', 'refinement'].includes(stage) ? 24000 : 16000)));

  const current = tableExists(db, 'chapters') && chapterIndex !== null
    ? db.prepare('SELECT * FROM chapters WHERE project_id=? AND chapter_index=? LIMIT 1').get(projectId, chapterIndex) as any
    : null;

  let outline: any = null;
  if (tableExists(db, 'outlines')) {
    if (current?.outline_id) {
      outline = db.prepare('SELECT * FROM outlines WHERE project_id=? AND id=? LIMIT 1').get(projectId, current.outline_id) as any;
    }
    if (!outline && chapterIndex !== null) {
      outline = db.prepare('SELECT * FROM outlines WHERE project_id=? AND level=? AND "order"=? LIMIT 1')
        .get(projectId, 'chapter', chapterIndex) as any;
    }
  }

  const detail = { ...object(outline?.detail_json), ...object(outline?.plan_json) };
  const chapterContract = chapterContractFromOutline(outline, detail);
  const currentText = `${String(current?.content || '')}\n${String(outline?.content || '')}\n${canonical(detail)}\n${canonical(chapterContract || {})}`;

  // The chapter plan is the primary dependency selector. Explicit IDs are never
  // lost because of table size; name-based discovery is a bounded fallback only.
  const involved = new Set(ids(outline?.character_ids));
  ids(detail.character_ids).forEach(id => involved.add(id));
  const explicitCharacterRows = rowsByIds(db, 'characters', projectId, [...involved]);
  const characterCandidates = mergeById(explicitCharacterRows, boundedRows(db, 'characters', projectId, 64));
  for (const c of characterCandidates) if (c.name && currentText.includes(c.name)) involved.add(c.id);

  let selected = rowsByIds(db, 'characters', projectId, [...involved]);
  if (!selected.length && !['chapter', 'refinement'].includes(stage) && tableExists(db, 'characters')) {
    selected = db.prepare("SELECT * FROM characters WHERE project_id=? AND role='protagonist' ORDER BY id LIMIT 8").all(projectId) as any[];
  }

  const hasProfiles = tableExists(db, 'character_extended_profiles');
  const characters = selected.map(c => ({
    ...c,
    ...(hasProfiles ? db.prepare('SELECT * FROM character_extended_profiles WHERE character_id=? LIMIT 1').get(c.id) as any : {}),
    id: c.id,
  }));

  const explicitHints = new Set(ids(outline?.foreshadowing_ids));
  ids(detail.foreshadowing_ids).forEach(id => explicitHints.add(id));
  const hintCandidates = mergeById(
    rowsByIds(db, 'foreshadowings', projectId, [...explicitHints]),
    boundedRows(db, 'foreshadowings', projectId, 64),
  );
  const hints = hintCandidates
    .filter(f => explicitHints.has(f.id) || (['buried', 'active', 'reminder'].includes(f.status) && Number(f.buried_chapter_index || 0) <= (chapterIndex ?? Infinity)))
    .sort((a, b) => Number(explicitHints.has(b.id)) - Number(explicitHints.has(a.id))
      || Number(ids(b.related_character_ids).some(id => involved.has(id))) - Number(ids(a.related_character_ids).some(id => involved.has(id))
      || Number(b.importance || 0) - Number(a.importance || 0)
      || String(a.id).localeCompare(String(b.id)));

  const explicitEventIds = new Set(ids(detail.timeline_event_ids));
  const eventCandidates = mergeById(
    rowsByIds(db, 'timeline_three_line_events', projectId, [...explicitEventIds]),
    boundedRows(db, 'timeline_three_line_events', projectId, 96),
  );
  const eventIds = new Set(eventCandidates
    .filter(e => explicitEventIds.has(e.id) || e.chapter_index === chapterIndex || ids(e.participants_character_ids).some(id => involved.has(id)))
    .map(e => e.id));

  const links = boundedRows(db, 'timeline_causality_links', projectId, 128);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of links) {
      if (eventIds.has(l.target_event_id) && !eventIds.has(l.source_event_id)) {
        eventIds.add(l.source_event_id);
        changed = true;
      }
    }
  }
  const missingLinkedEvents = [...eventIds].filter(id => !eventCandidates.some(e => e.id === id));
  const events = mergeById(eventCandidates, rowsByIds(db, 'timeline_three_line_events', projectId, missingLinkedEvents));
  const timeline = events
    .filter(e => eventIds.has(e.id))
    .sort((a, b) => Number(b.chapter_index === chapterIndex) - Number(a.chapter_index === chapterIndex) || String(a.id).localeCompare(String(b.id)));

  const ruleIds = new Set<string>();
  for (const task of boundedRows(db, 'world_rule_chapter_tasks', projectId, 64)) {
    if (task.chapter_id === current?.id && task.rule_id) ruleIds.add(task.rule_id);
  }
  ids(detail.world_rule_ids).forEach(id => ruleIds.add(id));
  const ruleCandidates = mergeById(
    rowsByIds(db, 'world_rules', projectId, [...ruleIds]),
    boundedRows(db, 'world_rules', projectId, 64),
  );
  const rules = ruleCandidates
    .filter(r => ruleIds.has(r.id) || r.scope === 'full_book'
      || ids(r.related_character_ids).some(id => involved.has(id))
      || ids(r.related_foreshadowing_ids).some(id => explicitHints.has(id))
      || ids(r.related_timeline_event_ids).some(id => eventIds.has(id)))
    .sort((a, b) => Number(ruleIds.has(b.id)) - Number(ruleIds.has(a.id)) || String(a.id).localeCompare(String(b.id)));

  // Existing world_settings remains the persisted world-profile authority. Pull
  // only compact rule-bearing fields forward; broad synopsis/atmosphere stays
  // low priority. This preserves hard world constraints without letting a huge
  // profile crowd out immediate chapter canon.
  const coreWorldSettings = boundedRows(db, 'world_settings', projectId, 4).map(row => ({
    id: row.id,
    name: row.name || undefined,
    era: compactText(row.era, 120),
    rules: compactText(row.rules, 520),
    constraints: compactText(row.constraints, 360),
    social_rules: compactText(row.social_rules, 300),
    special_settings: compactText(row.special_settings, 300),
    rule_system: compactText(row.rule_system_json, 420),
  }));

  const relevantText = currentText + canonical(outline ?? {}) + timeline.map(e => e.location || '').join(' ');
  const explicitLocationIds = ids(detail.location_ids);
  const locationCandidates = mergeById(
    rowsByIds(db, 'map_points', projectId, explicitLocationIds),
    boundedRows(db, 'map_points', projectId, 48),
  );
  const locations = locationCandidates.filter(r => explicitLocationIds.includes(r.id)
    || ids(r.linked_chapter_ids).includes(current?.id)
    || ids(r.linked_character_ids).some(id => involved.has(id))
    || (r.name && relevantText.includes(r.name)));

  const explicitOrganizationIds = ids(detail.organization_ids);
  const organizationCandidates = mergeById(
    rowsByIds(db, 'organizations', projectId, explicitOrganizationIds),
    boundedRows(db, 'organizations', projectId, 48),
  );
  const organizations = organizationCandidates.filter(r => explicitOrganizationIds.includes(r.id) || (r.name && relevantText.includes(r.name)));

  let states: any[] = [];
  if (tableExists(db, 'state_items')) {
    try {
      states = db.prepare("SELECT * FROM state_items WHERE project_id=? AND status='confirmed' ORDER BY updated_at DESC,id LIMIT 64").all(projectId) as any[];
    } catch {
      states = boundedRows(db, 'state_items', projectId, 64).filter(s => s.status === 'confirmed');
    }
    states.sort((a, b) => Number(involved.has(b.target_id)) - Number(involved.has(a.target_id))
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || String(a.id).localeCompare(String(b.id)));
  }

  // Recent body is canon-adjacent evidence and must enter before broad world data.
  // Keep all three immediate predecessors whenever they exist. The excerpt keeps
  // a small opening anchor plus a larger ending tail so names/events introduced
  // at the chapter start are not erased just because the ending is long.
  const recentExcerptChars = Math.max(320, Math.min(1200, Math.floor(max / 10)));
  let recent: any[] = [];
  if (tableExists(db, 'chapters') && chapterIndex !== null) {
    recent = db.prepare(`SELECT id,outline_id,volume_index,chapter_index,title,content,status
      FROM chapters WHERE project_id=? AND chapter_index<? AND LENGTH(TRIM(COALESCE(content,'')))>0
      ORDER BY chapter_index DESC,id LIMIT 3`).all(projectId, chapterIndex) as any[];
    recent = recent.reverse().map(c => ({
      id: c.id,
      outline_id: c.outline_id,
      volume_index: c.volume_index,
      chapter_index: c.chapter_index,
      title: c.title,
      status: c.status,
      content_tail: recentChapterExcerpt(c.content, recentExcerptChars),
    }));
  }

  let nearby: any[] = [];
  if (tableExists(db, 'outlines') && chapterIndex !== null) {
    nearby = db.prepare(`SELECT * FROM outlines WHERE project_id=? AND id<>COALESCE(?, '')
      AND (level<>'chapter' OR "order" BETWEEN ? AND ?) ORDER BY CASE WHEN level='chapter' THEN 0 ELSE 1 END,"order",id LIMIT 12`)
      .all(projectId, outline?.id ?? '', chapterIndex - 1, chapterIndex + 1) as any[];
  }

  const sections: Record<string, any> = {
    meta: { schemaVersion: 3, stage, chapterIndex, selection: 'chapter_contract_then_recent_canon_then_dependencies', truncation: [] },
    chapterContract: [],
    outline: [],
    recentChapters: [],
    characterContracts: [],
    characters: [],
    foreshadowing: [],
    timeline: [],
    causality: [],
    worldRules: [],
    locations: [],
    organizations: [],
    recentState: [],
  };
  const truncation: string[] = [];
  let omitted = 0;
  const prune = (v: any): any => {
    if (Array.isArray(v)) return v.map(prune);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v)
        .filter(([k, x]) => !['created_at', 'updated_at', 'project_id'].includes(k) && x !== null && x !== '')
        .map(([k, x]) => [k, prune(x)]));
    }
    if (typeof v === 'string' && v.length > 1200) {
      omitted += 1;
      return `${v.slice(0, 1200)}…[字段截断]`;
    }
    return v;
  };
  const add = (key: string, items: any[]) => {
    for (const item of items) {
      sections[key].push(key === 'characterContracts' ? item : prune(item));
      if (canonical(sections).length > max - 300) {
        sections[key].pop();
        omitted += 1;
        if (!truncation.includes(key)) truncation.push(key);
      }
    }
  };

  // One persisted outline, one executable contract. Drafting and review compile
  // the same object; no parallel ChapterContract record is introduced.
  add('chapterContract', chapterContract ? [chapterContract] : []);
  add('outline', outline ? [outline] : []);
  add('recentChapters', recent);
  add('characterContracts', characters.map(compileCharacterContract));
  add('characters', characters.map(c => ({ id: c.id, name: c.name, speech_style: c.speech_style, forbidden_words: c.forbidden_words })));
  add('foreshadowing', hints.filter(h => explicitHints.has(h.id)));
  add('timeline', timeline);
  add('causality', links.filter(l => eventIds.has(l.source_event_id) && eventIds.has(l.target_event_id)));
  add('worldRules', [...rules, ...coreWorldSettings]);
  // Active continuity evidence and confirmed state outrank broad background.
  add('foreshadowing', hints.filter(h => !explicitHints.has(h.id)));
  add('recentState', states);
  add('locations', locations);
  add('organizations', organizations);
  add('outline', nearby);

  sections.meta.truncation = omitted ? [`${omitted} items/fields omitted or clipped; budget=${max}`, ...truncation] : [];
  const snapshot = canonical(sections);
  return {
    schemaVersion: 3 as const,
    version: createHash('sha256').update(snapshot).digest('hex'),
    snapshot,
    size: snapshot.length,
    truncated: omitted > 0,
    truncation: sections.meta.truncation as string[],
    sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, Array.isArray(v) ? v.length : v ? 1 : 0])),
  };
}
