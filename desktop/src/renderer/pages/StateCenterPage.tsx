import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

type StateTab = 'all' | 'pending' | 'confirmed' | 'conflict' | 'stale' | 'rejected' | 'archived' | 'character' | 'impact' | 'context';

interface StateItem {
  id: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  title?: string | null;
  summary: string;
  content?: string | null;
  status: string;
  authority?: string;
  source?: string;
  confidence?: number;
  tags?: string[];
  sourceChapterId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ImpactReport {
  id: string;
  summary: string;
  riskLevel: string;
  status: string;
  createdAt: string;
  items?: Array<{
    id: string;
    impactType: string;
    targetType: string;
    targetLabel?: string;
    summary: string;
    severity: string;
    status: string;
    actionHint?: string;
    payload?: Record<string, any>;
  }>;
}

const apiPayload = (response: any) => response?.data ?? response;

const statusLabel: Record<string, string> = {
  pending: '待确稿',
  confirmed: '已确稿',
  conflict: '冲突',
  stale: '过期',
  rejected: '已驳回',
  archived: '已归档',
};

const statusColor: Record<string, string> = {
  pending: '#d9822b',
  confirmed: '#1f8a5b',
  conflict: '#c0392b',
  stale: '#7f5fc4',
  rejected: '#7f8c8d',
  archived: '#607d8b',
};

const tabs: Array<{ key: StateTab; label: string }> = [
  { key: 'all', label: '全部状态' },
  { key: 'pending', label: '待确稿' },
  { key: 'confirmed', label: '已确稿' },
  { key: 'conflict', label: '冲突' },
  { key: 'stale', label: '过期' },
  { key: 'character', label: '角色成长' },
  { key: 'impact', label: '影响分析' },
  { key: 'context', label: '写作上下文' },
];

const StateCenterPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<StateTab>('pending');
  const [items, setItems] = useState<StateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [reports, setReports] = useState<ImpactReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ImpactReport | null>(null);
  const [contextText, setContextText] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [evolutionEvents, setEvolutionEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadStateItems = useCallback(async () => {
    if (!projectId) return;
    const res = await api.get(`/projects/${projectId}/state/items?status=all&limit=300`);
    const payload = apiPayload(res) as any;
    const nextItems = payload.items || [];
    setItems(nextItems);
    setSelectedId(current => current || nextItems[0]?.id || '');
  }, [projectId]);

  const loadImpactReports = useCallback(async () => {
    if (!projectId) return;
    const res = await api.get(`/projects/${projectId}/state/impact/reports?limit=50`);
    const payload = apiPayload(res) as any;
    setReports(payload.reports || []);
  }, [projectId]);

  const loadContextPreview = useCallback(async () => {
    if (!projectId) return;
    const res = await api.get(`/projects/${projectId}/state/context-preview`);
    const payload = apiPayload(res) as any;
    setContextText(payload.context?.contextText || '');
  }, [projectId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      await Promise.all([loadStateItems(), loadImpactReports(), loadContextPreview()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '状态中心加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadStateItems, loadImpactReports, loadContextPreview]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return items;
    if (activeTab === 'character') return items.filter(item => item.targetType === 'character');
    if (['impact', 'context'].includes(activeTab)) return items;
    return items.filter(item => item.status === activeTab);
  }, [activeTab, items]);

  const selectedItem = items.find(item => item.id === selectedId) || filteredItems[0];

  const counts = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const todayAdded = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return items.filter(item => (item.createdAt || '').startsWith(today)).length;
  }, [items]);

  const actOnItem = async (itemId: string, action: 'confirm' | 'reject' | 'archive') => {
    if (!projectId) return;
    setMessage('');
    try {
      await api.post(`/projects/${projectId}/state/items/${itemId}/${action}`, {});
      await loadAll();
      setMessage(action === 'confirm' ? '状态已确稿并写回长期状态' : action === 'reject' ? '状态已驳回' : '状态已归档');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  };

  const analyzeImpact = async () => {
    if (!projectId || !selectedItem) return;
    setMessage('');
    try {
      const res = await api.post(`/projects/${projectId}/state/impact/analyze`, {
        sourceStateItemId: selectedItem.id,
        targetType: selectedItem.targetType,
        targetId: selectedItem.targetId,
        summary: `复核 ${selectedItem.targetLabel || selectedItem.title || selectedItem.targetType} 的状态影响`,
      });
      const payload = apiPayload(res) as any;
      setSelectedReport(payload.report);
      setActiveTab('impact');
      await loadImpactReports();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '影响分析失败');
    }
  };

  const openImpactReport = async (reportId: string) => {
    if (!projectId) return;
    const res = await api.get(`/projects/${projectId}/state/impact/reports/${reportId}`);
    setSelectedReport((apiPayload(res) as any).report);
  };

  const applyImpactItem = async (impactItemId: string) => {
    if (!projectId) return;
    try {
      await api.post(`/projects/${projectId}/state/impact/items/${impactItemId}/apply`, {});
      if (selectedReport) await openImpactReport(selectedReport.id);
      await loadImpactReports();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '应用影响项失败');
    }
  };

