import { createHash } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { QualityStage } from '../writing-quality/quality-issue';

export interface CompiledContext {
  schemaVersion: 1;
  version: string;
  snapshot: string;
  size: number;
  truncated: boolean;
  sections: Record<string, number>;
}

const VOICE_FIELDS = [
  'speech_style', 'catchphrase', 'common_words', 'forbidden_words', 'tone_to_different_people',
  'emotion_outburst_style', 'danger_reaction', 'betrayal_reaction', 'weak_person_reaction',
  'strong_person_reaction', 'must_obey_rules', 'forbidden_writing',
] as const;

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
}

function parseIds(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

function clip(value: unknown, max = 1200): unknown {
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}…` : value;
  if (Array.isArray(value)) return value.map(item => clip(item, max));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null && item !== '')
      .map(([key, item]) => [key, clip(item, max)]),
  );
  return value;
}

function table(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function all(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): Record<string, unknown>[] {
  try { return db.prepare(sql).all(...params) as Record<string, unknown>[]; } catch { return []; }
}

function fit(source: Record<string, unknown>, maxChars: number): { snapshot: string; truncated: boolean } {
  let value = source;
  let snapshot = stable(value);
  if (snapshot.length <= maxChars) return { snapshot, truncated: false };
  value = structuredClone(source);
  const order = ['recentChapters', 'timeline', 'foreshadowing', 'recentState', 'outline'];
  for (const key of order) {
    const rows = value[key];
    if (!Array.isArray(rows)) continue;
    while (rows.length > 1 && stable(value).length > maxChars) rows.pop();
  }
  snapshot = stable(value);
  if (snapshot.length > maxChars) {
    value = clip(value, 300) as Record<string, unknown>;
    snapshot = stable(value);
  }
  for (const key of ['recentChapters', 'timeline', 'foreshadowing', 'recentState', 'outline']) {
    if (snapshot.length <= maxChars) break;
    value[key] = [];
    snapshot = stable(value);
  }
  if (snapshot.length > maxChars) {
    value.currentChapter = clip(value.currentChapter, 200);
    snapshot = stable(value);
  }
  // With an unusually large character/world schema, retain valid JSON and the
  // identity/rule fields rather than returning a cut-off, unparsable snapshot.
  if (snapshot.length > maxChars) {
    value.characters = (value.characters as Record<string, unknown>[] || []).map(row => Object.fromEntries(
      Object.entries(row).filter(([key]) => ['id', 'name', 'role', ...VOICE_FIELDS].includes(key as any)),
    ));
    snapshot = stable(value);
  }
  if (snapshot.length > maxChars) {
    value.currentChapter = null;
    value.characters = (value.characters as unknown[] || []).slice(0, 4);
    snapshot = stable(value);
  }
  return { snapshot, truncated: true };
}

/** Selects only stage-relevant, current canonical facts and produces a stable version. */
export function compileContext(db: DatabaseSync, input: {
  projectId: string;
  stage: QualityStage;
  chapterIndex?: number | null;
  maxChars?: number;
}): CompiledContext {
  const { projectId, stage } = input;
  const chapterIndex = Number.isInteger(input.chapterIndex) ? Number(input.chapterIndex) : null;
  const maxChars = Math.max(4000, Math.min(48000, input.maxChars ?? (stage === 'chapter' || stage === 'refinement' ? 24000 : 16000)));
  const currentChapter = chapterIndex !== null && table(db, 'chapters')
    ? all(db, 'SELECT id,outline_id,volume_index,chapter_index,title,content,status FROM chapters WHERE project_id=? AND chapter_index=? ORDER BY volume_index,id LIMIT 1', projectId, chapterIndex)[0]
    : undefined;
  const volumeIndex = Number(currentChapter?.volume_index ?? 0) || null;
  const outline = table(db, 'outlines')
    ? all(db, `SELECT id,level,parent_id,"order",title,content,chapter_function,goal_arc,target_words,
        character_ids,foreshadowing_ids,plot_points,ending_hook,emotion_tone,detail_json,plan_json
        FROM outlines WHERE project_id=? AND (? IS NULL OR level!='chapter' OR "order" BETWEEN ? AND ?)
        ORDER BY CASE level WHEN 'book' THEN 0 WHEN 'volume' THEN 1 ELSE 2 END,"order",id LIMIT 16`,
      projectId, chapterIndex, Math.max(0, (chapterIndex ?? 1) - 1), (chapterIndex ?? 1) + 1)
    : [];
  const relevantIds = new Set<string>(outline.flatMap(row => parseIds(row.character_ids)));
  const characterRows = table(db, 'characters')
    ? all(db, table(db, 'character_extended_profiles')
      ? `SELECT c.id,c.name,c.role,c.personality_traits,c.goals,c.weaknesses,c.relationships,c.profile_json,
          p.${VOICE_FIELDS.join(',p.')}
          FROM characters c LEFT JOIN character_extended_profiles p ON p.character_id=c.id
          WHERE c.project_id=? ORDER BY CASE WHEN c.role='protagonist' THEN 0 ELSE 1 END,c.id LIMIT 40`
      : `SELECT c.* FROM characters c WHERE c.project_id=? ORDER BY c.id LIMIT 40`, projectId)
    : [];
  const currentText = String(currentChapter?.content || '');
  const characters = characterRows.filter((row, index) => relevantIds.has(String(row.id))
    || currentText.includes(String(row.name || '')) || index < 8).slice(0, 12);
  const worldRules = table(db, 'world_settings')
    ? all(db, `SELECT id,name,era,rules,constraints,social_rules,special_settings,rule_system_json,
        atmosphere,story_premise FROM world_settings WHERE project_id=? ORDER BY id LIMIT 6`, projectId)
    : [];
  const recentChapters = chapterIndex !== null && table(db, 'chapters')
    ? all(db, `SELECT id,volume_index,chapter_index,title,content,status FROM chapters
        WHERE project_id=? AND chapter_index<? AND content!='' ORDER BY chapter_index DESC,id DESC LIMIT 3`, projectId, chapterIndex)
    : [];
  const recentState = table(db, 'state_items')
    ? all(db, `SELECT target_type,target_id,target_label,state_key,title,summary,content,authority,confidence,updated_at
        FROM state_items WHERE project_id=? AND status='confirmed' ORDER BY updated_at DESC,id DESC LIMIT 20`, projectId)
    : [];
  const foreshadowing = table(db, 'foreshadowings') && chapterIndex !== null
    ? all(db, `SELECT id,content,status,type,importance,buried_chapter_index,planned_recovery_chapter_index,
        recovery_condition,payoff_description,related_character_ids,risk_level FROM foreshadowings
        WHERE project_id=? AND status IN ('buried','active','reminder')
        AND (buried_chapter_index<=? OR planned_recovery_chapter_index BETWEEN ? AND ?)
        ORDER BY importance DESC,planned_recovery_chapter_index,id LIMIT 12`,
      projectId, chapterIndex, chapterIndex - 2, chapterIndex + 3)
    : [];
  const timeline = table(db, 'timeline_three_line_events') && chapterIndex !== null
    ? all(db, `SELECT id,title,summary,line_type,volume_index,chapter_index,story_time_text,story_time_order,
        narrative_order,causality_order,location,participants_character_ids,reader_known_state,
        character_known_state,status,risk_level,risk_reason FROM timeline_three_line_events
        WHERE project_id=? AND chapter_index BETWEEN ? AND ? ORDER BY chapter_index,narrative_order,id LIMIT 16`,
      projectId, chapterIndex - 2, chapterIndex + 2)
    : [];
  const sections: Record<string, unknown> = {
    meta: { schemaVersion: 1, stage, chapterIndex, volumeIndex },
    worldRules: ['world', 'character', 'outline', 'chapter', 'refinement'].includes(stage) ? worldRules : [],
    outline: ['outline', 'chapter', 'refinement'].includes(stage) ? outline : [],
    currentChapter: ['chapter', 'refinement'].includes(stage) ? currentChapter ?? null : null,
    characters: ['character', 'outline', 'chapter', 'refinement'].includes(stage) ? characters : [],
    recentState: ['outline', 'chapter', 'refinement'].includes(stage) ? recentState : [],
    foreshadowing: ['chapter', 'refinement'].includes(stage) ? foreshadowing : [],
    timeline: ['outline', 'chapter', 'refinement'].includes(stage) ? timeline : [],
    recentChapters: ['chapter', 'refinement'].includes(stage) ? recentChapters : [],
  };
  const normalized = clip(sections) as Record<string, unknown>;
  const fitted = fit(normalized, maxChars);
  return {
    schemaVersion: 1,
    version: createHash('sha256').update(fitted.snapshot).digest('hex'),
    snapshot: fitted.snapshot,
    size: fitted.snapshot.length,
    truncated: fitted.truncated,
    sections: Object.fromEntries(Object.entries(normalized).map(([key, value]) => [key, Array.isArray(value) ? value.length : value ? 1 : 0])),
  };
}
