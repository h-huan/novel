import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { QualityStage } from '../writing-quality/quality-issue';
import { canonical, compileCharacterContract, object } from '../writing-quality/character-contract';
function ids(v: any): string[] { try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch { return []; } }
export function dependencyContext(db: DatabaseSync, input: { projectId: string; stage: QualityStage; chapterIndex?: number | null; maxChars?: number }) {
  const { projectId, stage } = input; const chapterIndex = input.chapterIndex ?? null;
  const max = Math.max(4000, Math.min(48000, input.maxChars ?? (['chapter','refinement'].includes(stage) ? 24000 : 16000)));
  const rows = (name: string): any[] => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
    ? db.prepare(`SELECT * FROM ${name} WHERE project_id=? ORDER BY id`).all(projectId) : [];
  const chapters = rows('chapters'); const current = chapters.find(c => c.chapter_index === chapterIndex);
  const outlines = rows('outlines');
  const outline = outlines.find(o => o.id === current?.outline_id) || outlines.find(o => o.level === 'chapter' && o.order === chapterIndex);
  const detail = { ...object(outline?.detail_json), ...object(outline?.plan_json) };
  const involved = new Set(ids(outline?.character_ids)); const characterRows = rows('characters');
  const currentText = String(current?.content || '') + String(outline?.content || '');
  for (const c of characterRows) if (c.name && currentText.includes(c.name)) involved.add(c.id);
  const selected = characterRows.filter(c => involved.has(c.id));
  if (!selected.length && !['chapter','refinement'].includes(stage)) selected.push(...characterRows.filter(c => c.role === 'protagonist'));
  const hasProfiles = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='character_extended_profiles'").get();
  const characters = selected.map(c => ({ ...c, ...(hasProfiles ? db.prepare('SELECT * FROM character_extended_profiles WHERE character_id=?').get(c.id) : {}), id: c.id }));
  const explicitHints = new Set(ids(outline?.foreshadowing_ids));
  const hints = rows('foreshadowings').filter(f => explicitHints.has(f.id) || (['buried','active','reminder'].includes(f.status) && Number(f.buried_chapter_index || 0) <= (chapterIndex ?? Infinity)))
    .sort((a,b) => Number(explicitHints.has(b.id)) - Number(explicitHints.has(a.id)) || Number(ids(b.related_character_ids).some(id => involved.has(id))) - Number(ids(a.related_character_ids).some(id => involved.has(id))) || Number(b.importance || 0) - Number(a.importance || 0) || a.id.localeCompare(b.id));
  const events = rows('timeline_three_line_events');
  const eventIds = new Set(events.filter(e => e.chapter_index === chapterIndex || ids(e.participants_character_ids).some(id => involved.has(id))).map(e => e.id));
  ids(detail.timeline_event_ids).forEach(id => eventIds.add(id));
  const links = rows('timeline_causality_links'); let changed = true;
  while (changed) { changed = false; for (const l of links) if (eventIds.has(l.target_event_id) && !eventIds.has(l.source_event_id)) { eventIds.add(l.source_event_id); changed = true; } }
  const timeline = events.filter(e => eventIds.has(e.id)).sort((a,b) => Number(b.chapter_index === chapterIndex) - Number(a.chapter_index === chapterIndex) || a.id.localeCompare(b.id));
  const ruleIds = new Set(rows('world_rule_chapter_tasks').filter(t => t.chapter_id === current?.id).map(t => t.rule_id));
  ids(detail.world_rule_ids).forEach(id => ruleIds.add(id));
  const rules = rows('world_rules').filter(r => ruleIds.has(r.id) || r.scope === 'full_book' || ids(r.related_character_ids).some(id => involved.has(id)) || ids(r.related_foreshadowing_ids).some(id => explicitHints.has(id)) || ids(r.related_timeline_event_ids).some(id => eventIds.has(id)))
    .sort((a,b) => Number(ruleIds.has(b.id)) - Number(ruleIds.has(a.id)) || a.id.localeCompare(b.id));
  const relevantText = currentText + canonical(outline ?? {}) + timeline.map(e => e.location || '').join(' ');
  const locations = rows('map_points').filter(r => ids(detail.location_ids).includes(r.id) || ids(r.linked_chapter_ids).includes(current?.id) || ids(r.linked_character_ids).some(id => involved.has(id)) || (r.name && relevantText.includes(r.name)));
  const organizations = rows('organizations').filter(r => ids(detail.organization_ids).includes(r.id) || (r.name && relevantText.includes(r.name)));
  const states = rows('state_items').filter(s => s.status === 'confirmed').sort((a,b) => Number(involved.has(b.target_id)) - Number(involved.has(a.target_id)) || String(b.updated_at).localeCompare(String(a.updated_at)) || a.id.localeCompare(b.id));
  const recent = chapters.filter(c => chapterIndex !== null && c.chapter_index < chapterIndex && c.content).sort((a,b) => b.chapter_index - a.chapter_index || a.id.localeCompare(b.id)).slice(0,3);
  const nearby = outlines.filter(o => o.id !== outline?.id && (o.level !== 'chapter' || Math.abs(o.order - (chapterIndex ?? 0)) <= 1)).slice(0,16);
  const sections: Record<string, any> = { meta: { schemaVersion: 2, stage, chapterIndex, selection: 'dependencies_before_recency', truncation: [] }, characterContracts: [], characters: [], outline: [], worldRules: [], foreshadowing: [], timeline: [], causality: [], locations: [], organizations: [], recentState: [], recentChapters: [] };
  const truncation: string[] = []; let omitted = 0;
  const prune = (v: any): any => {
    if (Array.isArray(v)) return v.map(prune);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k,x]) => !['created_at','updated_at','project_id'].includes(k) && x !== null && x !== '').map(([k,x]) => [k,prune(x)]));
    if (typeof v === 'string' && v.length > 1200) { omitted++; return v.slice(0,1200) + '…[字段截断]'; } return v;
  };
  const add = (key: string, items: any[]) => { for (const item of items) { sections[key].push(key === 'characterContracts' ? item : prune(item)); if (canonical(sections).length > max - 300) { sections[key].pop(); omitted++; if (!truncation.includes(key)) truncation.push(key); } } };
  add('outline', outline ? [outline] : []); add('characterContracts', characters.map(compileCharacterContract));
  add('foreshadowing', hints.filter(h => explicitHints.has(h.id)));
  add('worldRules', rules); add('worldRules', rows('world_settings')); add('foreshadowing', hints.filter(h => !explicitHints.has(h.id))); add('timeline', timeline);
  add('causality', links.filter(l => eventIds.has(l.source_event_id) && eventIds.has(l.target_event_id)));
  add('locations', locations); add('organizations', organizations); add('recentState', states);
  add('characters', characters.map(c => ({ id: c.id, name: c.name, speech_style: c.speech_style, forbidden_words: c.forbidden_words })));
  add('outline', nearby); add('recentChapters', recent);
  sections.meta.truncation = omitted ? [`${omitted} items/fields omitted or clipped; budget=${max}`, ...truncation] : [];
  const snapshot = canonical(sections);
  return { schemaVersion: 2 as const, version: createHash('sha256').update(snapshot).digest('hex'), snapshot, size: snapshot.length, truncated: omitted > 0,
    truncation: sections.meta.truncation as string[], sections: Object.fromEntries(Object.entries(sections).map(([k,v]) => [k, Array.isArray(v) ? v.length : v ? 1 : 0])) };
}
