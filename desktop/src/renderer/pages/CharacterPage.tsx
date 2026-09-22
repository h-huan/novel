/**
 * CharacterPage - 角色层级、状态时间线与手动微调
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { parseJsonToReadable } from '../lib/textList';
import { useCharacterStore } from '../stores/characterStore';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';
import { clampSidebar } from '../components/common/LayoutKit';
import { SectionHeading, FieldList } from '../components/common/ListBlocks';
import { ChangeHistoryPanel } from '../components/character/ChangeHistoryPanel';
import { normalizeCharacterRole } from '../lib/characterRole';

type RoleType = 'protagonist' | 'major' | 'supporting' | 'minor';

interface CharacterView {
  id: string;
  projectId?: string;
  name: string;
  identity: string;
  age: number;
  gender: string;
  appearance: string;
  background: string;
  personality: any;
  personalityText: string;
  abilities: Record<string, any>;
  relationships: any[];
  arc: any;
  dialogueStyle: string;
  role: RoleType;
  tags: string[];
  isPov?: boolean;
}

interface DraftState {
  name: string;
  identity: string;
  age: number;
  gender: string;
  role: RoleType;
  appearance: string;
  background: string;
  personalityText: string;
  coreTraits: string;
  contradiction: string;
  dialogueStyle: string;
  shortTermGoal: string;
  longTermGoal: string;
  fear: string;
  arcFrom: string;
  arcTo: string;
  arcDescription: string;
}

type ProfileFieldConfig = { key: string; label: string; hint: string; multiline?: boolean };
type ProfileSectionConfig = { title: string; description: string; fields: ProfileFieldConfig[] };
const profileFields = (keys: string[], labels: string[], hints: string[]): ProfileFieldConfig[] => keys.map((key, index) => ({ key, label: labels[index], hint: hints[index], multiline: true }));
// 对齐外部文档《人物模板》14 项（姓名在主表，此处 13 项）
const PROFILE_SECTION_GROUPS: ProfileSectionConfig[] = [
  { title: '基本信息', description: '别名/称号、身份职业、阵营立场与角色类型，是角色定位的底图。', fields: profileFields(['alias_title','identity_occupation','faction_stance','role_type'], ['别名 / 称号','身份 / 职业','阵营 / 立场','角色类型（主角/反派/配角/龙套）'], ['其他称呼或代号','具体职业与社会身份','所属阵营与立场倾向','在故事中的角色定位']) },
  { title: '外貌与性格', description: '可落笔的外貌细节与稳定性格，避免空话。', fields: profileFields(['appearance','personality_traits'], ['外貌特征','性格特点'], ['一眼可识别的外貌细节，而非套话','稳定的性格倾向与反差']) },
  { title: '能力与背景', description: '能力/技能与背景故事，提供行动资本与动因。', fields: profileFields(['abilities_skills','backstory'], ['能力 / 技能','背景故事'], ['可使用的核心能力与技能','影响当下选择的旧事，写成场景而非履历']) },
  { title: '关系与目标', description: '人物关系与目标/动机，决定角色为何行动。', fields: profileFields(['relationships','goals_motivation'], ['人物关系','目标 / 动机'], ['与谁的关系及性质','当前想要什么、为什么想要']) },
  { title: '说话风格与弱点', description: '口头禅/说话风格、弱点/恐惧，是冲突与人物质感的来源。', fields: profileFields(['catchphrase_speech_style','weaknesses_fears'], ['说话风格','弱点 / 恐惧'], ['惯用语、口头禅、语气','被攻击或被利用的地方']) },
];

const ROLE_META: Record<RoleType, { label: string; hint: string; color: string }> = {
  protagonist: { label: '全书贯穿', hint: '跨卷成长，状态、关系和伏笔长期跟踪', color: 'var(--color-accent)' },
  major: { label: '卷级核心', hint: '服务一卷或一条主线，影响大纲和势力关系', color: 'var(--color-info-light)' },
  supporting: { label: '阶段辅助', hint: '出场几十章或一个阶段，推动局部冲突', color: 'var(--color-success)' },
  minor: { label: '短线功能', hint: '服务几章内的事件，避免过度膨胀', color: 'var(--color-warning)' },
};

const STATUS_DIMENSIONS = [
  ['injury', '伤势'],
  ['mood', '情绪'],
  ['fatigue', '疲劳'],
  ['loyalty', '忠诚'],
  ['wealth', '财富'],
  ['reputation', '声望'],
  ['power', '权力'],
  ['relationship', '人脉'],
  ['debt', '债务'],
  ['promise', '承诺'],
  ['location', '位置'],
  ['time', '时间'],
  ['goal', '目标'],
  ['ally', '盟友'],
  ['enemy', '敌人'],
  ['secret', '秘密'],
  ['skill', '技能'],
  ['item', '道具'],
  ['limit', '限制'],
  ['buff', '增益'],
  ['debuff', '减益'],
  ['allyPower', '势力'],
  ['hidden', '隐藏信息'],
  ['arc', '弧光阶段'],
] as const;

function apiPayload<T = any>(res: any): T {
  return (res?.data?.data ?? res?.data ?? res ?? {}) as T;
}

function parseJsonSafe(value: any, fallback: any) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * 兼容存量角色数据：personality 可能是 JSON 字符串、纯文本描述或已结构化对象。
 * 纯文本不会被丢弃——原文归入 summary，同时尝试提取核心特质与矛盾句。
 */
