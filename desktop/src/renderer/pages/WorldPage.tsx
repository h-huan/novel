import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import WorldSimpleView from '../components/world/WorldSimpleView';
import WorldTabView from '../components/world/WorldTabView';
import { PageShell, Card, CardGrid, EmptyHint, darkField } from '../components/common/LayoutKit';

type WorldProfileFieldConfig = { key: string; label: string; hint: string; multiline?: boolean };
type WorldProfileSectionConfig = { title: string; description: string; fields: WorldProfileFieldConfig[] };

// 地基型世界观：对齐《核心设定.txt》+《世界观模板》。15 个板块，覆盖简介/基本信息/系统机制/命名/规模/结局/层级规则等"地基"内容。
const WORLD_FIELD_LABELS: Record<string, string> = {
  synopsis: '作品简介 / 核心卖点',
  basic_info: '基本信息（书名 / 类型 / 时代 / 结局 / 字数目标 / 标签）',
  era: '时代（时间线 / 历史背景）',
  locations: '地点（主要区域 / 关键地点）',
  atmosphere_tone: '氛围基调（整体氛围与基调）',
  rules: '规则（核心规则一 / 二 / 三）',
  social_structure: '社会结构（政治势力 / 经济资源 / 宗教信仰）',
  tech_supernatural: '科技 / 超自然 / 力量体系（体系名称 / 能力来源 / 约束代价）',
  system_mechanics: '系统机制（核心机制 / 金手指 / 特殊设定）',
  culture_customs: '文化风俗（语言习俗 / 禁忌）',
  naming_rules: '命名规则（人名 / 地名 / 组织名规律）',
  scale_plan: '全文规模 / 数据规划（人口 / 势力 / 资源等量化）',
  ending: '结局设定（结局类型 / 走向 / 收束方式）',
  hierarchy_rules: '核心层级规则（最高优先级：世界观 > 大纲 > 正文）',
  supplementary: '补充说明',
};
const WORLD_FIELD_META: Record<string, { label: string; hint: string }> = Object.fromEntries(Object.entries(WORLD_FIELD_LABELS).map(([key, label]) => [key, { label, hint: `按《核心设定.txt》地基型与《世界观模板》写下与本书剧情有关的${label}；不需要时可以留空。` }]));
const field = (key: string): WorldProfileFieldConfig => ({ key, ...(WORLD_FIELD_META[key] || { label: key, hint: '写下与本书有关的设定；不需要时可以留空。' }), multiline: true });
const section = (title: string, description: string, keys: string[]): WorldProfileSectionConfig => ({ title, description, fields: keys.map(field) });

// 地基型分组：把"地基"板块（简介/基本信息/系统/命名/规模/结局/层级）与"世界"板块（时代/地点/基调/规则/社会/体系/文化）分层组织
export const PROFILE_SECTION_GROUPS: WorldProfileSectionConfig[] = [
  section('作品地基', '小说的��：简介、类型、结局方向与规模规划，约束一切后续设定。', ['synopsis', 'basic_info', 'scale_plan', 'ending']),
  section('时代与地点', '时间线与历史背景，以及主要区域与关键地点，奠定年代感与空间逻辑。', ['era', 'locations']),
  section('基调与规则', '全书整体氛围，以及世界运行必须遵守的核心规则。', ['atmosphere_tone', 'rules']),
  section('社会与体系', '政治势力、经济与信仰格局；力量/科技体系与特殊系统机制（含金手指）。', ['social_structure', 'tech_supernatural', 'system_mechanics']),
  section('文化与命名', '语言习俗与禁忌；人名、地名、组织名的统一命名规律。', ['culture_customs', 'naming_rules']),
  section('核心层级规则', '最高优先级纪律：世界观 > 大纲 > 正文。所有生成都必须服从已保存的世界观。', ['hierarchy_rules']),
  section('补充说明', '其他未在以上分类中覆盖的设定。', ['supplementary']),
];

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

  const loadProfile = useCallback(async (worldSettingId: string) => {
    if (!worldSettingId) return;
    const [profileResponse, summaryResponse] = await Promise.all([
      api.get(`/projects/${projectId}/world-settings/${worldSettingId}/profile`),
      api.get(`/projects/${projectId}/world-settings/${worldSettingId}/writing-summary`),
    ]);
    setProfile(payload<any>(profileResponse).profile || {});
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
    try {
      const response = await api.put(`/projects/${projectId}/world-settings/${selectedId}/profile`, profile);
      const saved = payload<any>(response);
      setProfile(saved.profile || profile);
      const summaryResponse = await api.get(`/projects/${projectId}/world-settings/${selectedId}/writing-summary`);
      setSummary(payload<any>(summaryResponse).summary || '');
      setStatus('已保存。');
    } catch { setStatus('保存失败，请重试。'); }
  };

  return (
    <PageShell
      title="世界观"
      subtitle="写作和前后矛盾检查会引用这些规则；与本书无关的部分可以留空。"
      actions={worldSettings.length > 0 ? (
        <>
          <select value={selectedId} onChange={async event => { setSelectedId(event.target.value); await loadProfile(event.target.value); }}>
            {worldSettings.map(item => <option key={item.id} value={item.id}>{item.name || '未命名世界观'}</option>)}
          </select>
          <button type="button" onClick={saveProfile}>保存世界观资料</button>
        </>
      ) : undefined}
    >
      {loading ? <p style={{ color: '#8a8aa0' }}>正在加载世界观资料...</p> : worldSettings.length === 0 ? (
        <EmptyHint>当前项目还没有世界观。<div style={{ marginTop: 12 }}><button type="button" onClick={createWorldSetting}>创建世界观</button></div></EmptyHint>
      ) : (
        <>
          {status && <p style={{ color: status === '已保存。' ? '#34d399' : '#8a8aa0', margin: '0 0 12px' }}>{status}</p>}
          <Card title="写作摘要" span style={{ marginBottom: 16 }}>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#c0c0d0', fontSize: 13, lineHeight: 1.6, maxHeight: 400, overflow: 'auto' }}>{summary || '保存后，这里会汇总正文真正需要遵守的世界规则。'}</pre>
          </Card>
          <CardGrid min={340} gap={16}>
            {PROFILE_SECTION_GROUPS.map(group => (
              <Card key={group.title} title={group.title} subtitle={group.description}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                  {group.fields.map(item => {
                    const contentLen = (profile[item.key] || '').length;
                    const rows = Math.max(3, Math.min(14, Math.ceil(contentLen / 65)));
                    return (
                    <label key={item.key} style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                      <span style={{ color: '#c0c0d0' }}>{item.label}</span>
                      <textarea rows={rows} value={profile[item.key] || ''} placeholder={item.hint} onChange={event => setProfile(current => ({ ...current, [item.key]: event.target.value }))} style={darkField} />
                    </label>
                    );
                  })}
                </div>
              </Card>
            ))}
          </CardGrid>
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

  if (!currentProject || !projectId) return <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80', fontSize: '14px' }}>请先选择或创建项目。</div>;

  return currentProject.type === 'short_story' ? <WorldSimpleView /> : <WorldProfileEditor projectId={projectId} />;
};

export default WorldPage;
