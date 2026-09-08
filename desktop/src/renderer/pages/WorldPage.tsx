import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import WorldSimpleView from '../components/world/WorldSimpleView';
import { PageShell, Card, CardGrid, EmptyHint, darkField, AutoTextarea } from '../components/common/LayoutKit';
import { FieldList } from '../components/common/ListBlocks';

type WorldProfileFieldConfig = { key: string; label: string; hint: string; multiline?: boolean };
type WorldProfileSectionConfig = { title: string; description: string; fields: WorldProfileFieldConfig[] };

// 世界观：以《两百万字小说创作全流程指南》世界观 7 类为主，保留作品地基字段（对应长篇手动编写结构），可按本书补充自定义设定。
const WORLD_FIELD_LABELS: Record<string, string> = {
  synopsis: '作品简介 / 核心卖点',
  basic_info: '基本信息（书名 / 类型 / 时代 / 结局 / 字数目标 / 标签）',
  era: '时代（时间线 / 历史背景）',
  locations: '地点（主要区域 / 关键地点 / 大陆分布）',
  atmosphere_tone: '氛围基调（整体氛围与基调）',
  rules: '规则（世界运行核心规则一 / 二 / 三）',
  social_structure: '社会结构（阶级 / 政治 / 经济资源 / 宗教信仰）',
  economy_system: '经济体系（货币 / 贸易 / 产业）',
  tech_supernatural: '科技 / 超自然 / 力量体系（体系名称 / 能力来源 / 约束代价）',
  system_mechanics: '系统机制（核心机制 / 金手指 / 特殊设定）',
  culture_customs: '文化风俗（语言习俗 / 节日 / 禁忌）',
  naming_rules: '命名规则（人名 / 地名 / 组织名规律）',
  factions: '势力分布（主要势力 / 组织 / 目标与关系）',
  scale_plan: '全文规模 / 数据规划（人口 / 势力 / 资源等量化）',
  ending: '结局设定（结局类型 / 走向 / 收束方式）',
  hierarchy_rules: '核心层级规则（最高优先级：世界观 > 大纲 > 正文）',
  supplementary: '补充说明',
  custom_settings: '自定义设定（按本书补充的键值对，如金手指规则、专有名词表）',
};
const WORLD_FIELD_META: Record<string, { label: string; hint: string }> = Object.fromEntries(Object.entries(WORLD_FIELD_LABELS).map(([key, label]) => [key, { label, hint: `按《两百万字小说创作全流程指南》世界观结构与本书剧情需要写下${label}；不需要时可以留空。` }]));
const field = (key: string): WorldProfileFieldConfig => ({ key, ...(WORLD_FIELD_META[key] || { label: key, hint: '写下与本书有关的设定；不需要时可以留空。' }), multiline: true });
const section = (title: string, description: string, keys: string[]): WorldProfileSectionConfig => ({ title, description, fields: keys.map(field) });

// 指南为主（7 类世界观）+ 作品地基（长篇手动编写结构）为辅 + 补充与自定义（按小说添加）
const PROFILE_SECTION_GROUPS: WorldProfileSectionConfig[] = [
  section('作品地基', '小说的简介、类型、结局方向与规模规划，约束一切后续设定。', ['synopsis', 'basic_info', 'scale_plan', 'ending']),
  section('历史背景', '时间线与历史背景，奠定年代感。', ['era']),
  section('世界地理', '主要区域与关键地点（大陆/国家/城市分层）。', ['locations']),
  section('社会结构', '阶级、政治、经济资源与宗教信仰格局。', ['social_structure']),
  section('经济体系', '货币、贸易、产业等经济运行规则。', ['economy_system']),
  section('力量与科技体系', '力量/科技/超自然体系与系统机制（含金手指）。', ['tech_supernatural', 'system_mechanics']),
  section('文化特色', '氛围基调、文化风俗与命名规则。', ['atmosphere_tone', 'culture_customs', 'naming_rules']),
  section('势力分布', '主要势力、组织及其目标与关系。', ['factions']),
  section('核心规则', '世界运行必须遵守的核心规则与层级纪律。', ['rules', 'hierarchy_rules']),
  section('补充与自定义', '按本书补充的自定义设定。', ['custom_settings']),
];

