import { DatabaseSync } from 'node:sqlite';

const hasTable = (db: DatabaseSync, table: string): boolean => Boolean(
  db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table),
);

const hasColumn = (db: DatabaseSync, table: string, column: string): boolean =>
  hasTable(db, table) && (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(row => row.name === column);

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw || raw === '[object Object]') return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const list = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean);
  if (typeof value !== 'string') return [];
  const raw = value.trim();
  if (!raw || raw === '[object Object]') return [];
  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) return list(parsed);
  return raw.split(/\r?\n|[；;]/).map(item => item.replace(/^[-*•\d.、\s]+/, '').trim()).filter(Boolean);
};

const record = (value: unknown): Record<string, any> => {
  const parsed = parseJson(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
};

const scenes = (value: unknown): Array<{ title?: string; summary: string; goal?: string; conflict?: string; outcome?: string; location?: string; characterIds?: string[] }> => {
  const parsed = typeof value === 'string' ? parseJson(value) : value;
  const source = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as any).scenes ?? [] : (typeof value === 'string' ? list(value) : []));
  if (!Array.isArray(source)) return [];
  return source.map(item => {
    if (typeof item === 'string') return { summary: item.trim() };
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const summary = text(row.summary) || text(row.content) || text(row.description) || text(row.title);
    if (!summary) return null;
    const result: any = { summary };
    for (const key of ['title', 'goal', 'conflict', 'outcome', 'location']) if (text(row[key])) result[key] = text(row[key]);
    if (Array.isArray(row.characterIds)) result.characterIds = list(row.characterIds);
    return result;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const actions = (value: unknown): Array<{ character: string; action: string; motivation?: string; result?: string }> => {
  const parsed = typeof value === 'string' ? parseJson(value) : value;
  const source = Array.isArray(parsed) ? parsed : (typeof value === 'string' ? list(value) : []);
  return source.map(item => {
    if (typeof item === 'string') return { character: '', action: item.trim() };
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const action = text(row.action) || text(row.content) || text(row.summary) || text(row.description);
    if (!action) return null;
    return {
      character: text(row.character) || text(row.characterName) || text(row.targetName),
      action,
      ...(text(row.motivation) ? { motivation: text(row.motivation) } : {}),
      ...(text(row.result) ? { result: text(row.result) } : {}),
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
};

const LEGACY_LABELS: Record<string, string> = {
  '核心内容': 'core',
  '主要场景': 'scenes',
  '人物行动': 'characterActions',
  '冲突设计': 'conflict',
  '爽点设置': 'highlights',
  '爽点/记忆点': 'highlights',
  '伏笔设置': 'foreshadowing',
  '伏笔回收': 'foreshadowingRecoveries',
  '人物状态变化': 'characterStateChanges',
  '下章钩子': 'hook',
  '结尾设置': 'hook',
  '情绪基调': 'mood',
  '反转点': 'reversalPoint',
  '热血镜头': 'hotScenes',
  '热血/高光': 'hotScenes',
  '高光镜头': 'hotScenes',
  '目标字数': 'targetWords',
};

const parseLegacyLabeledContent = (content: unknown): { fields: Record<string, string>; matched: boolean } => {
  const raw = text(content);
  if (!raw) return { fields: {}, matched: false };
  const labels = Object.keys(LEGACY_LABELS).sort((a, b) => b.length - a.length).map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(?:^|\\n)(${labels})[：:]\\s*([\\s\\S]*?)(?=\\n(?:${labels})[：:]|$)`, 'g');
  const fields: Record<string, string> = {};
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = regex.exec(raw))) {
    fields[LEGACY_LABELS[match[1]]] = match[2].trim();
    count += 1;
  }
  return { fields, matched: count >= 2 };
};

const backfillOutlinePlans = (db: DatabaseSync): void => {
  if (!hasTable(db, 'outlines')) return;
  if (!hasColumn(db, 'outlines', 'plan_json')) db.exec(`ALTER TABLE outlines ADD COLUMN plan_json TEXT DEFAULT '{}'`);
  const rows = db.prepare(`SELECT * FROM outlines WHERE level='chapter'`).all() as any[];
  const update = db.prepare(`UPDATE outlines SET content=?, plan_json=?, updated_at=COALESCE(updated_at, datetime('now')) WHERE id=?`);
  for (const row of rows) {
    const existing = record(row.plan_json);
    const sceneData = record(row.scenes);
    const legacy = parseLegacyLabeledContent(row.content);
    const get = (key: string, ...fallbacks: unknown[]) => {
      if (existing[key] !== undefined && existing[key] !== null && existing[key] !== '') return existing[key];
      if (legacy.fields[key]) return legacy.fields[key];
      for (const value of fallbacks) if (value !== undefined && value !== null && value !== '') return value;
      return undefined;
    };
    const core = text(get('core', sceneData.core, sceneData.summary, legacy.matched ? '' : row.content)) || (legacy.matched ? '' : text(row.content));
    const target = Number(get('targetWords', row.target_words));
    const canonical = {
      core,
      scenes: scenes(get('scenes', sceneData.scenes, row.scenes)),
      characterActions: actions(get('characterActions', sceneData.characterActions)),
      conflict: (() => { const value = get('conflict', sceneData.conflict, sceneData.conflicts, row.conflict_design); return Array.isArray(value) ? list(value).join('；') : text(value); })(),
      highlights: list(get('highlights', sceneData.highlights, sceneData.highlight, row.highlight_points)),
      foreshadowing: list(get('foreshadowing', sceneData.foreshadowing, sceneData.foreshadowingSet)),
      foreshadowingRecoveries: list(get('foreshadowingRecoveries', sceneData.foreshadowingRecover, sceneData.foreshadowingRecovery)),
      characterStateChanges: list(get('characterStateChanges', sceneData.characterStates)),
      hook: text(get('hook', sceneData.hook, row.ending_setup)),
      mood: text(get('mood', sceneData.mood, sceneData.emotionalTone)),
      ...(text(get('reversalPoint', sceneData.reversalPoint)) ? { reversalPoint: text(get('reversalPoint', sceneData.reversalPoint)) } : {}),
      hotScenes: list(get('hotScenes', sceneData.hotScenes, sceneData.hot_scenes, row.hot_scenes)),
      ...(Number.isFinite(target) && target > 0 ? { targetWords: target } : {}),
    };
    update.run(core, JSON.stringify(canonical), row.id);
  }
};

const normalizeProfileLists = (db: DatabaseSync): void => {
  if (hasTable(db, 'world_system_profiles')) {
    for (const field of ['locations', 'rules', 'factions', 'hierarchy_rules']) {
      if (!hasColumn(db, 'world_system_profiles', field)) continue;
      const rows = db.prepare(`SELECT id, ${field} AS value FROM world_system_profiles`).all() as any[];
      const update = db.prepare(`UPDATE world_system_profiles SET ${field}=? WHERE id=?`);
      for (const row of rows) update.run(JSON.stringify(list(row.value)), row.id);
    }
    if (hasColumn(db, 'world_system_profiles', 'custom_settings')) {
      const rows = db.prepare(`SELECT id, custom_settings AS value FROM world_system_profiles`).all() as any[];
      const update = db.prepare(`UPDATE world_system_profiles SET custom_settings=? WHERE id=?`);
      for (const row of rows) {
        const parsed = parseJson(row.value);
        const raw = text(row.value);
        let items: Array<{ key: string; value: string }> = [];
        if (Array.isArray(parsed)) {
          items = parsed.map((item: any) => ({ key: text(item?.key), value: text(item?.value ?? item?.val) })).filter((item: any) => item.key || item.value);
        } else if (parsed && typeof parsed === 'object') {
          items = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({ key: key.trim(), value: text(value) })).filter(item => item.key || item.value);
        } else if (raw && raw !== '[object Object]') {
          items = raw.split(/\r?\n/).map((line, index) => {
            const match = line.match(/^\s*([^：:]+)[：:]\s*(.+)$/);
            return match ? { key: match[1].trim(), value: match[2].trim() } : { key: index === 0 ? '补充设定' : `补充设定${index + 1}`, value: line.trim() };
          }).filter(item => item.value);
        }
        update.run(JSON.stringify(items), row.id);
      }
    }
  }

  if (hasTable(db, 'character_extended_profiles')) {
    for (const field of ['personality_traits', 'abilities_skills', 'relationships', 'goals_motivation', 'weaknesses_fears']) {
      if (!hasColumn(db, 'character_extended_profiles', field)) continue;
      const rows = db.prepare(`SELECT id, ${field} AS value FROM character_extended_profiles`).all() as any[];
      const update = db.prepare(`UPDATE character_extended_profiles SET ${field}=? WHERE id=?`);
      for (const row of rows) update.run(JSON.stringify(list(row.value)), row.id);
    }
  }
};

export function up(db: DatabaseSync): void {
  db.exec('BEGIN');
  try {
    backfillOutlinePlans(db);
    normalizeProfileLists(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function down(_db: DatabaseSync): void {
  // Data normalization is intentionally not reversed. Reverting would re-create
  // ambiguous mixed-format values and can lose information.
}

export default { up, down };
