/**
 * LocationKnowledgePanelV2 - 地点知识图谱（暗色主题）
 * profile sections 与 relations 用列表/表格展示，支持编辑与保存。
 */
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const relationTypes = [['contains','包含'],['belongs_to','隶属'],['adjacent_to','相邻'],['route_to','通往'],['hidden_path_to','隐藏路径'],['controlled_by','受控于'],['conflicts_with','冲突区'],['mirrors','镜像对应'],['foreshadows','伏笔指向'],['blocked_by','被阻断']];
const relationFields = ['target_location_id','relation_description','distance_cost','travel_time','travel_method','risk_level','access_condition'];
const labels: Record<string, string> = { target_location_id:'目标地点', relation_description:'关系说明', distance_cost:'距离成本', travel_time:'移动时间', travel_method:'交通方式', risk_level:'风险等级', access_condition:'通行条件' };
const payload = (value: any) => value?.data?.data ?? value?.data ?? value ?? {};

// 对齐《世界观模板》的地点 / 氛围 / 势力段落（聚焦 10 项）
const profileSections: Array<[string, string, string[]]> = [
  ['基础定位','定义地点类型与地理位置。',['location_type','geography_position']],
  ['描述与氛围','可直接用于正文的基础描述、氛围与关键地标。',['basic_description','atmosphere','key_landmarks']],
  ['归属与资源','明确掌控势力、资源与稀缺。',['controlling_force','resources_scarcity']],
  ['秘密与关联','隐藏秘密/伏笔钩子，以及关联人物与章节。',['secrets_foreshadow','connected_characters','connected_chapters']],
];
const profileLabels: Record<string, string> = { ...labels, location_type:'地点类型',geography_position:'地理位置与方位',basic_description:'基础描述',atmosphere:'氛围与环境',key_landmarks:'关键地点/标志物',controlling_force:'掌控势力/角色',resources_scarcity:'资源与稀缺',secrets_foreshadow:'隐藏秘密/伏笔钩子',connected_characters:'关联人物',connected_chapters:'关联章节' };

const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', fontSize: 12, fontFamily: 'inherit', outline: 'none' };

const LocationKnowledgeEditor: React.FC<{ projectId:string; mapPointId:string }> = ({ projectId, mapPointId }) => {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [relations, setRelations] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, s] = await Promise.all([
      api.get(`/projects/${projectId}/map-points/${mapPointId}/profile`),
      api.get(`/projects/${projectId}/map-points/${mapPointId}/writing-summary`),
    ]);
    setProfile(payload(p).profile || {});
    setRelations(payload(p).relations || []);
    setSummary(payload(s).summary || '');
  };
  useEffect(() => { void load(); }, [projectId, mapPointId]);

  const updateRelation = (index: number, patch: Record<string, unknown>) => setRelations(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addRelation = () => setRelations(rows => [...rows, { target_location_id: '', relation_type: 'route_to', is_hidden: false, is_one_way: false }]);
  const removeRelation = (index: number) => setRelations(rows => rows.filter((_, i) => i !== index));
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/map-points/${mapPointId}/profile`, profile);
      await api.put(`/projects/${projectId}/map-points/${mapPointId}/relations`, { relations });
      await load();
    } finally { setSaving(false); }
  };

  return (
    <section style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#131b36' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#eaeaea' }}>📍 地点知识图谱</span>
        <button type="button" onClick={save} disabled={saving} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', backgroundColor: '#e94560', color: '#fff', cursor: saving ? 'default' : 'pointer', fontSize: 12, fontWeight: 700 }}>{saving ? '保存中…' : '保存知识图谱'}</button>
      </div>

      <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.18)', backgroundColor: 'rgba(96,165,250,0.06)', color: '#c0c0d0', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 3 }}>写作摘要</div>
        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', color: '#c0c0d0' }}>{summary || '保存后生成地点写作摘要。'}</pre>
      </div>

      {profileSections.map(([title, description, fields]) => (
        <section key={title} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 3, alignSelf: 'stretch', backgroundColor: '#a855f7', borderRadius: 2 }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#eaeaea' }}>{title}</span>
            <span style={{ fontSize: 11, color: '#8a8aa0' }}>{description}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            {fields.map(field => (
              <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#a78bfa' }}>
                {profileLabels[field]}
                <textarea value={profile[field] || ''} onChange={event => setProfile({ ...profile, [field]: event.target.value })} style={{ ...fieldStyle, minHeight: 64, resize: 'vertical', lineHeight: 1.6 }} />
              </label>
            ))}
          </div>
        </section>
      ))}

      <section>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#eaeaea', marginBottom: 6 }}>地点关系</div>
        {relations.length === 0 && <p style={{ fontSize: 12, color: '#8a8aa0' }}>暂无地点关系</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {relations.map((relation, index) => (
            <article key={relation.id || index} style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
                <select value={relation.relation_type || 'route_to'} onChange={event => updateRelation(index, { relation_type: event.target.value })} style={{ ...fieldStyle, width: 'auto' }}>
                  {relationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8a8aa0' }}><input type="checkbox" checked={Boolean(relation.is_hidden)} onChange={event => updateRelation(index, { is_hidden: event.target.checked })} />隐藏</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#8a8aa0' }}><input type="checkbox" checked={Boolean(relation.is_one_way)} onChange={event => updateRelation(index, { is_one_way: event.target.checked })} />单向</label>
                <button type="button" onClick={() => removeRelation(index)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, color: '#ef4444', cursor: 'pointer', fontSize: 11, padding: '3px 8px' }}>删除</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
                {relationFields.map(field => (
                  <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#8a8aa0' }}>
                    {labels[field]}
                    <input value={relation[field] || ''} onChange={event => updateRelation(index, { [field]: event.target.value })} style={fieldStyle} />
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
        <button type="button" onClick={addRelation} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(96,165,250,0.3)', backgroundColor: 'rgba(96,165,250,0.1)', color: '#60a5fa', cursor: 'pointer', fontSize: 12 }}>+ 新增地点关系</button>
      </section>
    </section>
  );
};

export const LocationKnowledgePanelV2: React.FC<{ projectId: string; mapPointId: string }> = ({ projectId, mapPointId }) => (
  <LocationKnowledgeEditor projectId={projectId} mapPointId={mapPointId} />
);