function coercePersonality(raw: any): Record<string, any> {
  if (raw === null || raw === undefined || raw === '') return {};
  if (typeof raw === 'object') {
    // 对象只有 summary 但没有 coreTraits/contradiction 时，把 summary 当纯文本重新解析
    if (raw.summary && !raw.coreTraits && !raw.contradiction && !raw.traits) {
      const parsed = coercePersonality(raw.summary);
      return { ...raw, ...parsed };
    }
    return raw;
  }
  if (typeof raw !== 'string') return {};
  const text = raw.trim();
  if (!text) return {};
  // 1) 合法 JSON 字符串
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* 非 JSON，继续降级 */ }
  // 2) key: value 多行格式（每行一个字段）
  const lineObj: Record<string, string> = {};
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const kvLines = lines.filter(l => /^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*\s*[:：]/.test(l));
  if (kvLines.length > 0 && kvLines.length >= Math.ceil(lines.length / 2)) {
    // 中文键名 → 英文键名映射，确保 createDraft 能取到对应字段
    const keyMap: Record<string, string> = {
      '矛盾': 'contradiction', '冲突': 'contradiction', '缺陷': 'flaw', '弱点': 'flaw',
      '核心特质': 'coreTraits', '特质': 'coreTraits', '性格': 'coreTraits', '特点': 'coreTraits',
      '摘要': 'summary', '简介': 'summary', '描述': 'summary',
      '目标': 'goal', '欲望': 'desire', '恐惧': 'fears', '害怕': 'fears',
      '口头禅': 'catchphrase', '别名': 'aliasTitle', '称号': 'aliasTitle',
    };
    for (const line of kvLines) {
      const m = line.match(/^([A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*)\s*[:：]\s*(.+)$/);
      if (m) {
        const rawKey = m[1].trim();
        const engKey = keyMap[rawKey] || rawKey;
        lineObj[engKey] = m[2].trim();
      }
    }
    if (Object.keys(lineObj).length > 0) return lineObj;
  }
  // 3) 纯文本：原文归入 summary，按标点切分提取核心特质与矛盾句
  const sentences = text.split(/[。！？!?；;\n]+/).map(s => s.trim()).filter(Boolean);
  const contradictionKeywords = ['但', '却', '然而', '矛盾', '偏偏', '反而', '虽然', '可是', '不过', '另一面', '另一方面'];
  const contradiction = sentences.find(s => contradictionKeywords.some(k => s.includes(k))) || '';
  const traitSentences = sentences.filter(s => !contradictionKeywords.some(k => s.includes(k)));
  const coreTraits = traitSentences.slice(0, 3);
  return {
    summary: text,
    coreTraits,
    contradiction,
  };
}

