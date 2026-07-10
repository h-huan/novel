/**
 * CharacterPage - 角色层级、状态时间线与手动微调
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useCharacterStore } from '../stores/characterStore';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';

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

const PROFILE_SECTIONS: Array<[string, string, string]> = [
  ['外貌记忆点', 'appearance_memory_points', '用于保持可辨识外观与标志物。'], ['目标动机', 'core_desire', '用于判断角色为什么行动。'],
  ['背景秘密', 'secret', '用于控制信息揭示与身份反转。'], ['能力与代价', 'ability_limit', '用于限制能力使用，避免乱开挂。'],
  ['弱点与边界', 'personality_weakness', '用于维持代价、恐惧与道德边界。'], ['性格矛盾', 'contradiction_point', '用于避免角色扁平。'],
  ['语言风格', 'speech_style', '用于让对话保持人物辨识度。'], ['行为模式', 'danger_reaction', '用于约束关键反应。'],
  ['剧情用途', 'plot_function', '用于连接冲突、反转与读者期待。'], ['成长弧光', 'current_arc_state', '用于防止提前完成成长。'],
  ['AI 写作约束', 'forbidden_writing', '用于告诉正文生成不能违背哪些设定。'], ['本章使用', 'current_chapter_usage', '用于提供当前章节可用冲突。'],
];

const ROLE_META: Record<RoleType, { label: string; hint: string; color: string }> = {
  protagonist: { label: '全书贯穿', hint: '跨卷成长，状态、关系和伏笔长期跟踪', color: '#e94560' },
  major: { label: '卷级核心', hint: '服务一卷或一条主线，影响大纲和势力关系', color: '#60a5fa' },
  supporting: { label: '阶段辅助', hint: '出场几十章或一个阶段，推动局部冲突', color: '#22c55e' },
  minor: { label: '短线功能', hint: '服务几章内的事件，避免过度膨胀', color: '#f59e0b' },
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

function textOf(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('、');
  if (typeof value === 'object') {
    const preferred = value.summary || value.description || value.core || value.traits || value.desire || value.hiddenInfo || value.fears;
    if (preferred) return textOf(preferred);
    return Object.entries(value)
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number')
      .map(([key, item]) => `${key}: ${item}`)
      .join('；');
  }
  return String(value);
}

function normalizeCharacter(raw: any): CharacterView {
  const personality = parseJsonSafe(raw.personality, raw.personality || {});
  const abilities = parseJsonSafe(raw.abilities, raw.abilities || {});
  const relationships = parseJsonSafe(raw.relationships, raw.relationships || []);
  const arc = parseJsonSafe(raw.arc, raw.arc || {});
  const tags = parseJsonSafe(raw.tags, raw.tags || []);

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
    role: (raw.role || 'supporting') as RoleType,
    tags: Array.isArray(tags) ? tags : [],
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
  const [newName, setNewName] = useState('');
  const [newIdentity, setNewIdentity] = useState('');
  const [newRole, setNewRole] = useState<RoleType>('supporting');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [stateHistory, setStateHistory] = useState<any[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [writingSummary, setWritingSummary] = useState('');

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
      setWritingSummary(apiPayload<any>(res).summary || '');
    }).catch(() => setWritingSummary(''));
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
      const profileRes = await api.put(`/projects/${projectId}/characters/${selected.id}/profile`, {
        ...profile,
        short_term_goal: draft.shortTermGoal,
        long_term_goal: draft.longTermGoal,
        core_fear: draft.fear,
        speech_style: draft.dialogueStyle,
        current_arc_state: draft.arcTo,
      });
      setProfile(apiPayload<any>(profileRes).profile || profile);
      const summaryRes = await api.get(`/projects/${projectId}/characters/${selected.id}/writing-summary`);
      setWritingSummary(apiPayload<any>(summaryRes).summary || '');
      setEditing(false);
      setSaveMessage('已保存角色微调，并更新 RAG 索引。');
      await fetchCharacters(projectId, true);
    } catch (error: any) {
      setSaveMessage(`保存失败：${error?.message || '未知错误'}`);
    }
  }, [projectId, selected, draft, fetchCharacters]);

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
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
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

      <main style={styles.main}>
        <WritingQualityContextBanner />
        {!selected || !draft ? (
          <div style={styles.empty}>请选择一个角色</div>
        ) : (
          <>
            <header style={styles.hero}>
              <div>
                <div style={styles.heroMeta}>
                  <span style={{ ...styles.roleBadge, color: ROLE_META[selected.role].color, borderColor: `${ROLE_META[selected.role].color}55` }}>{ROLE_META[selected.role].label}</span>
                  {selected.isPov && <span style={styles.povBadge}>POV</span>}
                </div>
                <h1 style={styles.title}>{selected.name}</h1>
                <p style={styles.subtitle}>{selected.identity || '未填写身份'} · {ROLE_META[selected.role].hint}</p>
              </div>
              <div style={styles.heroActions}>
                <button type="button" onClick={enhanceDraft} style={styles.secondaryButton}>AI完善草稿</button>
                <button type="button" onClick={() => setEditing(value => !value)} style={styles.secondaryButton}>{editing ? '收起微调' : '手动微调'}</button>
                <button type="button" onClick={() => removeCharacter(selected.id)} style={styles.dangerButton}>删除</button>
              </div>
            </header>

            {saveMessage && <div style={styles.message}>{saveMessage}</div>}

            <section style={styles.impactBox}>
              修改建议：尽量小改，影响范围按 世界观 &gt; 已锁定章节正文 &gt; 大纲=角色=组织与地图=伏笔 &gt; 未锁定章节正文。保存后会刷新角色列表并重新索引，正文状态仍需审核后写入时间线。
            </section>

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
                <div style={styles.editorGrid}>
                  {PROFILE_SECTIONS.map(([label, key, hint]) => (
                    <TextArea key={key} label={label} value={profile[key] || ''} onChange={value => setProfile(current => ({ ...current, [key]: value }))} hint={hint} />
                  ))}
                </div>
                <div style={styles.row}>
                  <button type="button" onClick={saveCharacter} style={styles.primaryButton}>保存微调</button>
                  <button type="button" onClick={() => { setDraft(createDraft(selected)); setEditing(false); }} style={styles.secondaryButton}>放弃改动</button>
                </div>
              </section>
            )}

            <section style={styles.contentGrid}>
              <Panel title="角色写作摘要">
                <div style={styles.mutedBox}>{writingSummary || '保存角色资料后将生成真实写作摘要。'}</div>
              </Panel>
              <Panel title="基础信息">
                <InfoRow label="姓名" value={selected.name} />
                <InfoRow label="身份" value={selected.identity || '未填写'} />
                <InfoRow label="年龄/性别" value={`${selected.age || '未知'} / ${selected.gender || '未知'}`} />
                <InfoRow label="外貌细节" value={selected.appearance || '暂无'} />
                <InfoRow label="背景" value={selected.background || '暂无'} />
              </Panel>

              <Panel title="3核心 + 1矛盾">
                <div style={styles.traitWrap}>
                  {(draft.coreTraits || selected.personalityText || '暂无核心特质')
                    .split(/[、，,；;]/)
                    .map(item => item.trim())
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((item, index) => <span key={index} style={styles.traitTag}>{item}</span>)}
                </div>
                <div style={styles.contradictionBox}>{draft.contradiction || '暂无矛盾/偏差。建议补一个会影响章节判断的具体细节。'}</div>
              </Panel>

              <Panel title="状态时间线">
                {stateHistory.length > 0 ? (
                  <div style={styles.timeline}>
                    {stateHistory.slice(0, 8).map((item, index) => (
                      <div key={item.id || index} style={styles.timelineItem}>
                        <strong>第{item.order || index + 1}次状态快照</strong>
                        <span>{item.timestamp || '无时间'}</span>
                        <p>{Array.isArray(item.changedDimensions) && item.changedDimensions.length > 0 ? `变化：${item.changedDimensions.join('、')}` : '暂无显著变化记录'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.mutedBox}>暂无已审核状态历史。正文草稿抽取后应先进入“待审核”，确认后再成为角色时间线。</div>
                )}
              </Panel>

              <Panel title="人际关系">
                {selected.relationships.length > 0 ? selected.relationships.map((rel, index) => (
                  <div key={index} style={styles.relationshipRow}>
                    <strong>{rel.characterName || rel.targetName || rel.name || '未命名'}</strong>
                    <span>{rel.type || 'neutral'}</span>
                    <p>{rel.description || '暂无说明'}</p>
                  </div>
                )) : <div style={styles.mutedBox}>暂无人际关系。后续可从正文抽取或手动补充。</div>}
              </Panel>
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
          </>
        )}
      </main>
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
    <p>{value}</p>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  page: { height: '100%', display: 'flex', overflow: 'hidden', backgroundColor: '#16213e', color: '#eaeaea' },
  sidebar: { width: 300, minWidth: 300, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#101a33' },
  sidebarHeader: { display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', outline: 'none', fontSize: 12 },
  addButton: { padding: '8px 12px', borderRadius: 6, border: 'none', backgroundColor: '#e94560', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  createBox: { margin: 10, padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.035)', display: 'flex', flexDirection: 'column', gap: 8 },
  list: { flex: 1, overflow: 'auto', padding: 10 },
  group: { marginBottom: 12 },
  groupTitle: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', fontSize: 12, fontWeight: 800 },
  characterItem: { width: '100%', display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', marginBottom: 4, borderRadius: 7, border: '1px solid transparent', backgroundColor: 'transparent', color: '#c0c0d0', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  characterItemActive: { backgroundColor: 'rgba(233,69,96,0.12)', borderColor: 'rgba(233,69,96,0.32)' },
  characterName: { fontSize: 13, fontWeight: 800 },
  characterIdentity: { fontSize: 11, color: '#8a8aa0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  main: { flex: 1, overflow: 'auto', padding: 18 },
  empty: { height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a8aa0' },
  hero: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', padding: '16px 18px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.12)' },
  heroMeta: { display: 'flex', gap: 8, marginBottom: 8 },
  title: { margin: 0, fontSize: 24, lineHeight: 1.2 },
  subtitle: { margin: '6px 0 0', fontSize: 13, color: '#8a8aa0' },
  heroActions: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  roleBadge: { padding: '3px 8px', borderRadius: 5, border: '1px solid', backgroundColor: 'rgba(255,255,255,0.04)', fontSize: 11, fontWeight: 800 },
  povBadge: { padding: '3px 8px', borderRadius: 5, backgroundColor: 'rgba(233,69,96,0.12)', color: '#e94560', fontSize: 11, fontWeight: 800 },
  message: { marginTop: 10, padding: '9px 12px', borderRadius: 6, backgroundColor: 'rgba(96,165,250,0.09)', border: '1px solid rgba(96,165,250,0.16)', color: '#93c5fd', fontSize: 12 },
  impactBox: { marginTop: 10, padding: '10px 12px', borderRadius: 6, backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.14)', color: '#fbbf24', fontSize: 12, lineHeight: 1.6 },
  editorPanel: { marginTop: 12, padding: 14, borderRadius: 8, border: '1px solid rgba(233,69,96,0.22)', backgroundColor: 'rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', gap: 10 },
  editorGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 },
  field: { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: '#8a8aa0' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', outline: 'none', fontSize: 12, fontFamily: 'inherit' },
  textarea: { width: '100%', boxSizing: 'border-box', minHeight: 70, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', outline: 'none', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primaryButton: { padding: '8px 14px', borderRadius: 6, border: 'none', backgroundColor: '#e94560', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 800 },
  secondaryButton: { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#c0c0d0', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  dangerButton: { padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.28)', backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  contentGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginTop: 12 },
  panel: { border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  panelTitle: { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#eaeaea', fontSize: 13, fontWeight: 800 },
  panelBody: { padding: 12, display: 'flex', flexDirection: 'column', gap: 9 },
  infoRow: { display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 10, fontSize: 12, lineHeight: 1.6 },
  traitWrap: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  traitTag: { padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(96,165,250,0.18)', backgroundColor: 'rgba(96,165,250,0.08)', color: '#93c5fd', fontSize: 12 },
  contradictionBox: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b', color: '#fbbf24', fontSize: 12, lineHeight: 1.6 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 8 },
  timelineItem: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12 },
  mutedBox: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.035)', color: '#8a8aa0', fontSize: 12, lineHeight: 1.6 },
  relationshipRow: { padding: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12 },
  statusPanel: { marginTop: 12, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)', overflow: 'hidden' },
  statusList: { display: 'flex', flexDirection: 'column', gap: 6, padding: 12 },
  statusRow: { display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr) auto auto', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.055)', fontSize: 12 },
  statusLabel: { color: '#8a8aa0', fontWeight: 700 },
  statusValue: { color: '#eaeaea', fontWeight: 600 },
  sourceBadge: { fontStyle: 'normal', color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.14)', borderRadius: 4, padding: '2px 6px', fontSize: 10 },
  reviewedBadge: { fontStyle: 'normal', color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.14)', borderRadius: 4, padding: '2px 6px', fontSize: 10 },
  pendingBadge: { fontStyle: 'normal', color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.14)', borderRadius: 4, padding: '2px 6px', fontSize: 10 },
};

export default CharacterPage;
