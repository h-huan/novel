import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import WorldSimpleView from '../components/world/WorldSimpleView';
import WorldTabView from '../components/world/WorldTabView';

type WorldProfileFieldConfig = { key: string; label: string; hint: string; multiline?: boolean };
type WorldProfileSectionConfig = { title: string; description: string; fields: WorldProfileFieldConfig[] };

const WORLD_FIELD_LABELS: Record<string, string> = {
  story_premise: '故事前提', core_theme: '核心主题', reader_promise: '读者期待', genre_type: '类型定位', tone_style: '基调风格',
  era_background: '时代背景', time_span: '时间跨度', calendar_system: '历法系统', historical_stage: '历史阶段', current_world_status: '当前世界状态',
  geography_structure: '地理结构', major_regions: '主要地区', dangerous_zones: '危险区域', resource_distribution: '资源分布', traffic_routes: '交通路线', distance_logic: '距离逻辑',
  social_structure: '社会结构', class_system: '阶层系统', family_structure: '家族结构', occupation_system: '职业体系', education_system: '教育体系', social_mobility: '阶层流动',
  political_structure: '政治结构', ruling_system: '统治体系', law_system: '法律系统', bureaucracy: '官僚体系', military_system: '军事体系', tax_system: '税收体系',
  economic_system: '经济系统', currency_system: '货币系统', trade_rules: '交易规则', resource_rules: '资源规则', black_market: '黑市', scarcity_logic: '稀缺逻辑',
  power_system: '力量体系', power_source: '力量来源', power_levels: '力量等级', power_cost: '力量代价', power_limit: '力量限制', power_growth: '成长路径', power_taboo: '力量禁忌', power_failure_case: '失败案例',
  technology_system: '技术体系', technology_level: '技术水平', special_technology: '特殊技术', technology_limit: '技术限制', technology_cost: '技术代价',
  culture_daily_life: '文化日常', food_clothing_housing: '衣食住行', festival_customs: '节日习俗', religion_belief: '宗教信仰', language_naming_rules: '语言命名', etiquette_rules: '礼仪规则',
  law_and_taboo: '法律禁忌', forbidden_behaviors: '禁止行为', punishment_rules: '惩罚规则', public_order: '公共秩序', hidden_rules: '隐藏规则', unspoken_rules: '潜规则',
  history_events: '历史事件', major_disasters: '主要灾难', founding_events: '建国事件', wars: '战争', dynasty_changes: '王朝更替', lost_truths: '失落真相',
  major_forces: '主要势力', force_relations: '势力关系', force_conflicts: '势力冲突', force_resources: '势力资源', force_secrets: '势力秘密',
  world_hooks: '世界钩子', main_conflict_source: '主冲突来源', hidden_truth: '隐藏真相', final_truth_direction: '最终真相方向', world_mystery: '世界谜团',
  forbidden_world_rules: '禁止世界观规则', must_obey_rules: '必须遵守', can_change_rules: '允许变化', easy_to_break_points: '容易写崩点', current_chapter_usage: '本章可用',
};
const WORLD_FIELD_META: Record<string, { label: string; hint: string }> = Object.fromEntries(Object.entries(WORLD_FIELD_LABELS).map(([key, label]) => [key, { label, hint: `写下与本书剧情有关的${label}；不需要时可以留空。` }]));
const field = (key: string): WorldProfileFieldConfig => ({ key, ...(WORLD_FIELD_META[key] || { label: key, hint: '写下与本书有关的设定；不需要时可以留空。' }), multiline: true });
const section = (title: string, description: string, keys: string[]): WorldProfileSectionConfig => ({ title, description, fields: keys.map(field) });

