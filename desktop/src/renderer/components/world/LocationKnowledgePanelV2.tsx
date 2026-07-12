import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

const relationTypes = [['contains','包含'],['belongs_to','隶属'],['adjacent_to','相邻'],['route_to','通往'],['hidden_path_to','隐藏路径'],['controlled_by','受控于'],['conflicts_with','冲突区'],['mirrors','镜像对应'],['foreshadows','伏笔指向'],['blocked_by','被阻断']];
const relationFields = ['target_location_id','relation_description','distance_cost','travel_time','travel_method','risk_level','access_condition'];
const labels: Record<string, string> = { target_location_id:'目标地点', relation_description:'关系说明', distance_cost:'距离成本', travel_time:'移动时间', travel_method:'交通方式', risk_level:'风险等级', access_condition:'通行条件' };
const payload = (value: any) => value?.data?.data ?? value?.data ?? value ?? {};

export const LocationKnowledgePanelV2: React.FC<{ projectId: string; mapPointId: string }> = ({ projectId, mapPointId }) => {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [relations, setRelations] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => { const [profileRes, summaryRes] = await Promise.all([api.get(`/projects/${projectId}/map-points/${mapPointId}/profile`), api.get(`/projects/${projectId}/map-points/${mapPointId}/writing-summary`)]); setProfile(payload(profileRes).profile || {}); setRelations(payload(profileRes).relations || []); setSummary(payload(summaryRes).summary || ''); };
  useEffect(() => { void load(); }, [projectId, mapPointId]);
  const updateRelation = (index: number, patch: Record<string, unknown>) => setRelations(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const addRelation = () => setRelations(rows => [...rows, { target_location_id: '', relation_type: 'route_to', is_hidden: false, is_one_way: false }]);
  const removeRelation = (index: number) => setRelations(rows => rows.filter((_, i) => i !== index));
  const save = async () => { setNotice('正在保存...'); const saved = await api.put(`/projects/${projectId}/map-points/${mapPointId}/profile`, profile); await api.put(`/projects/${projectId}/map-points/${mapPointId}/relations`, { relations }); setProfile(payload(saved).profile || profile); await load(); setNotice('已保存。'); };
  return <section style={{ padding: 16, borderTop: '1px solid #ddd' }}><h2>地点知识图谱</h2><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{summary || '保存后生成地点写作摘要。'}</pre><h3>地点关系</h3><p>维护层级、路线、控制和隐藏入口关系。</p>{relations.length === 0 && <p>暂无地点关系</p>}{relations.map((relation, index) => <article key={relation.id || index} style={{ border: '1px solid #ddd', padding: 10, marginBottom: 10 }}><strong>关系 {index + 1}</strong><label style={{ display: 'block' }}>关系类型<select value={relation.relation_type || 'route_to'} onChange={event => updateRelation(index, { relation_type: event.target.value })}>{relationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{relationFields.map(field => <label key={field} style={{ display: 'block' }}>{labels[field]}<input value={relation[field] || ''} onChange={event => updateRelation(index, { [field]: event.target.value })} /></label>)}<label><input type="checkbox" checked={Boolean(relation.is_hidden)} onChange={event => updateRelation(index, { is_hidden: event.target.checked })} /> 隐藏关系</label><label><input type="checkbox" checked={Boolean(relation.is_one_way)} onChange={event => updateRelation(index, { is_one_way: event.target.checked })} /> 单向关系</label><button type="button" onClick={() => removeRelation(index)}>删除关系</button></article>)}<button type="button" onClick={addRelation}>新增地点关系</button><button type="button" onClick={save}>保存地点关系</button>{notice && <p>{notice}</p>}</section>;
};