function textOf(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return parseJsonToReadable(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n');
  if (typeof value === 'object') return parseJsonToReadable(value);
  return String(value);
}

type ProfileRelationship = {
  targetName?: string;
  characterName?: string;
  name?: string;
  type?: string;
  description?: string;
  future?: string;
};

/** Decode the legacy JSON string used by the profile API without making an
 * unreadable JSON dump the fallback for the reading view. */
function profileRelationships(value: unknown): ProfileRelationship[] | null {
  const parsed = parseJsonSafe(value, null);
  if (!Array.isArray(parsed)) return null;
  const rows = parsed.filter(item => item && typeof item === 'object') as ProfileRelationship[];
  return rows.length ? rows : null;
}

function normalizeCharacter(raw: any): CharacterView {
  let personality = coercePersonality(raw.personality);
  if (typeof personality !== 'object' || personality === null) personality = {};
  let abilities = parseJsonSafe(raw.abilities, {});
  if (typeof abilities !== 'object' || abilities === null) abilities = {};
  const relationships = parseJsonSafe(raw.relationships, []);
  const arc = parseJsonSafe(raw.arc, {});
  const tags = parseJsonSafe(raw.tags, []);
  // 兜底：角色生成时 tags 与 growthTags 合并存储在 keywords 列
  const keywords = parseJsonSafe(raw.keywords, []);
  const resolvedTags = Array.isArray(tags) && tags.length > 0 ? tags : (Array.isArray(keywords) ? keywords : []);

  return {
    id: raw.id,
    projectId: raw.projectId,
    name: raw.name || '未命名角色',
    identity: raw.identity || '',
    age: raw.age || 0,
    gender: raw.gender || '',
    appearance: raw.appearance || '',
    background: raw.background || '',
    personality,
    personalityText: textOf(personality),
    abilities: abilities || {},
    relationships: Array.isArray(relationships) ? relationships : [],
    arc,
    dialogueStyle: raw.dialogueStyle || '',
    role: normalizeCharacterRole(raw.role),
    tags: Array.isArray(resolvedTags) ? resolvedTags : [],
    isPov: !!raw.isPovCharacter || !!raw.isPov,
  };
}

function createDraft(character: CharacterView): DraftState {
  const personality = character.personality || {};
  const abilities = character.abilities || {};
  const arc = Array.isArray(character.arc) ? character.arc[0] || {} : character.arc || {};
  return {
    name: character.name,
    identity: character.identity,
    age: character.age,
    gender: character.gender,
    role: character.role,
    appearance: character.appearance,
    background: character.background,
    personalityText: character.personalityText,
    coreTraits: textOf(personality.coreTraits || personality.traits || personality.summary || ''),
    contradiction: textOf(personality.contradiction || personality.conflict || personality.flaw || ''),
    dialogueStyle: character.dialogueStyle,
    shortTermGoal: textOf(abilities.shortTermGoal || abilities.goal || ''),
    longTermGoal: textOf(abilities.longTermGoal || abilities.trueGoal || ''),
    fear: textOf(abilities.fears || abilities.fear || ''),
    arcFrom: arc.from || '',
    arcTo: arc.to || '',
    arcDescription: arc.description || textOf(arc),
  };
}

const CharacterPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { characters: storeCharacters, fetchCharacters, createCharacter, deleteCharacter } = useCharacterStore();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [newName, setNewName] = useState('');
  const [newIdentity, setNewIdentity] = useState('');
  const [newRole, setNewRole] = useState<RoleType>('supporting');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [stateHistory, setStateHistory] = useState<any[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [writingSummary, setWritingSummary] = useState('');
  const [summarySections, setSummarySections] = useState<Record<string, Record<string, string>>>({});
  const [relationships, setRelationships] = useState<any[]>([]);
  const [historyField, setHistoryField] = useState<string | null>(null);
  const historyLabel = historyField
    ? (PROFILE_SECTION_GROUPS.flatMap(s => s.fields).find(f => f.key === historyField)?.label ?? historyField)
    : '';

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}/characters/relationships`).then((res: any) => {
      const data = apiPayload<any>(res);
      setRelationships(data?.network || []);
    }).catch(() => setRelationships([]));
  }, [projectId]);
  useEffect(() => {
    if (projectId) fetchCharacters(projectId, true);
  }, [projectId, fetchCharacters]);

  const characters = useMemo(() => storeCharacters.map(normalizeCharacter), [storeCharacters]);
  const selected = useMemo(() => characters.find(character => character.id === selectedId) || characters[0] || null, [characters, selectedId]);

  useEffect(() => {
    if (!selectedId && characters[0]) setSelectedId(characters[0].id);
  }, [characters, selectedId]);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft(createDraft(selected));
    setEditing(false);
    setSaveMessage('');
  }, [selected?.id]);

  useEffect(() => {
    if (!projectId || !selected?.id) {
      setStateHistory([]);
      return;
    }
    let cancelled = false;
    api.get(`/projects/${projectId}/characters/${selected.id}/state-history`)
      .then((res: any) => {
        const data = apiPayload<any[]>(res);
        if (!cancelled) setStateHistory(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setStateHistory([]);
      });
    return () => { cancelled = true; };
  }, [projectId, selected?.id]);

  useEffect(() => {
    if (!projectId || !selected?.id) return;
    api.get(`/projects/${projectId}/characters/${selected.id}/profile`).then((res: any) => {
      const data = apiPayload<any>(res);
      setProfile(data.profile || {});
    }).catch(() => setProfile({}));
    api.get(`/projects/${projectId}/characters/${selected.id}/writing-summary`).then((res: any) => {
      const data = apiPayload<any>(res);
      setWritingSummary(data.summary || '');
      setSummarySections(data.sections || {});
    }).catch(() => { setWritingSummary(''); setSummarySections({}); });
  }, [projectId, selected?.id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return characters;
    return characters.filter(character =>
      character.name.toLowerCase().includes(needle)
      || character.identity.toLowerCase().includes(needle)
      || character.background.toLowerCase().includes(needle),
    );
  }, [characters, search]);

  const grouped = useMemo(() => ({
    protagonist: filtered.filter(character => character.role === 'protagonist'),
    major: filtered.filter(character => character.role === 'major'),
    supporting: filtered.filter(character => character.role === 'supporting'),
    minor: filtered.filter(character => character.role === 'minor'),
  }), [filtered]);

  const updateDraft = (patch: Partial<DraftState>) => setDraft(current => current ? { ...current, ...patch } : current);

  const saveCharacter = useCallback(async () => {
    if (!projectId || !selected || !draft) return;
    const personality = {
      ...(typeof selected.personality === 'object' ? selected.personality : {}),
      summary: draft.personalityText,
      coreTraits: draft.coreTraits.split(/[、，,；;]/).map(item => item.trim()).filter(Boolean).slice(0, 3),
      contradiction: draft.contradiction,
    };
    const abilities = {
      ...selected.abilities,
      shortTermGoal: draft.shortTermGoal,
      longTermGoal: draft.longTermGoal,
      fears: draft.fear,
    };
    const arc = {
      from: draft.arcFrom,
      to: draft.arcTo,
      description: draft.arcDescription,
    };

    try {
      await api.put(`/projects/${projectId}/characters/${selected.id}`, {
        name: draft.name,
        identity: draft.identity,
        age: Number(draft.age) || undefined,
        gender: draft.gender,
        role: draft.role,
        appearance: draft.appearance,
        background: draft.background,
        personality,
        abilities,
        arc,
        dialogueStyle: draft.dialogueStyle,
      });
      const profilePayload = {
        ...profile,
        goals_motivation: [draft.shortTermGoal, draft.longTermGoal, draft.fear].filter(Boolean).join('；') || profile.goals_motivation || '',
      };
      const profileRes = await api.put(`/projects/${projectId}/characters/${selected.id}/profile`, profilePayload);
      setProfile(apiPayload<any>(profileRes).profile || profilePayload);
      const summaryRes = await api.get(`/projects/${projectId}/characters/${selected.id}/writing-summary`);
      setWritingSummary(apiPayload<any>(summaryRes).summary || '');
      setEditing(false);
      setSaveMessage('角色修改已保存，后续写作会使用最新资料。');
      await fetchCharacters(projectId, true);
    } catch (error: any) {
      setSaveMessage(`保存失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, selected, draft, profile, fetchCharacters]);

  const enhanceDraft = useCallback(() => {
    if (!selected || !draft) return;
    const currentCore = draft.coreTraits || selected.personalityText;
    updateDraft({
      coreTraits: currentCore || '外冷内急、记仇但讲规矩、遇到熟人会先避开视线',
      contradiction: draft.contradiction || '想掌控局面，却常被一句旧称呼或一件旧物打乱判断。',
      appearance: draft.appearance || '保留一个可识别细节，例如袖口磨损、总把笔夹反、说谎时先整理领口。',
      background: draft.background || '补入一次改变角色选择的旧事，不写成履历，而写成一个仍会影响当下判断的场景。',
      dialogueStyle: draft.dialogueStyle || '短句多，避开直接承诺；被逼急时会突然说出很具体的旧细节。',
      arcDescription: draft.arcDescription || '记录此角色从当前身份到后续位置变化的关键节点，后续章节状态从这里派生。',
    });
    setEditing(true);
    setSaveMessage('已生成可微调草稿，建议只改最必要的几处，再保存。');
  }, [selected, draft]);

  const createNew = async () => {
    if (!projectId || !newName.trim()) return;
    await createCharacter({ projectId, name: newName.trim(), identity: newIdentity.trim(), role: newRole });
    setNewName('');
    setNewIdentity('');
    setNewRole('supporting');
    setShowCreate(false);
    await fetchCharacters(projectId, true);
  };

  const removeCharacter = async (characterId: string) => {
    if (!projectId) return;
    if (!window.confirm('确定删除这个角色？删除后相关大纲、伏笔、组织关系不会自动删除，需要人工检查。')) return;
    await deleteCharacter(characterId, projectId);
    await fetchCharacters(projectId, true);
    if (selectedId === characterId) setSelectedId('');
  };

  const latestState = stateHistory[0]?.states || {};
  const dimensions = STATUS_DIMENSIONS.map(([key, label]) => ({
    key,
    label,
    value: latestState[key] ?? selected?.abilities?.[key] ?? defaultDimensionValue(key, selected),
    source: latestState[key] ? '已审核状态' : '基础设定',
    review: latestState[key] ? '已审核' : '待正文校验',
  }));

  return (
    <div style={styles.page}>
      {sidebarOpen && (
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <button type="button" onClick={() => setSidebarOpen(false)} title="收起侧栏" style={{ background:'none',border:'none',color:'var(--color-text-dim)',cursor:'pointer',fontSize:14,lineHeight:1,padding:0 }}>◀</button>
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="搜索角色、身份、背景"
            style={styles.searchInput}
          />
          <button type="button" onClick={() => setShowCreate(value => !value)} style={styles.addButton}>新增</button>
        </div>

        {showCreate && (
          <div style={styles.createBox}>
            <input value={newName} onChange={event => setNewName(event.target.value)} placeholder="角色姓名" style={styles.input} />
            <input value={newIdentity} onChange={event => setNewIdentity(event.target.value)} placeholder="身份/职位" style={styles.input} />
            <select value={newRole} onChange={event => setNewRole(event.target.value as RoleType)} style={styles.input}>
              {roleOptions()}
            </select>
            <div style={styles.row}>
              <button type="button" onClick={createNew} style={styles.primaryButton}>创建</button>
              <button type="button" onClick={() => setShowCreate(false)} style={styles.secondaryButton}>取消</button>
            </div>
          </div>
        )}

        <div style={styles.list}>
          {(Object.keys(ROLE_META) as RoleType[]).map(role => (
            <section key={role} style={styles.group}>
              <div style={styles.groupTitle}>
                <span style={{ color: ROLE_META[role].color }}>{ROLE_META[role].label}</span>
                <em>{grouped[role].length}</em>
              </div>
              {grouped[role].map(character => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => setSelectedId(character.id)}
                  style={{ ...styles.characterItem, ...(selected?.id === character.id ? styles.characterItemActive : null) }}
                >
                  <span style={styles.characterName}>{character.name}</span>
                  <span style={styles.characterIdentity}>{character.identity || '未填写身份'}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </aside>
      )}
      {!sidebarOpen && (
        <button type="button" onClick={() => setSidebarOpen(true)} title="展开角色列表"
          style={{ position:'absolute', left:8, top:12, zIndex:10, width:28, height:28, borderRadius:6,
            border:'1px solid rgba(255,255,255,0.1)', backgroundColor:'rgba(0,0,0,0.6)', color:'var(--color-text-soft)',
            cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
          ▶
        </button>
      )}

      <main style={styles.main}>
        <WritingQualityContextBanner />
        {!selected || !draft ? (
          <div style={styles.empty}>请选择一个角色</div>
        ) : (
          <>
            <header style={styles.hero}>
              <div>
                <div style={styles.heroMeta}>
                  <span style={{ ...styles.roleBadge, color: (ROLE_META[selected.role] ?? ROLE_META.supporting).color, borderColor: `${(ROLE_META[selected.role] ?? ROLE_META.supporting).color}55` }}>{(ROLE_META[selected.role] ?? ROLE_META.supporting).label}</span>
                  {selected.isPov && <span style={styles.povBadge}>POV</span>}
                </div>
                <h1 style={styles.title}>{selected.name}</h1>
                <div style={styles.heroInfoRow}>
                  <span>{selected.age ? `${selected.age}岁` : '年龄未知'}</span>
                  <span>{selected.gender || '性别未知'}</span>
                  <span style={styles.heroInfoTruncated}>{selected.appearance || '外貌未填'}</span>
                </div>
              </div>
              <div style={styles.heroActions}>
                <button type="button" onClick={enhanceDraft} style={styles.secondaryButton}>AI完善草稿</button>
                <button type="button" onClick={() => setEditing(value => !value)} style={styles.secondaryButton}>{editing ? '收起微调' : '手动微调'}</button>
                <button type="button" onClick={() => removeCharacter(selected.id)} style={styles.dangerButton}>删除</button>
              </div>
            </header>

            {saveMessage && <div style={styles.message}>{saveMessage}</div>}

            {editing && (
              <section style={styles.editorPanel}>
                <div style={styles.editorGrid}>
                  <TextInput label="姓名" value={draft.name} onChange={value => updateDraft({ name: value })} />
                  <TextInput label="身份/职位" value={draft.identity} onChange={value => updateDraft({ identity: value })} />
                  <TextInput label="年龄" value={String(draft.age || '')} onChange={value => updateDraft({ age: Number(value) || 0 })} />
                  <TextInput label="性别" value={draft.gender} onChange={value => updateDraft({ gender: value })} />
                  <Field label="角色层级">
                    <select value={draft.role} onChange={event => updateDraft({ role: event.target.value as RoleType })} style={styles.input}>
                      {roleOptions()}
                    </select>
                  </Field>
                  <TextInput label="短期目标" value={draft.shortTermGoal} onChange={value => updateDraft({ shortTermGoal: value })} />
                </div>
                <TextArea label="3核心特质" value={draft.coreTraits} onChange={value => updateDraft({ coreTraits: value })} hint="用顿号分隔，最多保留三个核心点，方便后续章节调用。" />
                <TextArea label="1矛盾/偏差" value={draft.contradiction} onChange={value => updateDraft({ contradiction: value })} hint="写角色不完全自洽的地方，不要写成道德标签。" />
                <TextArea label="外貌/可识别细节" value={draft.appearance} onChange={value => updateDraft({ appearance: value })} />
                <TextArea label="背景故事" value={draft.background} onChange={value => updateDraft({ background: value })} />
                <TextArea label="对话风格" value={draft.dialogueStyle} onChange={value => updateDraft({ dialogueStyle: value })} />
                <div style={styles.editorGrid}>
                  <TextInput label="长期目标/真实目的" value={draft.longTermGoal} onChange={value => updateDraft({ longTermGoal: value })} />
                  <TextInput label="恐惧/弱点" value={draft.fear} onChange={value => updateDraft({ fear: value })} />
                  <TextInput label="弧光起点" value={draft.arcFrom} onChange={value => updateDraft({ arcFrom: value })} />
                  <TextInput label="弧光终点" value={draft.arcTo} onChange={value => updateDraft({ arcTo: value })} />
                </div>
                <TextArea label="弧光说明" value={draft.arcDescription} onChange={value => updateDraft({ arcDescription: value })} />
                {PROFILE_SECTION_GROUPS.map(section => (
                  <ProfileSection key={section.title} section={section} profile={profile} onChange={(key, value) => setProfile(current => ({ ...current, [key]: value }))} />
                ))}
                <div style={styles.row}>
                  <button type="button" onClick={saveCharacter} style={styles.primaryButton}>保存微调</button>
                  <button type="button" onClick={() => { setDraft(createDraft(selected)); setEditing(false); }} style={styles.secondaryButton}>放弃改动</button>
                </div>
              </section>
            )}

            <section style={styles.contentGrid}>
              <section style={styles.summaryPanel}>
                <div style={styles.panelTitle}>人物一句话</div>
                <div style={styles.panelBody}>
                  <div style={styles.summaryText}>{writingSummary || '暂无写作摘要'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
                    <FieldList label="读者共鸣点" value={profile['reader_empathy_point']} accent="var(--color-pink)" empty="暂无" />
                    <FieldList label="角色标签" value={Array.isArray(selected.tags) ? selected.tags.join('、') : selected.tags} accent="var(--color-info-light)" />
                  </div>
                </div>
              </section>

              <Panel title="3核心 + 1矛盾">
                <div style={styles.traitWrap}>
                  {(draft.coreTraits || selected.personalityText || '暂无核心特质')
                    .split(/[、，,；;]/)
                    .map(item => item.trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((item, index) => <span key={index} style={styles.traitTag}>{item}</span>)}
                </div>
                <div style={styles.contradictionBox}>{draft.contradiction || '暂无矛盾/偏差'}</div>
              </Panel>

              <Panel title="状态时间线">
                {stateHistory.length > 0 ? (
                  <div style={styles.timeline}>
                    {stateHistory.slice(0, 8).map((item, index) => (
                      <div key={item.id || index} style={styles.timelineItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>第{item.order || index + 1}次状态快照</strong>
                          {(item.source === 'auto_extract' || item.trigger) && (
                            <span style={{ fontSize: 14, padding: '2px 6px', borderRadius: 4, background: '#1e3a5f', color: '#7dd3fc' }}>正文自动提取</span>
                          )}
                        </div>
                        <span>{item.timestamp || '无时间'}</span>
                        <p>{Array.isArray(item.changedDimensions) && item.changedDimensions.length > 0 ? `变化：${item.changedDimensions.join('、')}` : '暂无显著变化记录'}</p>
                        {item.trigger && <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>触发：{item.trigger}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.mutedBox}>暂无状态历史</div>
                )}
              </Panel>

              <Panel title="人际关系">
                {selected.relationships.length > 0 ? selected.relationships.map((rel, index) => (
                  <div key={index} style={styles.relationshipRow}>
                    <strong>{rel.characterName || rel.targetName || rel.name || '未命名'}</strong>
                    <span>{rel.type || 'neutral'}</span>
                    <p>{rel.description || '暂无说明'}</p>
                  </div>
                )) : <div style={styles.mutedBox}>暂无人际关系</div>}
              </Panel>
            </section>

            <section style={styles.profileArchive}>
              <div style={styles.panelTitle}>人物设定</div>
              <div style={{ padding: 12 }}>
                {PROFILE_SECTION_GROUPS.map(section => {
                  const entries = section.fields
                    .map(field => ({ field, value: profile[field.key] || '' }))
                    .filter(e => (e.value || '').trim());
                  if (!entries.length) return null;
                  return (
                    <section key={section.title} style={{ marginBottom: 6 }}>
                      <SectionHeading title={section.title} accent="var(--color-accent)" hint={section.description} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {entries.map(({ field, value }) => (
                          <div
                            key={field.key}
                            onClick={() => setHistoryField(field.key)}
                            title="点击查看/记录变动历史"
                            style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: '1px solid transparent' }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(233,69,96,0.25)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            {field.key === 'relationships'
                              ? <ProfileRelationshipField value={value} />
                              : <FieldList label={field.label} value={value} accent="var(--color-info-light)" />}
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
              {historyField && (
                <ChangeHistoryPanel projectId={projectId || ''} characterId={selected.id} fieldKey={historyField} fieldLabel={historyLabel} onClose={() => setHistoryField(null)} />
              )}
            </section>

            <section style={styles.statusPanel}>
              <div style={styles.panelTitle}>24维状态列表</div>
              <div style={styles.statusList}>
                {dimensions.map(item => (
                  <div key={item.key} style={styles.statusRow}>
                    <span style={styles.statusLabel}>{item.label}</span>
                    <strong style={styles.statusValue}>{String(item.value || '暂无')}</strong>
                    <em style={styles.sourceBadge}>{item.source}</em>
                    <em style={item.review === '已审核' ? styles.reviewedBadge : styles.pendingBadge}>{item.review}</em>
                  </div>
                ))}
              </div>
            </section>

            {relationships.length > 0 && (
              <section style={{...styles.statusPanel, borderColor: 'rgba(139,92,246,0.18)'}}>
                <div style={{...styles.panelTitle, color: 'var(--color-purple)'}}>🔗 人物关系网络（per 文档：核心关系图/关系变化/隐藏关系/关系冲突）</div>
                <div style={styles.statusList}>
                  {relationships.map((rel: any, idx: number) => (
                    <div key={idx} style={{...styles.statusRow, gridTemplateColumns: '80px 80px minmax(0,1fr) auto'}}>
                      <strong style={{color:'var(--color-purple)'}}>{rel.source_name || '?'}</strong>
                      <span style={{color:'var(--color-text-dim)'}}>→</span>
                      <div>
                        <strong style={{color:'var(--color-text-soft)'}}>{rel.target_name || '?'}</strong>
                        <div style={{fontSize: 14,color:'var(--color-text-dim)',marginTop:2}}>
                          {rel.public_relation || rel.relation_type || '未知关系'}
                          {rel.hidden_relation ? ` | 隐藏：${rel.hidden_relation}` : ''}
                          {rel.change_summary ? ` | 变化：${rel.change_summary}` : ''}
                          {rel.conflict_score ? ` | 冲突度：${rel.conflict_score}` : ''}
                        </div>
                      </div>
                      <em style={{...styles.sourceBadge, color: rel.reader_known_state === 'known' ? 'var(--color-success)' : 'var(--color-warning)'}}>
                        {rel.reader_known_state === 'known' ? '读者已知' : '读者未知'}
                      </em>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const ProfileSection: React.FC<{ section: ProfileSectionConfig; profile: Record<string, string>; onChange: (key: string, value: string) => void }> = ({ section, profile, onChange }) => (
  <section style={styles.editorPanel}>
    <h3 style={styles.panelTitle}>{section.title}</h3>
    <p style={styles.hint}>{section.description}</p>
    <div style={styles.editorGrid}>
      {section.fields.map(field => (
        <TextArea key={field.key} label={field.label} value={profile[field.key] || ''} onChange={value => onChange(field.key, value)} hint={field.hint} />
      ))}
    </div>
  </section>
);

const ProfileRelationshipField: React.FC<{ value: string }> = ({ value }) => {
  const relationships = profileRelationships(value);
  if (!relationships) return <FieldList label="人物关系" value={value} accent="var(--color-info-light)" />;
  return (
    <div style={{ padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-info-light)', marginBottom: 8 }}>人物关系 · {relationships.length}项</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {relationships.map((relationship, index) => {
          const name = relationship.targetName || relationship.characterName || relationship.name || '未命名角色';
          return (
            <div key={`${name}-${index}`} style={{ padding: '8px 10px', borderRadius: 5, backgroundColor: 'rgba(147,197,253,0.06)', borderLeft: '3px solid var(--color-info-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--color-text-primary)' }}>{name}</strong>
                {relationship.type && <span style={{ padding: '2px 6px', borderRadius: 4, color: 'var(--color-info-light)', backgroundColor: 'rgba(96,165,250,0.14)', fontSize: 14 }}>{relationship.type}</span>}
              </div>
              {relationship.description && <p style={{ margin: '6px 0 0', color: 'var(--color-text-soft)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{relationship.description}</p>}
              {relationship.future && <p style={{ margin: '5px 0 0', color: 'var(--color-purple)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>后续：{relationship.future}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function roleOptions() {
  return (Object.keys(ROLE_META) as RoleType[]).map(role => <option key={role} value={role}>{ROLE_META[role].label}</option>);
}

function defaultDimensionValue(key: string, character: CharacterView | null): string {
  if (!character) return '';
  const arc = Array.isArray(character.arc) ? character.arc[0] || {} : character.arc || {};
  const map: Record<string, string> = {
    mood: '未记录',
    injury: '无',
    fatigue: '未记录',
    loyalty: '未记录',
    location: '未定位',
    goal: character.abilities.shortTermGoal || character.abilities.goal || '未记录',
    secret: character.abilities.hiddenInfo || character.abilities.secret || '未记录',
    skill: textOf(character.abilities.skill || character.abilities.skills || ''),
    arc: arc.description || arc.to || '未记录',
  };
  return map[key] || character.abilities[key] || '未记录';
}

const TextInput: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <Field label={label}>
    <input value={value} onChange={event => onChange(event.target.value)} style={styles.input} />
  </Field>
);

const TextArea: React.FC<{ label: string; value: string; onChange: (value: string) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <Field label={label} hint={hint}>
    <textarea value={value} onChange={event => onChange(event.target.value)} style={styles.textarea} />
  </Field>
);

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label style={styles.field}>
    <span>{label}</span>
    {children}
    {hint && <em>{hint}</em>}
  </label>
);

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={styles.panel}>
    <div style={styles.panelTitle}>{title}</div>
    <div style={styles.panelBody}>{children}</div>
  </section>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={styles.infoRow}>
    <span>{label}</span>
    <p>{parseJsonToReadable(value)}</p>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  page: { height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' },
  sidebar: { ...clampSidebar(240, 25, 360), display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'var(--color-bg-primary)' },
  sidebarHeader: { display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.22)', color: 'var(--color-text-primary)', outline: 'none', fontSize: 14 },
  addButton: { padding: '8px 12px', borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: 'var(--color-white)', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  createBox: { margin: 10, padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.035)', display: 'flex', flexDirection: 'column', gap: 8 },
  list: { flex: 1, overflow: 'auto', padding: 10 },
  group: { marginBottom: 12 },
  groupTitle: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', fontSize: 14, fontWeight: 800 },
  characterItem: { width: '100%', display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', marginBottom: 4, borderRadius: 7, border: '1px solid transparent', backgroundColor: 'transparent', color: 'var(--color-text-soft)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  characterItemActive: { backgroundColor: 'rgba(233,69,96,0.12)', borderColor: 'rgba(233,69,96,0.32)' },
  characterName: { fontSize: 14, fontWeight: 800 },
  characterIdentity: { fontSize: 14, color: 'var(--color-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  main: { flex: 1, overflow: 'auto', padding: 18 },
  empty: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)' },
  hero: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.12)' },
  heroMeta: { display: 'flex', gap: 8, marginBottom: 8 },
  title: { margin: 0, fontSize: 24, lineHeight: 1.2 },
  subtitle: { margin: '6px 0 0', fontSize: 14, color: 'var(--color-text-dim)' },
  heroInfoRow: { display: 'flex', gap: 12, marginTop: 8, fontSize: 14, color: 'var(--color-text-soft)', flexWrap: 'wrap' },
  heroInfoTruncated: { maxWidth: 'min(320px, 40vw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  heroActions: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  roleBadge: { padding: '3px 8px', borderRadius: 5, border: '1px solid', backgroundColor: 'rgba(255,255,255,0.04)', fontSize: 14, fontWeight: 800 },
  povBadge: { padding: '3px 8px', borderRadius: 5, backgroundColor: 'rgba(233,69,96,0.12)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 800 },
  message: { marginTop: 10, padding: '9px 12px', borderRadius: 6, backgroundColor: 'rgba(96,165,250,0.09)', border: '1px solid rgba(96,165,250,0.16)', color: 'var(--color-info-light)', fontSize: 14 },
  impactBox: { marginTop: 10, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.14)', color: 'var(--color-warning)', fontSize: 14, lineHeight: 1.6 },
  editorPanel: { marginTop: 12, padding: 14, borderRadius: 8, border: '1px solid rgba(233,69,96,0.22)', backgroundColor: 'rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', gap: 10 },
  editorGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 14, color: 'var(--color-text-dim)' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.22)', color: 'var(--color-text-primary)', outline: 'none', fontSize: 14, fontFamily: 'inherit' },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 70, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.22)', color: 'var(--color-text-primary)', outline: 'none', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primaryButton: { padding: '8px 14px', borderRadius: 6, border: 'none', backgroundColor: 'var(--color-accent)', color: 'var(--color-white)', cursor: 'pointer', fontSize: 14, fontWeight: 800 },
  secondaryButton: { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-soft)', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  dangerButton: { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.28)', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 },
  summaryPanel: { gridColumn: '1 / -1', border: '1px solid rgba(96,165,250,0.18)', borderRadius: 8, backgroundColor: 'rgba(96,165,250,0.06)', overflow: 'hidden' },
  summaryText: { fontSize: 14, lineHeight: 1.7, color: 'var(--color-text-primary)' },
  summaryBackground: { marginTop: 8, padding: 10, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.12)', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-soft)' },
  summarySectionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginTop: 12 },
  summarySectionCard: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.12)', border: '1px solid rgba(255,255,255,0.06)' },
  summarySectionTitle: { margin: '0 0 8px', fontSize: 14, color: 'var(--color-info-light)', fontWeight: 800 },
  summarySectionRow: { fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-soft)', marginBottom: 4 },
  panel: { border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  panelTitle: { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-primary)', fontSize: 14, fontWeight: 800 },
  panelBody: { padding: 12, display: 'flex', flexDirection: 'column', gap: 9 },
  infoRow: { display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 10, fontSize: 14, lineHeight: 1.6 },
  traitWrap: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  traitTag: { padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(96,165,250,0.18)', backgroundColor: 'rgba(96,165,250,0.08)', color: 'var(--color-info-light)', fontSize: 14 },
  contradictionBox: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(245,158,11,0.08)', borderLeft: '3px solid var(--color-warning)', color: 'var(--color-warning)', fontSize: 14, lineHeight: 1.6 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 8 },
  timelineItem: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 14 },
  mutedBox: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.035)', color: 'var(--color-text-dim)', fontSize: 14, lineHeight: 1.6 },
  relationshipRow: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 14 },
  statusPanel: { marginTop: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  profileArchive: { marginTop: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  archiveHint: { margin: 0, padding: '10px 12px', color: 'var(--color-text-dim)', fontSize: 14, lineHeight: 1.6, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  archiveGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: 12 },
  archiveSection: { border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.025)', overflow: 'hidden' },
  archiveTitle: { margin: 0, padding: '8px 10px', color: 'var(--color-text-primary)', fontSize: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  archiveRow: { padding: '8px 10px', fontSize: 14, lineHeight: 1.55, borderBottom: '1px solid rgba(255,255,255,0.045)' },
  statusList: { display: 'flex', flexDirection: 'column', gap: 6, padding: 12 },
  statusRow: { display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr) auto auto', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.055)', fontSize: 14 },
  statusLabel: { color: 'var(--color-text-dim)', fontWeight: 700 },
  statusValue: { color: 'var(--color-text-primary)', fontWeight: 600 },
  sourceBadge: { fontStyle: 'normal', color: 'var(--color-info-light)', backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.14)', borderRadius: 4, padding: '2px 6px', fontSize: 14 },
  reviewedBadge: { fontStyle: 'normal', color: 'var(--color-success)', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.14)', borderRadius: 4, padding: '2px 6px', fontSize: 14 },
  pendingBadge: { fontStyle: 'normal', color: 'var(--color-warning)', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.14)', borderRadius: 4, padding: '2px 6px', fontSize: 14 },
};

export default CharacterPage;