export const PROFILE_SECTION_GROUPS: WorldProfileSectionConfig[] = [
  section('故事定位', '明确世界观服务的故事与读者期待。', ['story_premise', 'core_theme', 'reader_promise', 'genre_type', 'tone_style']),
  section('时代与时间', '控制时代感、时间跨度与当前局势。', ['era_background', 'time_span', 'calendar_system', 'historical_stage', 'current_world_status']),
  section('地理结构', '约束地点、移动、资源和空间逻辑。', ['geography_structure', 'major_regions', 'dangerous_zones', 'resource_distribution', 'traffic_routes', 'distance_logic']),
  section('社会结构', '定义身份、阶层、职业、教育与社会压力。', ['social_structure', 'class_system', 'family_structure', 'occupation_system', 'education_system', 'social_mobility']),
  section('政治法律', '定义权力、法律、军政制度和冲突代价。', ['political_structure', 'ruling_system', 'law_system', 'bureaucracy', 'military_system', 'tax_system']),
  section('经济资源', '定义货币、交易、资源、黑市和稀缺性。', ['economic_system', 'currency_system', 'trade_rules', 'resource_rules', 'black_market', 'scarcity_logic']),
  section('力量体系', '约束力量来源、等级、代价、限制与禁忌。', ['power_system', 'power_source', 'power_levels', 'power_cost', 'power_limit', 'power_growth', 'power_taboo', 'power_failure_case']),
  section('技术体系', '明确技术水平、边界和使用代价。', ['technology_system', 'technology_level', 'special_technology', 'technology_limit', 'technology_cost']),
  section('文化日常', '通过生活细节让世界真实可感。', ['culture_daily_life', 'food_clothing_housing', 'festival_customs', 'religion_belief', 'language_naming_rules', 'etiquette_rules']),
  section('法律禁忌', '定义公共秩序、禁令、惩罚与潜规则。', ['law_and_taboo', 'forbidden_behaviors', 'punishment_rules', 'public_order', 'hidden_rules', 'unspoken_rules']),
  section('历史真相', '承载历史遗留问题、战争和失落真相。', ['history_events', 'major_disasters', 'founding_events', 'wars', 'dynasty_changes', 'lost_truths']),
  section('势力冲突', '定义势力关系、资源、秘密和长期对抗。', ['major_forces', 'force_relations', 'force_conflicts', 'force_resources', 'force_secrets']),
  section('世界钩子', '记录主冲突、谜团与最终真相方向。', ['world_hooks', 'main_conflict_source', 'hidden_truth', 'final_truth_direction', 'world_mystery']),
  section('创作边界', '记录不可违背、允许变化和本章会用到的规则。', ['forbidden_world_rules', 'must_obey_rules', 'can_change_rules', 'easy_to_break_points', 'current_chapter_usage']),
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
    setStatus('正在创建世界观设定...');
    try {
      const response = await api.post(`/projects/${projectId}/world-settings`, { name: '主世界观设定', era: '' });
      const created = payload<any>(response);
      await loadWorldSettings();
      if (created?.id) { setSelectedId(created.id); await loadProfile(created.id); }
      setStatus('世界观设定已创建。');
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

  return <section style={{ padding: '20px', maxWidth: 1180, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: 0 }}>世界观创作资料</h2><p style={{ color: '#6c6c80', margin: '6px 0 0' }}>写作和前后矛盾检查会引用这些规则；与本书无关的部分可以留空。</p></div>
      {worldSettings.length > 0 && <div style={{ display: 'flex', gap: 8 }}><select value={selectedId} onChange={async event => { setSelectedId(event.target.value); await loadProfile(event.target.value); }}>{worldSettings.map(item => <option key={item.id} value={item.id}>{item.name || '未命名世界观'}</option>)}</select><button type="button" onClick={saveProfile}>保存世界观资料</button></div>}
    </div>
    {loading ? <p>正在加载世界观资料...</p> : worldSettings.length === 0 ? <div style={{ padding: 20, border: '1px solid #d8d8e2', marginTop: 16 }}><p>当前项目还没有世界观设定。</p><button type="button" onClick={createWorldSetting}>创建世界观设定</button></div> : <>
      {status && <p style={{ color: status === '已保存。' ? '#15803d' : '#6c6c80' }}>{status}</p>}
      <pre style={{ whiteSpace: 'pre-wrap', padding: 14, background: '#f6f7fb', border: '1px solid #e4e5ed', maxHeight: 220, overflow: 'auto' }}>{summary || '保存后，这里会汇总正文真正需要遵守的世界规则。'}</pre>
      {PROFILE_SECTION_GROUPS.map(group => <section key={group.title} style={{ marginTop: 18, borderTop: '1px solid #e4e5ed', paddingTop: 16 }}><h3 style={{ margin: 0 }}>{group.title}</h3><p style={{ color: '#6c6c80', margin: '6px 0 12px' }}>{group.description}</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>{group.fields.map(item => <label key={item.key} style={{ display: 'grid', gap: 5, fontSize: 13 }}><span>{item.label}</span><textarea rows={3} value={profile[item.key] || ''} placeholder={item.hint} onChange={event => setProfile(current => ({ ...current, [item.key]: event.target.value }))} /></label>)}</div></section>)}
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '20px 0' }}><button type="button" onClick={saveProfile}>保存世界观资料</button></div>
    </>}
  </section>;
};

const WorldPage: React.FC = () => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const { currentProject } = useProjectStore();
  const projectId = routeProjectId || currentProject?.id;

  if (!currentProject || !projectId) return <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80', fontSize: '14px' }}>请先选择或创建项目。</div>;

  return currentProject.type === 'short_story' ? <WorldSimpleView /> : <WorldTabView />;
};

export default WorldPage;