/** 自定义设定键值编辑器：JSON 数组 [{key, value}]，供按小说补充专属设定 */
const CustomSettingsEditor: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const items = React.useMemo<Array<{ key: string; val: string }>>(() => {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.map((it: any) => ({ key: String(it?.key ?? ''), val: String(it?.value ?? '') })) : [];
    } catch { return []; }
  }, [value]);
  const commit = (next: Array<{ key: string; val: string }>) => onChange(JSON.stringify(next));
  const lastRowEmpty = items.length > 0 && !items[items.length - 1].key && !items[items.length - 1].val;
  const setItem = (idx: number, patch: Partial<{ key: string; val: string }>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    commit(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 6 }}>
          <input value={it.key} placeholder="设定名" onChange={e => setItem(idx, { key: e.target.value })} style={darkField} />
          <input value={it.val} placeholder="设定内容" onChange={e => setItem(idx, { val: e.target.value })} style={darkField} />
        </div>
      ))}
      <button type="button" disabled={lastRowEmpty} style={lastRowEmpty ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} onClick={() => commit([...items, { key: '', val: '' }])}>+ 添加自定义设定</button>
    </div>
  );
};

function payload<T = any>(response: any): T { return (response?.data?.data ?? response?.data ?? response ?? {}) as T; }
function normalizeArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of ['items', 'data', 'results', 'list', 'rows']) if (Array.isArray(object[key])) return object[key] as T[];
  }
  return [];
}