  const loadCharacterEvolution = useCallback(async () => {
    if (!projectId || !characterId.trim()) return;
    try {
      const res = await api.get(`/projects/${projectId}/state/characters/${encodeURIComponent(characterId.trim())}/evolution`);
      setEvolutionEvents((apiPayload(res) as any).events || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '角色成长加载失败');
    }
  }, [projectId, characterId]);

  // 角色 ID 变化时自动加载成长时间线（useCallback 保证 loadCharacterEvolution 引用稳定）
  useEffect(() => {
    if (characterId.trim()) {
      void loadCharacterEvolution();
    }
  }, [characterId, loadCharacterEvolution]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <button style={styles.backButton} onClick={() => navigate(`/project/${projectId}`)}>← 返回项目</button>
          <h1 style={styles.title}>状态确稿中心</h1>
        </div>
        <button style={styles.primaryButton} onClick={() => void loadAll()} disabled={loading}>
          {loading ? '刷新中...' : '刷新状态'}
        </button>
      </header>

      <section style={styles.summaryRow}>
        <SummaryCard label="待确稿" value={counts.pending || 0} color="#d9822b" />
        <SummaryCard label="已确稿" value={counts.confirmed || 0} color="#1f8a5b" />
        <SummaryCard label="冲突" value={counts.conflict || 0} color="#c0392b" />
        <SummaryCard label="过期" value={counts.stale || 0} color="#7f5fc4" />
        <SummaryCard label="今日新增" value={todayAdded} color="#2f80ed" />
      </section>

      {message && <div style={styles.notice}>{message}</div>}

      <nav style={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            style={{ ...styles.tab, ...(activeTab === tab.key ? styles.activeTab : {}) }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'impact' ? (
        <ImpactPanel
          reports={reports}
          selectedReport={selectedReport}
          onOpen={openImpactReport}
          onApply={applyImpactItem}
        />
      ) : activeTab === 'context' ? (
        <ContextPanel contextText={contextText} items={items} />
      ) : activeTab === 'character' ? (
        <CharacterEvolutionPanel
          items={filteredItems}
          selectedItem={selectedItem}
          characterId={characterId}
          events={evolutionEvents}
          onSelect={setSelectedId}
          onCharacterIdChange={setCharacterId}
          onLoadEvolution={loadCharacterEvolution}
        />
      ) : (
        <main style={styles.mainGrid}>
          <section style={styles.listPanel}>
            {filteredItems.length === 0 ? (
              <div style={styles.empty}>当前没有状态条目</div>
            ) : filteredItems.map(item => (
              <button
                key={item.id}
                style={{ ...styles.itemButton, ...(selectedItem?.id === item.id ? styles.itemButtonActive : {}) }}
                onClick={() => setSelectedId(item.id)}
              >
                <span style={{ ...styles.badge, background: statusColor[item.status] || '#607d8b' }}>
                  {statusLabel[item.status] || item.status}
                </span>
                <strong style={styles.itemTitle}>{item.targetLabel || item.title || item.targetType}</strong>
                <span style={styles.itemMetaLine}>
                  {item.authority || '-'} · {item.source || '-'} · {item.targetType}
                  {entersWritingContext(item) ? ' · 进入写作上下文' : ' · 不进入写作上下文'}
                </span>
                {Boolean(item.tags?.length) && <span style={styles.tagRow}>{item.tags!.map(tag => <b key={tag}>{tag}</b>)}</span>}
                <span style={styles.itemSummary}>{item.summary}</span>
              </button>
            ))}
          </section>

          <StateDetailPanel
            item={selectedItem}
            onConfirm={() => selectedItem && actOnItem(selectedItem.id, 'confirm')}
            onReject={() => selectedItem && actOnItem(selectedItem.id, 'reject')}
            onArchive={() => selectedItem && actOnItem(selectedItem.id, 'archive')}
            onAnalyzeImpact={analyzeImpact}
          />
        </main>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={styles.summaryCard}>
    <span style={{ ...styles.summaryDot, background: color }} />
    <span style={styles.summaryLabel}>{label}</span>
    <strong style={styles.summaryValue}>{value}</strong>
  </div>
);

const StateDetailPanel: React.FC<{
  item?: StateItem;
  onConfirm: () => void;
  onReject: () => void;
  onArchive: () => void;
  onAnalyzeImpact: () => void;
}> = ({ item, onConfirm, onReject, onArchive, onAnalyzeImpact }) => {
  if (!item) return <section style={styles.detailPanel}><div style={styles.empty}>选择一条状态查看详情</div></section>;

  return (
    <section style={styles.detailPanel}>
      <div style={styles.detailHeader}>
        <div>
          <span style={{ ...styles.badge, background: statusColor[item.status] || '#607d8b' }}>
            {statusLabel[item.status] || item.status}
          </span>
          <h2 style={styles.detailTitle}>{item.targetLabel || item.title || item.targetType}</h2>
        </div>
        <div style={styles.actionGroup}>
          <button style={styles.primaryButton} onClick={onConfirm} disabled={item.status === 'confirmed'}>确稿</button>
          <button style={styles.secondaryButton} onClick={onReject} disabled={item.status === 'rejected'}>驳回</button>
          <button style={styles.secondaryButton} onClick={onArchive}>归档</button>
        </div>
      </div>
      <div style={styles.metaGrid}>
        <Meta label="目标类型" value={item.targetType} />
        <Meta label="权威级别" value={item.authority || '-'} />
        <Meta label="来源" value={item.source || '-'} />
        <Meta label="置信度" value={typeof item.confidence === 'number' ? `${Math.round(item.confidence * 100)}%` : '-'} />
        <Meta label="写作上下文" value={entersWritingContext(item) ? '进入' : '不进入'} />
      </div>
      {Boolean(item.tags?.length) && (
        <div style={styles.detailTags}>{item.tags!.map(tag => <span key={tag}>{tag}</span>)}</div>
      )}
      <h3 style={styles.sectionTitle}>状态摘要</h3>
      <p style={styles.contentText}>{item.summary}</p>
      {item.content && item.content !== item.summary && (
        <>
          <h3 style={styles.sectionTitle}>详细内容</h3>
          <p style={styles.contentText}>{item.content}</p>
        </>
      )}
      <div style={styles.actionFooter}>
        <button style={styles.secondaryButton} onClick={onAnalyzeImpact}>分析修改影响</button>
      </div>
    </section>
  );
};

const Meta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={styles.metaItem}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ImpactPanel: React.FC<{
  reports: ImpactReport[];
  selectedReport: ImpactReport | null;
  onOpen: (id: string) => void;
  onApply: (id: string) => void;
}> = ({ reports, selectedReport, onOpen, onApply }) => (
  <main style={styles.mainGrid}>
    <section style={styles.listPanel}>
      {reports.length === 0 ? <div style={styles.empty}>暂无影响分析报告</div> : reports.map(report => (
        <button key={report.id} style={styles.itemButton} onClick={() => onOpen(report.id)}>
          <span style={{ ...styles.badge, background: report.riskLevel === 'high' ? '#c0392b' : '#7f8c8d' }}>{report.riskLevel}</span>
          <strong style={styles.itemTitle}>{report.summary}</strong>
          <span style={styles.itemSummary}>{report.status}</span>
        </button>
      ))}
    </section>
    <section style={styles.detailPanel}>
      {!selectedReport ? <div style={styles.empty}>选择报告查看影响项</div> : (
        <>
          <h2 style={styles.detailTitle}>{selectedReport.summary}</h2>
          <div style={styles.metaGrid}>
            <Meta label="风险等级" value={selectedReport.riskLevel} />
            <Meta label="状态" value={selectedReport.status} />
          </div>
          {(selectedReport.items || []).map(item => (
            <div key={item.id} style={styles.impactItem}>
              <strong>{item.targetLabel || item.targetType}</strong>
              <p>{item.summary}</p>
              <span>{item.actionHint}</span>
              <div style={styles.impactFlags}>
                <span>{item.payload?.locked ? '锁定正文阻断' : '未锁定'}</span>
                <span>{item.payload?.canAutoSync ? '可自动同步' : '需人工复核'}</span>
                <span>{item.payload?.needsReview ? 'needs_review' : '已处理'}</span>
              </div>
              <button style={styles.secondaryButton} onClick={() => onApply(item.id)} disabled={item.status === 'applied'}>
                {item.status === 'applied' ? '已应用' : '标记已处理'}
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  </main>
);

const ContextPanel: React.FC<{ contextText: string; items: StateItem[] }> = ({ contextText, items }) => (
  <section style={styles.detailPanel}>
    <h2 style={styles.detailTitle}>写作上下文预览</h2>
    <div style={styles.contextLayers}>
      <Layer title="已确稿状态｜必须遵守" items={items.filter(item => item.status === 'confirmed' && item.authority === 'hard_fact')} />
      <Layer title="待确认状态｜可参考但不要写死" items={items.filter(item => item.status === 'pending' && item.authority === 'soft_candidate')} />
      <Layer title="冲突提醒｜需要避免" items={items.filter(item => item.status === 'conflict' && item.authority === 'warning')} />
      <Layer title="过期风险｜需要复核" items={items.filter(item => item.status === 'stale' && item.authority === 'warning')} />
    </div>
    <pre style={styles.contextBox}>{contextText || '暂无状态上下文'}</pre>
  </section>
);

const Layer: React.FC<{ title: string; items: StateItem[] }> = ({ title, items }) => (
  <div style={styles.layerBox}>
    <strong>{title}</strong>
    <span>{items.length} 项</span>
  </div>
);

const CharacterEvolutionPanel: React.FC<{
  items: StateItem[];
  selectedItem?: StateItem;
  characterId: string;
  events: any[];
  onSelect: (id: string) => void;
  onCharacterIdChange: (value: string) => void;
  onLoadEvolution: () => void;
}> = ({ items, characterId, events, onSelect, onCharacterIdChange, onLoadEvolution }) => (
  <main style={styles.mainGrid}>
    <section style={styles.listPanel}>
      {items.map(item => (
        <button
          key={item.id}
          style={styles.itemButton}
          onClick={() => {
            onSelect(item.id);
            onCharacterIdChange(item.targetId || item.targetLabel || '');
          }}
        >
          <strong style={styles.itemTitle}>{item.targetLabel || item.title || '角色状态'}</strong>
          {Boolean(item.tags?.length) && <span style={styles.tagRow}>{item.tags!.map(tag => <b key={tag}>{tag}</b>)}</span>}
          <span style={styles.itemSummary}>{item.summary}</span>
        </button>
      ))}
    </section>
    <section style={styles.detailPanel}>
      <h2 style={styles.detailTitle}>角色成长时间线</h2>
      <div style={styles.inlineForm}>
        <input
          style={styles.input}
          value={characterId}
          onChange={event => onCharacterIdChange(event.target.value)}
          placeholder="输入角色ID或角色名"
        />
        <button style={styles.primaryButton} onClick={onLoadEvolution}>加载</button>
      </div>
      {events.length === 0 ? <div style={styles.empty}>暂无角色成长事件</div> : events.map(event => (
        <div key={event.id} style={styles.timelineItem}>
          <span style={styles.timelineChapter}>第{event.chapterIndex || '?'}章</span>
          <strong>{event.title}</strong>
          <p>{event.summary}</p>
          {Boolean(event.delta?.tags?.length) && <span style={styles.tagRow}>{event.delta.tags.map((tag: string) => <b key={tag}>{tag}</b>)}</span>}
          {event.delta?.conflictWithPersona && <p style={styles.warningText}>这个角色当前不会自然做出这个选择。如果坚持，需要补充动机、事件或过渡剧情。</p>}
          {event.delta?.needsTransition && <p style={styles.warningText}>需要补充过渡剧情来衔接角色状态变化。</p>}
          {event.delta?.needsReview && <p style={styles.warningText}>该状态变化需要复核，确认是否与角色核心设定一致。</p>}
          {event.delta?.evidenceEvent && (
            <div style={styles.evidenceBox}>
              <span style={{ fontWeight: 600 }}>依据事件：</span>
              <span>{String(event.delta.evidenceEvent).slice(0, 200)}</span>
            </div>
          )}
        </div>
      ))}
    </section>
  </main>
);

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f7f8', color: '#1f2933', padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  backButton: { border: 'none', background: 'transparent', color: '#52606d', cursor: 'pointer', padding: 0, marginBottom: 8 },
  title: { margin: 0, fontSize: 28, fontWeight: 700 },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(100px, 1fr))', gap: 12, marginBottom: 16 },
  summaryCard: { background: '#fff', border: '1px solid #d9e2ec', borderRadius: 8, padding: 14, display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 10, alignItems: 'center' },
  summaryDot: { width: 10, height: 10, borderRadius: '50%' },
  summaryLabel: { color: '#52606d', fontSize: 13 },
  summaryValue: { fontSize: 22 },
  notice: { background: '#fff7e6', border: '1px solid #f0b429', color: '#7c4d00', padding: '10px 12px', borderRadius: 6, marginBottom: 12 },
  tabs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  tab: { border: '1px solid #cbd5e1', background: '#fff', color: '#334e68', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' },
  activeTab: { background: '#1f2933', color: '#fff', borderColor: '#1f2933' },
  mainGrid: { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' },
  listPanel: { background: '#fff', border: '1px solid #d9e2ec', borderRadius: 8, padding: 10, minHeight: 520 },
  detailPanel: { background: '#fff', border: '1px solid #d9e2ec', borderRadius: 8, padding: 18, minHeight: 520 },
  itemButton: { width: '100%', border: '1px solid #e4e7eb', background: '#fff', borderRadius: 6, padding: 12, textAlign: 'left', cursor: 'pointer', marginBottom: 8, display: 'grid', gap: 6 },
  itemButtonActive: { borderColor: '#2f80ed', boxShadow: '0 0 0 2px rgba(47, 128, 237, 0.12)' },
  badge: { color: '#fff', fontSize: 12, borderRadius: 999, padding: '3px 8px', width: 'fit-content' },
  itemTitle: { fontSize: 14, color: '#1f2933' },
  itemSummary: { color: '#52606d', fontSize: 13, lineHeight: 1.45, maxHeight: 38, overflow: 'hidden' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', borderBottom: '1px solid #e4e7eb', paddingBottom: 14 },
  detailTitle: { margin: '8px 0 0', fontSize: 22 },
  actionGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  primaryButton: { border: 'none', background: '#1f8a5b', color: '#fff', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' },
  secondaryButton: { border: '1px solid #cbd5e1', background: '#fff', color: '#334e68', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, marginTop: 16 },
  metaItem: { background: '#f5f7f8', borderRadius: 6, padding: 10, display: 'grid', gap: 4, color: '#52606d', fontSize: 12 },
  sectionTitle: { margin: '20px 0 8px', fontSize: 15 },
  contentText: { whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334e68' },
  actionFooter: { marginTop: 20 },
  empty: { color: '#7b8794', padding: 24, textAlign: 'center' },
  impactItem: { border: '1px solid #e4e7eb', borderRadius: 6, padding: 12, marginTop: 10, display: 'grid', gap: 8 },
  contextBox: { background: '#111827', color: '#d1fae5', padding: 16, borderRadius: 6, minHeight: 420, whiteSpace: 'pre-wrap', lineHeight: 1.6, overflow: 'auto' },
  inlineForm: { display: 'flex', gap: 8, margin: '12px 0 16px' },
  input: { flex: 1, border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px' },
  timelineItem: { borderLeft: '3px solid #1f8a5b', padding: '8px 0 8px 12px', marginBottom: 10 },
  timelineChapter: { display: 'block', color: '#52606d', fontSize: 12, marginBottom: 4 },
  itemMetaLine: { color: '#7b8794', fontSize: 12 },
  tagRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  detailTags: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  impactFlags: { display: 'flex', gap: 8, flexWrap: 'wrap', color: '#52606d', fontSize: 12 },
  contextLayers: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 10, margin: '14px 0' },
  layerBox: { background: '#f5f7f8', border: '1px solid #d9e2ec', borderRadius: 6, padding: 10, display: 'grid', gap: 6 },
  warningText: { color: '#9b2c2c', background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 6, padding: 8 },
  evidenceBox: { background: '#f0f4f8', border: '1px solid #d9e2ec', borderRadius: 6, padding: 8, marginTop: 8, fontSize: 13, color: '#334e68' },
};

function entersWritingContext(item: StateItem) {
  return ['confirmed', 'pending', 'conflict', 'stale'].includes(item.status) && item.authority !== 'excluded';
}

export default StateCenterPage;
