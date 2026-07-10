import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import WorldSimpleView from '../components/world/WorldSimpleView';
import WorldTabView from '../components/world/WorldTabView';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';

type WorldProfileFieldConfig = { key: string; label: string; hint: string; multiline?: boolean };
type WorldProfileSectionConfig = { title: string; description: string; fields: WorldProfileFieldConfig[] };

const field = (key: string): WorldProfileFieldConfig => ({ key, label: key.replaceAll('_', ' '), hint: `Define ${key.replaceAll('_', ' ')} for writing and consistency checks.`, multiline: true });
const section = (title: string, description: string, keys: string[]): WorldProfileSectionConfig => ({ title, description, fields: keys.map(field) });

export const PROFILE_SECTION_GROUPS: WorldProfileSectionConfig[] = [
  section('Story Positioning', 'Keeps the world in service of the story rather than detached setting notes.', ['story_premise', 'core_theme', 'reader_promise', 'genre_type', 'tone_style']),
  section('Era And Time', 'Controls period feeling, chronology, and the present state of the world.', ['era_background', 'time_span', 'calendar_system', 'historical_stage', 'current_world_status']),
  section('Geography', 'Constrains places, movement, resources, dangerous areas, and spatial logic.', ['geography_structure', 'major_regions', 'dangerous_zones', 'resource_distribution', 'traffic_routes', 'distance_logic']),
  section('Social Structure', 'Defines identity, class pressure, occupations, education, and mobility.', ['social_structure', 'class_system', 'family_structure', 'occupation_system', 'education_system', 'social_mobility']),
  section('Politics And Law', 'Defines power, laws, institutions, military structure, and taxation.', ['political_structure', 'ruling_system', 'law_system', 'bureaucracy', 'military_system', 'tax_system']),
  section('Economy And Resources', 'Defines currency, trade, scarcity, resource rules, and black markets.', ['economic_system', 'currency_system', 'trade_rules', 'resource_rules', 'black_market', 'scarcity_logic']),
  section('Power System', 'Sets power sources, levels, limits, costs, growth, and failure boundaries.', ['power_system', 'power_source', 'power_levels', 'power_cost', 'power_limit', 'power_growth', 'power_taboo', 'power_failure_case']),
  section('Technology System', 'Sets technology level, special technology, boundaries, and costs.', ['technology_system', 'technology_level', 'special_technology', 'technology_limit', 'technology_cost']),
  section('Culture And Daily Life', 'Makes the setting observable through everyday customs and expression.', ['culture_daily_life', 'food_clothing_housing', 'festival_customs', 'religion_belief', 'language_naming_rules', 'etiquette_rules']),
  section('Law And Taboos', 'Defines public order, forbidden behavior, punishment, and hidden rules.', ['law_and_taboo', 'forbidden_behaviors', 'punishment_rules', 'public_order', 'hidden_rules', 'unspoken_rules']),
  section('History And Truths', 'Records history, disasters, wars, succession, and concealed truths.', ['history_events', 'major_disasters', 'founding_events', 'wars', 'dynasty_changes', 'lost_truths']),
  section('Forces And Conflicts', 'Defines forces, relationships, resources, secrets, and active conflict.', ['major_forces', 'force_relations', 'force_conflicts', 'force_resources', 'force_secrets']),
  section('World Hooks', 'Records the conflict source, mysteries, and long-term truth direction.', ['world_hooks', 'main_conflict_source', 'hidden_truth', 'final_truth_direction', 'world_mystery']),
  section('AI Writing Constraints', 'Tells AI what must be obeyed, may change, and is easy to break.', ['forbidden_world_rules', 'must_obey_rules', 'can_change_rules', 'easy_to_break_points', 'current_chapter_usage']),
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
    setStatus('Creating world setting...');
    try {
      const response = await api.post(`/projects/${projectId}/world-settings`, { name: 'Main world setting', era: '' });
      const created = payload<any>(response);
      await loadWorldSettings();
      if (created?.id) { setSelectedId(created.id); await loadProfile(created.id); }
      setStatus('World setting created.');
    } catch { setStatus('Could not create a world setting.'); }
  };

  const saveProfile = async () => {
    if (!selectedId) return;
    setStatus('Saving...');
    try {
      const response = await api.put(`/projects/${projectId}/world-settings/${selectedId}/profile`, profile);
      const saved = payload<any>(response);
      setProfile(saved.profile || profile);
      const summaryResponse = await api.get(`/projects/${projectId}/world-settings/${selectedId}/writing-summary`);
      setSummary(payload<any>(summaryResponse).summary || '');
      setStatus('Saved.');
    } catch { setStatus('Save failed. Please try again.'); }
  };

  return <section style={{ padding: '20px', maxWidth: 1180, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: 0 }}>Worldbuilding Profile</h2><p style={{ color: '#6c6c80', margin: '6px 0 0' }}>Persisted world rules used by writing, retrieval, and post-write checks.</p></div>
      {worldSettings.length > 0 && <div style={{ display: 'flex', gap: 8 }}><select value={selectedId} onChange={async event => { setSelectedId(event.target.value); await loadProfile(event.target.value); }}>{worldSettings.map(item => <option key={item.id} value={item.id}>{item.name || 'Untitled world'}</option>)}</select><button type="button" onClick={saveProfile}>Save profile</button></div>}
    </div>
    {loading ? <p>Loading world profile...</p> : worldSettings.length === 0 ? <div style={{ padding: 20, border: '1px solid #d8d8e2', marginTop: 16 }}><p>No world setting exists for this project yet.</p><button type="button" onClick={createWorldSetting}>Create world setting</button></div> : <>
      {status && <p style={{ color: status === 'Saved.' ? '#15803d' : '#6c6c80' }}>{status}</p>}
      <pre style={{ whiteSpace: 'pre-wrap', padding: 14, background: '#f6f7fb', border: '1px solid #e4e5ed', maxHeight: 220, overflow: 'auto' }}>{summary || 'Writing summary will appear after the profile is saved.'}</pre>
      {PROFILE_SECTION_GROUPS.map(group => <section key={group.title} style={{ marginTop: 18, borderTop: '1px solid #e4e5ed', paddingTop: 16 }}><h3 style={{ margin: 0 }}>{group.title}</h3><p style={{ color: '#6c6c80', margin: '6px 0 12px' }}>{group.description}</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>{group.fields.map(item => <label key={item.key} style={{ display: 'grid', gap: 5, fontSize: 13 }}><span>{item.label}</span><textarea rows={3} value={profile[item.key] || ''} placeholder={item.hint} onChange={event => setProfile(current => ({ ...current, [item.key]: event.target.value }))} /></label>)}</div></section>)}
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '20px 0' }}><button type="button" onClick={saveProfile}>Save profile</button></div>
    </>}
  </section>;
};

const WorldPage: React.FC = () => {
  const { id: routeProjectId } = useParams<{ id: string }>();
  const { currentProject } = useProjectStore();
  const projectId = routeProjectId || currentProject?.id;

  if (!currentProject || !projectId) return <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80', fontSize: '14px' }}>Please select or create a project first.</div>;

  return <><div style={{ padding: '16px 20px 0' }}><WritingQualityContextBanner /></div><WorldProfileEditor projectId={projectId} />{currentProject.type === 'short_story' ? <WorldSimpleView /> : <WorldTabView />}</>;
};

export default WorldPage;