const WorldProfileEditor: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [worldSettings, setWorldSettings] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'edit' | 'read'>('read');

  const loadProfile = useCallback(async (worldSettingId: string) => {
    if (!worldSettingId) return;
    setCollapsed({});
    const [profileResponse, summaryResponse] = await Promise.all([
      api.get(`/projects/${projectId}/world-settings/${worldSettingId}/profile`),
      api.get(`/projects/${projectId}/world-settings/${worldSettingId}/writing-summary`),
    ]);
    const rawProfile = payload<any>(profileResponse).profile || {};
    // 补充说明合并到核心规则字段，不独立显示
    if (rawProfile.supplementary && String(rawProfile.supplementary).trim()) {
      rawProfile.rules = rawProfile.rules
        ? `${rawProfile.rules}\n${rawProfile.supplementary}`
        : rawProfile.supplementary;
      delete rawProfile.supplementary;
    }
    setProfile(rawProfile);
    setSummary(payload<any>(summaryResponse).summary || '');
  }, [projectId]);

  const loadWorldSettings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/projects/${projectId}/world-settings`);
      const settings = normalizeArray<any>(payload(response));
      setWorldSettings(settings);
      const firstId = settings[0]?.id || '';
      setSelectedId(firstId);
      if (firstId) await loadProfile(firstId); else { setProfile({}); setSummary(''); }
    } catch {
      setWorldSettings([]); setSelectedId(''); setProfile({}); setSummary('');
    } finally { setLoading(false); }
  }, [loadProfile, projectId]);

  useEffect(() => { void loadWorldSettings(); }, [loadWorldSettings]);

  const createWorldSetting = async () => {
    setStatus('正在创建世界观...');
    try {
      const response = await api.post(`/projects/${projectId}/world-settings`, { name: '世界观', era: '' });
      const created = payload<any>(response);
      await loadWorldSettings();
      if (created?.id) { setSelectedId(created.id); await loadProfile(created.id); }
      setStatus('世界观已创建。');
    } catch { setStatus('创建世界观失败。'); }
  };

  const saveProfile = async () => {
    if (!selectedId) return;
    setStatus('正在保存...');
    const toSend = { ...profile };
    if (toSend.custom_settings) {
      try {
        const parsed = JSON.parse(toSend.custom_settings);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((it: any) => it?.key || it?.value);
          toSend.custom_settings = cleaned.length ? JSON.stringify(cleaned) : '[]';
        }
      } catch { /* 保留原值 */ }
    }
    try {
      const response = await api.put(`/projects/${projectId}/world-settings/${selectedId}/profile`, toSend);
      const saved = payload<any>(response);
      setProfile(saved.profile || profile);
      const summaryResponse = await api.get(`/projects/${projectId}/world-settings/${selectedId}/writing-summary`);
      setSummary(payload<any>(summaryResponse).summary || '');
      setStatus('已保存。');
      setViewMode('read');
    } catch { setStatus('保存失败，请重试。'); }
  };

  return (
    <PageShell
      title="世界观"
      actions={worldSettings.length > 0 ? (
        <>
          <select value={selectedId} onChange={async event => { setSelectedId(event.target.value); await loadProfile(event.target.value); }}>
            {worldSettings.map(item => <option key={item.id} value={item.id}>{item.name || '未命名世界观'}</option>)}
          </select>
          <button type="button" onClick={() => setViewMode(mode => mode === 'edit' ? 'read' : 'edit')}>
            {viewMode === 'edit' ? '阅读视图' : '编辑视图'}
          </button>
          <button type="button" onClick={saveProfile}>保存世界观资料</button>
        </>
      ) : undefined}
    >
      {loading ? <p style={{ color: 'var(--color-text-dim)' }}>正在加载世界观资料...</p> : worldSettings.length === 0 ? (
        <EmptyHint>当前项目还没有世界观。<div style={{ marginTop: 12 }}><button type="button" onClick={createWorldSetting}>创建世界观</button></div></EmptyHint>
      ) : (
        <>
          {status && <p style={{ color: status === '已保存。' ? '#34d399' : 'var(--color-text-dim)', margin: '0 0 12px' }}>{status}</p>}
          <Card title="写作摘要" span style={{ marginBottom: 16 }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--color-text-soft)', fontSize: 14, lineHeight: 1.6, maxHeight: 400, overflow: 'auto' }}>{summary || '暂无写作摘要'}</pre>
          </Card>
          {viewMode === 'read' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Card title="作品速览" span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <FieldList label="作品简介 / 核心卖点" value={profile.synopsis} accent="var(--color-accent)" />
                  <FieldList label="基本信息" value={profile.basic_info} accent="var(--color-info-light)" />
                  <FieldList label="全文规模 / 数据规划" value={profile.scale_plan} accent="var(--color-success)" />
                  <FieldList label="结局设定" value={profile.ending} accent="var(--color-warning)" />
                </div>
              </Card>
              {PROFILE_SECTION_GROUPS.map(group => {
                const entries = group.fields
                  .map(f => ({ f, value: profile[f.key] || '' }))
                  .filter(e => (e.value || '').trim());
                if (!entries.length) return null;
                return (
                  <Card key={group.title} title={group.title} subtitle={group.description}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {entries.map(({ f, value }) => <FieldList key={f.key} label={f.label} value={value} accent="var(--color-info-light)" />)}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
          <CardGrid min={340} gap={16}>
            {PROFILE_SECTION_GROUPS.map(group => {
              const groupEmpty = group.fields.every(item => !(profile[item.key] || '').trim());
              const isCollapsed = collapsed[group.title] ?? groupEmpty;
              return (
                <Card key={group.title} title={group.title} subtitle={group.description}
                  actions={<button type="button" onClick={() => setCollapsed(cur => ({ ...cur, [group.title]: !isCollapsed }))}>{isCollapsed ? '展开 ▸' : '收起 ▾'}</button>}>
                  {!isCollapsed && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                      {group.fields.map(item => (
                        <label key={item.key} style={{ display: 'grid', gap: 4, fontSize: 14, ...(item.key === 'custom_settings' ? { gridColumn: '1 / -1' } : null) }}>
                          <span style={{ color: 'var(--color-text-soft)' }}>{item.label}</span>
                          {item.key === 'custom_settings' ? (
                            <CustomSettingsEditor value={profile['custom_settings'] || '[]'} onChange={v => setProfile(current => ({ ...current, custom_settings: v }))} />
                          ) : (
                            <AutoTextarea value={profile[item.key] || ''} placeholder={item.hint} onChange={event => setProfile(current => ({ ...current, [item.key]: event.target.value }))} />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </CardGrid>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '20px 0' }}>
            <button type="button" onClick={saveProfile}>保存世界观资料</button>
          </div>
        </>
      )}
    </PageShell>
  );
};

const WorldPage: React.FC = () => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const { currentProject } = useProjectStore();
  const projectId = routeProjectId || currentProject?.id;

  if (!currentProject || !projectId) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>请先选择或创建项目。</div>;

  return currentProject.type === 'short_story' ? <WorldSimpleView /> : <WorldProfileEditor projectId={projectId} />;
};

export default WorldPage;
