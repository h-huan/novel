/**
 * WorldTabView - 长篇世界观完整视图
 * 复用现有 WorldPage 的6个Tab，优化交互
 * 用于 project.type === 'long_novel'
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganizationStore } from '../../stores/organizationStore';
import { useMapPointStore } from '../../stores/mapPointStore';
import { api } from '../../lib/api';
import { showNotification } from '../../components/common/Notification';
import MapTreeView from '../../components/world/MapTreeView';
import MapGraphView from '../../components/world/MapGraphView';
import MapDetailCard from '../../components/world/MapDetailCard';
import OrgTreeView from '../../components/world/OrgTreeView';
import OrgDetailCard from '../../components/world/OrgDetailCard';

// ============================================================
// Types
// ============================================================

interface GeographyItem {
  id: string;
  name: string;
  type: string;
  climate: string;
  resources: string[];
  description: string;
}

interface FactionItem {
  id: string;
  name: string;
  type: string;
  leader: string;
  strength: number;
  description: string;
  relationships: { target: string; type: string }[];
}

interface EraSetting {
  id: string;
  category: string;
  title: string;
  content: string;
}

interface ConstraintRule {
  id: string;
  category: string;
  rule: string;
  description: string;
  severity: 'hard' | 'soft';
}

// ============================================================
// Tab 定义
// ============================================================

interface TabDef {
  key: string;
  label: string;
  count: number;
}

const TABS: TabDef[] = [
  { key: 'geography', label: '地理', count: 0 },
  { key: 'factions', label: '势力', count: 0 },
  { key: 'social', label: '社会结构', count: 0 },
  { key: 'power', label: '力量体系', count: 0 },
  { key: 'economy', label: '经济系统', count: 0 },
  { key: 'culture', label: '文化特色', count: 0 },
  { key: 'history', label: '历史背景', count: 0 },
  { key: 'era', label: '时代', count: 0 },
  { key: 'constraints', label: '约束', count: 0 },
];

/** 通用卡片渲染 */
const SettingCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  badge?: { text: string; color: string };
}> = ({ title, subtitle, children, badge }) => (
  <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden hover:border-accent/30 transition-colors">
    <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-text-primary text-sm font-medium">{title}</h3>
        {subtitle && (
          <span className="text-text-muted text-xs">{subtitle}</span>
        )}
      </div>
      {badge && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${badge.color}`}>
          {badge.text}
        </span>
      )}
    </div>
    <div className="p-3 text-text-secondary text-xs leading-relaxed space-y-1.5">
      {children}
    </div>
  </div>
);

/** 地理卡片 */
const GeographyCard: React.FC<{ item: GeographyItem }> = ({ item }) => (
  <SettingCard
    title={item.name}
    subtitle={item.type}
    badge={{ text: item.climate.slice(0, 12) + '…', color: 'bg-blue-500/10 text-blue-400' }}
  >
    <p>{item.description}</p>
    <div className="flex flex-wrap gap-1 mt-1.5">
      {item.resources.map((r) => (
        <span key={r} className="px-1.5 py-0.5 rounded bg-bg-primary text-text-muted">
          {r}
        </span>
      ))}
    </div>
  </SettingCard>
);

/** 势力卡片 */
const FactionCard: React.FC<{ item: FactionItem }> = ({ item }) => (
  <SettingCard
    title={item.name}
    subtitle={item.type}
    badge={{
      text: `实力 ${item.strength}`,
      color:
        item.strength >= 80
          ? 'bg-accent/10 text-accent'
          : item.strength >= 50
            ? 'bg-warning/10 text-warning'
            : 'bg-success/10 text-success',
    }}
  >
    <p>{item.description}</p>
    <div className="mt-1.5">
      <span className="text-text-muted">领袖: </span>
      <span className="text-text-primary">{item.leader}</span>
    </div>
    <div className="flex flex-wrap gap-1 mt-1.5">
      {item.relationships.map((rel, idx) => (
        <span
          key={idx}
          className={`px-1.5 py-0.5 rounded text-xs ${
            rel.type === '敌对' || rel.type === '镇压'
              ? 'bg-accent/10 text-accent'
              : rel.type === '暗中合作' || rel.type === '暗中控制'
                ? 'bg-warning/10 text-warning'
                : 'bg-blue-500/10 text-blue-400'
          }`}
        >
          {rel.target} ({rel.type})
        </span>
      ))}
    </div>
  </SettingCard>
);

/** 时代设定卡片 */
const EraCard: React.FC<{ item: EraSetting }> = ({ item }) => (
  <SettingCard
    title={item.title}
    badge={{ text: item.category, color: 'bg-purple-500/10 text-purple-400' }}
  >
    <p>{item.content}</p>
  </SettingCard>
);

/** 约束规则卡片 */
const ConstraintCard: React.FC<{ item: ConstraintRule }> = ({ item }) => (
  <SettingCard
    title={item.rule}
    badge={{
      text: item.severity === 'hard' ? '硬约束' : '软约束',
      color: item.severity === 'hard' ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning',
    }}
  >
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs px-1.5 py-0.5 rounded bg-bg-card/50 text-text-muted">
        {item.category}
      </span>
    </div>
    <p>{item.description}</p>
  </SettingCard>
);

// ============================================================
// ChangePlan Modal Types & Component
// ============================================================

interface ChangeItem {
  field: string;
  oldValue: string;
  newValue: string;
}

interface ImpactAnalysis {
  affectedContent: string[];
  severity: 'low' | 'medium' | 'high';
}

interface ChangePlan {
  changes: ChangeItem[];
  impactAnalysis: ImpactAnalysis[];
  suggestions: string[];
  requiresConfirmation: boolean;
}

const ConfirmChangePlanModal: React.FC<{
  open: boolean;
  plan: ChangePlan | null;
  onConfirm: () => void;
  onReject: () => void;
  onClose: () => void;
}> = ({ open, plan, onConfirm, onReject, onClose }) => {
  if (!open || !plan) return null;

  const severityColor: Record<string, string> = {
    low: '#2ecc71',
    medium: '#f39c12',
    high: '#e74c3c',
  };
  const severityLabel: Record<string, string> = {
    low: '低影响',
    medium: '中影响',
    high: '高影响',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
    }} onClick={onClose}>
      <div style={{
        width: '640px', maxHeight: '80vh', overflow: 'auto',
        backgroundColor: '#1a1a2e', borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#eaeaea', margin: 0 }}>
            确认世界观修改
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '16px', padding: '4px' }}>✕</button>
        </div>

        {/* Changes Diff Panel */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: '#8a8aa0', fontWeight: 600, marginBottom: '10px', textTransform: 'uppercase' }}>
            修改内容对比 ({plan.changes.length} 项)
          </div>
          {plan.changes.map((item, idx) => (
            <div key={idx} style={{
              marginBottom: '10px', borderRadius: '8px', overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                padding: '6px 12px', fontSize: '11px', fontWeight: 600,
                color: '#8a8aa0', backgroundColor: 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                {item.field}
              </div>
              <div style={{ display: 'flex' }}>
                <div style={{
                  flex: 1, padding: '8px 12px', fontSize: '12px', color: '#e74c3c',
                  backgroundColor: 'rgba(231,76,60,0.06)',
                  fontFamily: 'var(--font-mono, monospace)',
                  wordBreak: 'break-all',
                }}>
                  <span style={{ fontSize: '10px', color: '#e74c3c', display: 'block', marginBottom: '2px' }}>旧值</span>
                  {item.oldValue || <span style={{ color: '#6c6c80', fontStyle: 'italic' }}>空</span>}
                </div>
                <div style={{
                  flex: 1, padding: '8px 12px', fontSize: '12px', color: '#2ecc71',
                  backgroundColor: 'rgba(46,204,113,0.06)',
                  fontFamily: 'var(--font-mono, monospace)',
                  wordBreak: 'break-all',
                }}>
                  <span style={{ fontSize: '10px', color: '#2ecc71', display: 'block', marginBottom: '2px' }}>新值</span>
                  {item.newValue}
                </div>
              </div>
            </div>
          ))}

          {/* Impact Analysis */}
          {plan.impactAnalysis.length > 0 && (
            <>
              <div style={{ fontSize: '12px', color: '#8a8aa0', fontWeight: 600, marginBottom: '10px', marginTop: '16px', textTransform: 'uppercase' }}>
                影响分析
              </div>
              {plan.impactAnalysis.map((impact, idx) => (
                <div key={idx} style={{
                  padding: '10px 12px', marginBottom: '8px', borderRadius: '8px',
                  border: `1px solid ${severityColor[impact.severity]}33`,
                  backgroundColor: `${severityColor[impact.severity]}08`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 8px', borderRadius: '10px',
                      fontSize: '10px', fontWeight: 600,
                      backgroundColor: `${severityColor[impact.severity]}20`,
                      color: severityColor[impact.severity],
                    }}>
                      {severityLabel[impact.severity]}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8a8aa0' }}>
                      {impact.affectedContent.length} 处内容受影响
                    </span>
                  </div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#c0c0d0', lineHeight: 1.8 }}>
                    {impact.affectedContent.slice(0, 5).map((content, ci) => (
                      <li key={ci}>{content}</li>
                    ))}
                    {impact.affectedContent.length > 5 && (
                      <li style={{ color: '#6c6c80' }}>...还有 {impact.affectedContent.length - 5} 项</li>
                    )}
                  </ul>
                </div>
              ))}
            </>
          )}

          {/* Suggestions */}
          {plan.suggestions.length > 0 && (
            <div style={{
              marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
              backgroundColor: 'rgba(52,152,219,0.06)', border: '1px solid rgba(52,152,219,0.15)',
            }}>
              <div style={{ fontSize: '11px', color: '#3498db', fontWeight: 600, marginBottom: '4px' }}>建议</div>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#c0c0d0', lineHeight: 1.8 }}>
                {plan.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button onClick={onReject}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)',
              backgroundColor: 'transparent', color: '#c0c0d0', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            }}>
            驳回修改
          </button>
          <button onClick={onConfirm}
            style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none',
              backgroundColor: '#e94560', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            确认修改
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

const WorldTabView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('geography');
  const [apiData, setApiData] = useState<any>(null);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [changePlan, setChangePlan] = useState<ChangePlan | null>(null);
  const [modifyLoading, setModifyLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSettingName, setNewSettingName] = useState('');
  const [newSettingDesc, setNewSettingDesc] = useState('');
  const [newSettingType, setNewSettingType] = useState('geography');

  // 地图视图状态
  const [selectedMapPointId, setSelectedMapPointId] = useState<string | null>(null);
  const [mapViewMode, setMapViewMode] = useState<'tree' | 'graph'>('graph');

  // 组织视图状态
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // 组织 Store
  const {
    organizations, tree: orgTree, fetchOrganizations, fetchTree: fetchOrgTree,
    createOrganization, updateOrganization, deleteOrganization, loading: orgLoading,
  } = useOrganizationStore();

  // 地图 Store
  const {
    mapPoints, tree: mapTree, fetchMapPoints, fetchTree: fetchMapTree,
    createMapPoint, updateMapPoint, deleteMapPoint, loading: mapLoading,
  } = useMapPointStore();

  // 获取选中的地点和组织（必须在 store hook 之后）
  const selectedMapPoint = mapPoints.find(mp => mp.id === selectedMapPointId) || null;
  const selectedOrg = organizations.find(o => o.id === selectedOrgId) || null;

  // 加载组织和地图数据
  useEffect(() => {
    if (!id) return;
    fetchOrganizations(id);
    fetchOrgTree(id);
    fetchMapPoints(id);
    fetchMapTree(id);
  }, [id]);

  // 尝试从后端加载世界观设定
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/projects/${id}/world-settings`);
        const data = res.data as any;
        const worldData = Array.isArray(data) ? data[0] : data;
        if (worldData) setApiData(worldData);
      } catch {
        // 不加载 mock 数据
      }
    };
    if (id) load();
  }, [id]);

  // 使用 API 数据 + Store 数据
  const geography = (apiData?.geography as GeographyItem[]) || [];
  const factions = (apiData?.factions as FactionItem[]) || [];
  const eraSettings = (apiData?.eraSettings as EraSetting[]) || [];
  const constraints = (apiData?.constraints as ConstraintRule[]) || [];

  // 解析 constraints JSON 中可能嵌入的 7 维度扩展数据
  let extendedDims: any = {};
  try {
    if (typeof apiData?.constraints === 'string') {
      extendedDims = JSON.parse(apiData.constraints);
    } else if (apiData?.constraints && typeof apiData.constraints === 'object') {
      // 若是对象（非数组），直接作为扩展数据
      if (!Array.isArray(apiData.constraints)) extendedDims = apiData.constraints;
    }
  } catch {}
  const powerSystemText = extendedDims?.powerSystem || '';
  const economyText = extendedDims?.economy || '';
  const socialStructureText = extendedDims?.socialStructure || '';
  const cultureText = extendedDims?.culture || '';
  const historyText = Array.isArray(extendedDims?.history)
    ? extendedDims.history.map((h:any) => typeof h === 'string' ? h : `${h.date || ''} ${h.event || ''}`).join('\n')
    : (extendedDims?.history || '');

  const tabCounts = {
    geography: mapPoints.length,
    factions: organizations.length,
    social: socialStructureText ? 1 : 0,
    power: powerSystemText ? 1 : 0,
    economy: economyText ? 1 : 0,
    culture: cultureText ? 1 : 0,
    history: historyText ? 1 : 0,
    era: eraSettings.length,
    constraints: constraints.length,
  };

  const handleCreate = async () => {
    if (!id) return;
    try {
      if (activeTab === 'factions') {
        // 创建组织
        await createOrganization({ projectId: id, name: newSettingName.trim(), type: newSettingType as any });
        await fetchOrganizations(id);
        await fetchOrgTree(id);
      } else if (activeTab === 'geography') {
        // 创建地点
        await createMapPoint({ projectId: id, name: newSettingName.trim(), level: newSettingType as any });
        await fetchMapPoints(id);
        await fetchMapTree(id);
      } else {
        // 创建世界观设定（原有逻辑）
        await api.post(`/projects/${id}/world-settings`, { name: newSettingName.trim() });
        const res = await api.get(`/projects/${id}/world-settings`);
        const data = res.data as any;
        const worldData = Array.isArray(data) ? data[0] : data;
        if (worldData) setApiData(worldData);
      }
      setNewSettingName(''); setNewSettingDesc(''); setShowCreateForm(false);
    } catch {
      showNotification('error', '创建失败');
    }
  };

  const handleGenerateChangePlan = async () => {
    if (!id) return;
    setModifyLoading(true);
    try {
      const worldSettingId = apiData?.id || id;
      const res = await api.post(`/projects/${id}/world-settings/${worldSettingId}/change-plan`, {
        changes: { name: '修改后的世界观名称', era: '修改后的时代设定' },
      });
      const plan = res.data as unknown as ChangePlan;
      setChangePlan(plan);
      setChangePlanOpen(true);
    } catch {
      const el = document.createElement('div');
      el.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-6 py-3 bg-bg-card border border-accent/30 rounded-lg text-text-primary text-sm shadow-xl';
      el.textContent = '生成修改方案失败，请重试';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    } finally {
      setModifyLoading(false);
    }
  };

  const handleConfirmChangePlan = async () => {
    if (!id) return;
    try {
      const worldSettingId = apiData?.id || id;
      await api.post(`/projects/${id}/world-settings/${worldSettingId}/apply-change-plan`, {
        planId: '1',
        confirmed: true,
      });
      setChangePlanOpen(false);
      setChangePlan(null);
      const el = document.createElement('div');
      el.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-6 py-3 bg-bg-card border border-accent/30 rounded-lg text-text-primary text-sm shadow-xl';
      el.textContent = '✅ 世界观修改已应用';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    } catch {
      const el = document.createElement('div');
      el.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-6 py-3 bg-bg-card border border-accent/30 rounded-lg text-text-primary text-sm shadow-xl';
      el.textContent = '应用修改失败';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }
  };

  const handleRejectChangePlan = () => {
    setChangePlanOpen(false);
    setChangePlan(null);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'geography':
        return (
          <div className="flex-1 flex" style={{ height: 'calc(100vh - 200px)' }}>
            {/* 左侧：树状导航 */}
            <div style={{ width: '240px', minWidth: '240px' }}>
              <MapTreeView
                tree={mapTree}
                selectedId={selectedMapPointId}
                onSelect={(id) => setSelectedMapPointId(id)}
                onCreateChild={async (parentId) => {
                  const name = prompt('请输入子节点名称:');
                  if (name && id) {
                    const parent = mapPoints.find(mp => mp.id === parentId);
                    await createMapPoint({ projectId: id, name, parentId, level: parent?.level || 'location' });
                    await fetchMapPoints(id);
                    await fetchMapTree(id);
                  }
                }}
                onDelete={async (mpId) => {
                  if (id) { await deleteMapPoint(mpId, id); await fetchMapPoints(id); await fetchMapTree(id); }
                }}
              />
            </div>

            {/* 中央：图谱可视化 */}
            <div className="flex-1">
              <MapGraphView
                tree={mapTree}
                selectedId={selectedMapPointId}
                onSelect={(mpId) => setSelectedMapPointId(mpId)}
              />
            </div>

            {/* 右侧：详情卡片 */}
            <div style={{ width: '320px', minWidth: '320px' }}>
              <MapDetailCard
                mapPoint={selectedMapPoint}
                onUpdate={async (mpId, data) => {
                  if (id) { await updateMapPoint(mpId, id, data); await fetchMapPoints(id); await fetchMapTree(id); }
                }}
                onDelete={async (mpId) => {
                  if (id) { await deleteMapPoint(mpId, id); await fetchMapPoints(id); await fetchMapTree(id); setSelectedMapPointId(null); }
                }}
                onClose={() => setSelectedMapPointId(null)}
              />
            </div>
          </div>
        );
      case 'factions':
        return (
          <div className="flex-1 flex" style={{ height: 'calc(100vh - 200px)' }}>
            {/* 左侧：组织树状导航 */}
            <div style={{ width: '240px', minWidth: '240px' }}>
              <OrgTreeView
                tree={orgTree}
                selectedId={selectedOrgId}
                onSelect={(id) => setSelectedOrgId(id)}
                onCreateChild={async (parentId) => {
                  const name = prompt('请输入子组织名称:');
                  if (name && id) {
                    await createOrganization({ projectId: id, name, parentId });
                    await fetchOrganizations(id);
                    await fetchOrgTree(id);
                  }
                }}
                onDelete={async (orgId) => {
                  if (id) { await deleteOrganization(orgId, id); await fetchOrganizations(id); await fetchOrgTree(id); }
                }}
              />
            </div>

            {/* 右侧：组织详情 */}
            <div className="flex-1">
              <OrgDetailCard
                organization={selectedOrg}
                allOrganizations={organizations}
                onUpdate={async (orgId, data) => {
                  if (id) { await updateOrganization(orgId, id, data); await fetchOrganizations(id); await fetchOrgTree(id); }
                }}
                onDelete={async (orgId) => {
                  if (id) { await deleteOrganization(orgId, id); await fetchOrganizations(id); await fetchOrgTree(id); setSelectedOrgId(null); }
                }}
                onClose={() => setSelectedOrgId(null)}
              />
            </div>
          </div>
        );
      case 'era':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {eraSettings.map((item) => (
              <EraCard key={item.id} item={item} />
            ))}
          </div>
        );
      case 'constraints':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {constraints.map((item) => (
              <ConstraintCard key={item.id} item={item} />
            ))}
          </div>
        );
      case 'power':
        return powerSystemText ? (
          <SettingCard title="⚡ 力量体系" subtitle={apiData?.era || ''}>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{powerSystemText}</p>
          </SettingCard>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6c6c80' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
            <div style={{ fontSize: '14px', color: '#8a8aa0', marginBottom: '8px' }}>暂无力量体系设定</div>
            <div style={{ fontSize: '12px', color: '#6c6c80' }}>创建项目时 AI 将自动生成本维度</div>
          </div>
        );
      case 'economy':
        return economyText ? (
          <SettingCard title="💰 经济系统" subtitle={apiData?.era || ''}>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{economyText}</p>
          </SettingCard>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6c6c80' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
            <div style={{ fontSize: '14px', color: '#8a8aa0', marginBottom: '8px' }}>暂无经济系统设定</div>
            <div style={{ fontSize: '12px', color: '#6c6c80' }}>创建项目时 AI 将自动生成本维度</div>
          </div>
        );
      case 'social':
        return socialStructureText ? (
          <SettingCard title="🏛️ 社会结构" subtitle="阶级/政治体系/权利分配">
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{socialStructureText}</p>
          </SettingCard>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6c6c80' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏛️</div>
            <div style={{ fontSize: '14px', color: '#8a8aa0', marginBottom: '8px' }}>暂无社会结构设定</div>
            <div style={{ fontSize: '12px', color: '#6c6c80' }}>创建项目时 AI 将自动生成本维度</div>
          </div>
        );
      case 'culture':
        return cultureText ? (
          <SettingCard title="🎭 文化特色" subtitle="习俗/节日/价值观/艺术">
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{cultureText}</p>
          </SettingCard>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6c6c80' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎭</div>
            <div style={{ fontSize: '14px', color: '#8a8aa0', marginBottom: '8px' }}>暂无文化特色设定</div>
            <div style={{ fontSize: '12px', color: '#6c6c80' }}>创建项目时 AI 将自动生成本维度</div>
          </div>
        );
      case 'history':
        return historyText ? (
          <SettingCard title="📜 历史背景" subtitle="重要历史事件/时间线">
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{historyText}</p>
          </SettingCard>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6c6c80' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📜</div>
            <div style={{ fontSize: '14px', color: '#8a8aa0', marginBottom: '8px' }}>暂无历史背景设定</div>
            <div style={{ fontSize: '12px', color: '#6c6c80' }}>创建项目时 AI 将自动生成本维度</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Tab 导航 */}
      <div className="flex items-center justify-between px-4 border-b border-border bg-bg-secondary">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
              <span className="ml-1 text-text-muted">({tabCounts[tab.key as keyof typeof tabCounts] ?? 0})</span>
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={handleGenerateChangePlan}
          disabled={modifyLoading}
          style={{
            padding: '6px 14px', marginRight: '8px',
            fontSize: '12px', fontWeight: 600,
            color: modifyLoading ? '#6c6c80' : '#2ecc71',
            backgroundColor: modifyLoading ? 'rgba(255,255,255,0.03)' : 'rgba(46,204,113,0.1)',
            border: '1px solid',
            borderColor: modifyLoading ? 'rgba(255,255,255,0.06)' : 'rgba(46,204,113,0.2)',
            borderRadius: '6px', cursor: modifyLoading ? 'default' : 'pointer',
            fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {modifyLoading ? '⏳ 生成中...' : '✏️ 修改世界观'}
        </button>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs
                     text-accent border border-accent/30
                     hover:bg-accent/5 hover:border-accent/50 transition-all"
        >
          + 添加
        </button>
      </div>

      {/* 创建新设定表单 */}
      {showCreateForm && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(233,69,96,0.04)' }}>
          <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '8px' }}>
            {activeTab === 'factions' ? '添加势力/组织' : activeTab === 'geography' ? '添加地点' : '添加世界观设定'}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
            <select value={newSettingType} onChange={e => setNewSettingType(e.target.value)}
              style={{ padding: '6px 10px', backgroundColor: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit' }}>
              {activeTab === 'factions' ? (
                <>
                  <option value="regime">政权</option>
                  <option value="faction">势力</option>
                  <option value="army">军队</option>
                  <option value="sect">门派</option>
                  <option value="camp">阵营</option>
                  <option value="organization">组织</option>
                  <option value="other">其他</option>
                </>
              ) : activeTab === 'geography' ? (
                <>
                  <option value="world">世界</option>
                  <option value="region">区域</option>
                  <option value="country">国家/政权</option>
                  <option value="city">城市</option>
                  <option value="location">地点</option>
                  <option value="scene">场景</option>
                </>
              ) : (
                <>
                  <option value="geography">地理</option><option value="factions">势力</option><option value="era">时代</option>
                  <option value="constraints">约束</option><option value="power">力量体系</option><option value="economy">经济</option>
                </>
              )}
            </select>
            <input value={newSettingName} onChange={e => setNewSettingName(e.target.value)}
              placeholder={activeTab === 'factions' ? '组织名称' : activeTab === 'geography' ? '地点名称' : '名称'}
              style={{ flex: 1, padding: '6px 10px', backgroundColor: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <input value={newSettingDesc} onChange={e => setNewSettingDesc(e.target.value)}
            placeholder="描述（可选）" style={{ width: '100%', padding: '6px 10px', marginBottom: '6px', backgroundColor: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleCreate} style={{ padding: '6px 16px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>创建</button>
            <button onClick={() => setShowCreateForm(false)} style={{ padding: '6px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#6c6c80', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          </div>
        </div>
      )}

      {/* Tab 内容 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="max-w-4xl mx-auto">
          {/* Tab描述 */}
          <div className="mb-4">
            {activeTab === 'geography' && (
              <p className="text-text-secondary text-xs">
                故事发生的地理空间，包括主要城市、战略要地和自然环境
              </p>
            )}
            {activeTab === 'factions' && (
              <p className="text-text-secondary text-xs">
                各方势力、阵营关系与实力对比
              </p>
            )}
            {activeTab === 'era' && (
              <p className="text-text-secondary text-xs">
                时代背景设定：科技水平、社会结构、文化思潮
              </p>
            )}
            {activeTab === 'constraints' && (
              <p className="text-text-secondary text-xs">
                只记录本书确实存在、后续创作必须遵守的世界规则。
              </p>
            )}
            {activeTab === 'power' && (
              <p className="text-text-secondary text-xs">
                力量体系设定：境界划分、规则冲突、等级递进规则
              </p>
            )}
            {activeTab === 'economy' && (
              <p className="text-text-secondary text-xs">
                经济系统设定：货币体系、贸易格局、资源分布与供需关系
              </p>
            )}
          </div>

          {renderTabContent()}
        </div>
      </div>

      {/* 影响评估 */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={async () => {
          try {
            const { api } = await import('../../lib/api');
            const res = await api.post('/chain/world-impact', {
              projectId: id, modifiedElement: '某世界观设定', oldValue: '旧值', newValue: '新值',
            });
            alert(JSON.stringify((res.data as any).suggestion || '分析完成', null, 2));
          } catch {}
        }} style={{ padding: '8px 16px', backgroundColor: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '6px', color: '#f39c12', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>
          📊 修改影响评估（修改后检测受影响的角色/章节/伏笔）
        </button>
      </div>

      {/* Change Plan Confirmation Modal */}
      <ConfirmChangePlanModal
        open={changePlanOpen}
        plan={changePlan}
        onConfirm={handleConfirmChangePlan}
        onReject={handleRejectChangePlan}
        onClose={handleRejectChangePlan}
      />
    </div>
  );
};

export default WorldTabView;
