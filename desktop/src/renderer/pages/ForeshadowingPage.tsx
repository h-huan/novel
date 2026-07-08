/**
 * ForeshadowingPage - 伏笔看板
 * 对接后端 /foreshadowing/* API
 * 状态机: buried → pending → recovered | cancelled
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useForeshadowingStore } from '../stores/foreshadowingStore';
import { useProjectStore } from '../stores/projectStore';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';

type ForeshadowingStatus = 'buried' | 'pending' | 'recovered' | 'cancelled';

interface ForeshadowingItem {
  id: string;
  content: string;
  status: ForeshadowingStatus;
  type: string;
  importance: 1 | 2 | 3;
  scope: 'global' | 'volume' | 'chapter';
  buriedChapterIndex: number;
  plannedRecoveryChapterIndex: number;
  relatedCharacterIds: string[];
  notes?: string;
}

const STATUS_LABELS: Record<ForeshadowingStatus, string> = {
  buried: '埋设中', pending: '待回收', recovered: '已回收', cancelled: '已取消',
};
const STATUS_COLORS: Record<ForeshadowingStatus, string> = {
  buried: '#3498db', pending: '#f39c12', recovered: '#2ecc71', cancelled: '#95a5a6',
};

const ForeshadowingPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const store = useForeshadowingStore();
  const { currentProject, selectProject } = useProjectStore();

  const [filter, setFilter] = useState<ForeshadowingStatus | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'volume' | 'chapter'>('all');
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [reversals, setReversals] = useState<any[]>([]);
  const [newItem, setNewItem] = useState({ content: '', type: 'plot', importance: 2 as 1|2|3, scope: 'chapter' as const, buriedChapterIndex: 0, plannedRecoveryChapterIndex: 0, relatedCharacterIds: '' });

  // 从 store 读取伏笔列表（Foreshadowing 类型来自 shared，运行时可能有额外字段如 scope/notes）
  const items = store.foreshadowings as unknown as ForeshadowingItem[];

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // 使用 store 获取伏笔（有缓存），项目详情从 projectStore
      await Promise.all([
        store.fetchForeshadowings(projectId),
        selectProject(projectId),
      ]);

      // 加载反转数据（从 projectStore 的 currentProject.settings.reversals）
      try {
        const settings = (currentProject as any)?.settings;
        if (settings) {
          const parsed = typeof settings === 'string' ? JSON.parse(settings) : settings;
          if (Array.isArray(parsed?.reversals)) setReversals(parsed.reversals);
          else if (Array.isArray(parsed?.outlineReversals)) setReversals(parsed.outlineReversals);
        }
      } catch {}
    } catch { /* mock fallback */ }
    setLoading(false);
  }, [projectId, store, selectProject, currentProject]);

  // 自动加载数据（首次挂载时）
  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (id: string, action: 'activate' | 'recover' | 'cancel') => {
    try {
      await api.post(`/projects/${projectId}/foreshadowings/${id}/${action}`, {});
      // 状态变更后重新从 store 加载
      store.fetchForeshadowings(projectId || '', true);
    } catch { /* fallback */ }
  };

  const createItem = async () => {
    try {
      const res = await api.post(`/projects/${projectId}/foreshadowings`, {
        projectId, content: newItem.content, type: newItem.type, importance: newItem.importance,
        scope: newItem.scope,
        buriedChapterIndex: newItem.buriedChapterIndex, plannedRecoveryChapterIndex: newItem.plannedRecoveryChapterIndex,
        relatedCharacterIds: newItem.relatedCharacterIds.split(',').map(s => s.trim()).filter(Boolean),
        status: 'buried',
      });
      // 创建后重新加载 store
      store.fetchForeshadowings(projectId || '', true);
      setShowCreate(false);
      setNewItem({ content: '', type: 'plot', importance: 2, scope: 'chapter', buriedChapterIndex: 0, plannedRecoveryChapterIndex: 0, relatedCharacterIds: '' });
    } catch { /* fallback */ }
  };

  const deleteItem = async (id: string) => {
    try { await api.delete(`/projects/${projectId}/foreshadowings/${id}`); } catch { /* */ }
    store.fetchForeshadowings(projectId || '', true);
  };

  const updateContent = async (id: string) => {
    try {
      await api.put(`/projects/${projectId}/foreshadowings/${id}`, { content: editContent });
      store.fetchForeshadowings(projectId || '', true);
    } catch { /* */ }
    setEditingId(null);
  };

  const filtered = items.filter(i =>
    (filter === 'all' || i.status === filter) &&
    (scopeFilter === 'all' || i.scope === scopeFilter)
  );
  const stats = {
    all: items.length, buried: items.filter(i => i.status === 'buried').length,
    pending: items.filter(i => i.status === 'pending').length,
    recovered: items.filter(i => i.status === 'recovered').length,
    global: items.filter(i => i.scope === 'global').length,
    volume: items.filter(i => i.scope === 'volume').length,
    chapter: items.filter(i => i.scope === 'chapter').length,
  };

  return (
    <div style={{ padding: '20px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <WritingQualityContextBanner />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>🔍 伏笔看板</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={{ padding: '8px 14px', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#8a8aa0', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>🔄</button>
          <button onClick={() => setShowCreate(true)} style={{ padding: '8px 14px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ 新建伏笔</button>
        </div>
      </div>

      {/* 统计 */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {[{ k: 'all', l: '全部', c: '#eaeaea' }, { k: 'buried', l: '埋设中', c: '#3498db' }, { k: 'pending', l: '待回收', c: '#f39c12' }, { k: 'recovered', l: '已回收', c: '#2ecc71' }].map(s => (
          <div key={s.k} onClick={() => setFilter(s.k as any)} style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
            backgroundColor: filter === s.k ? `${s.c}15` : 'rgba(255,255,255,0.02)',
            border: '1px solid', borderColor: filter === s.k ? `${s.c}30` : 'rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: s.c }}>{(stats as any)[s.k]}</div>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginTop: '2px' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* 作用范围筛选 + 统计 */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[{ k: 'all', l: '全部范围', c: '#eaeaea' }, { k: 'global', l: '贯穿全文', c: '#e94560' }, { k: 'volume', l: '卷级', c: '#3b82f6' }, { k: 'chapter', l: '章节级', c: '#a855f7' }].map(s => (
          <button key={s.k} onClick={() => setScopeFilter(s.k as any)} style={{
            flex: 1, padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
            backgroundColor: scopeFilter === s.k ? `${s.c}12` : 'rgba(255,255,255,0.02)',
            border: '1px solid', borderColor: scopeFilter === s.k ? `${s.c}30` : 'rgba(255,255,255,0.06)',
            color: scopeFilter === s.k ? s.c : '#8a8aa0',
          }}>{s.l} <span style={{ fontSize: '10px', opacity: 0.7 }}>{(stats as any)[s.k]}</span></button>
        ))}
      </div>

      {genProgress && (
        <div style={{ padding: '8px 14px', backgroundColor: genProgress.startsWith('🔍') ? 'rgba(243,156,18,0.08)' : 'rgba(46,204,113,0.08)', borderRadius: '6px', color: genProgress.startsWith('🔍') ? '#f39c12' : '#2ecc71', fontSize: '12px' }}>
          {genProgress}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
        {[
          { key: 'global', title: '全书伏笔', hint: '贯穿全文，像核心功法、血脉、身份谜团，跨卷埋设与回收', color: '#e94560' },
          { key: 'volume', title: '卷级伏笔', hint: '服务一卷或一条阶段主线，常与组织、地图区域、阶段反派绑定', color: '#3b82f6' },
          { key: 'chapter', title: '章节/场景伏笔', hint: '服务几章内的小回收，用具体物件、动作和错位细节建立读者记忆', color: '#a855f7' },
        ].map(card => {
          const count = (stats as any)[card.key] || 0;
          return (
            <button key={card.key} type="button" onClick={() => setScopeFilter(card.key as any)} style={{
              textAlign: 'left', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: scopeFilter === card.key ? `${card.color}14` : 'rgba(255,255,255,0.025)',
              border: '1px solid', borderColor: scopeFilter === card.key ? `${card.color}40` : 'rgba(255,255,255,0.06)',
              color: '#c0c0d0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: card.color, fontWeight: 700 }}>{card.title}</span>
                <span style={{ fontSize: '12px', color: '#eaeaea', fontWeight: 700 }}>{count}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#8a8aa0', lineHeight: 1.5 }}>{card.hint}</div>
            </button>
          );
        })}
      </div>

      {/* 新建表单 */}
      {showCreate && (
        <div style={{ padding: '14px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea value={newItem.content} onChange={e => setNewItem(p => ({ ...p, content: e.target.value }))} placeholder="伏笔内容..."
            style={{ padding: '8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', minHeight: '40px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={newItem.buriedChapterIndex} onChange={e => setNewItem(p => ({ ...p, buriedChapterIndex: parseInt(e.target.value) || 0 }))} placeholder="埋设章节(数字)" type="number" style={{ flex: 1, padding: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }} />
            <input value={newItem.plannedRecoveryChapterIndex} onChange={e => setNewItem(p => ({ ...p, plannedRecoveryChapterIndex: parseInt(e.target.value) || 0 }))} placeholder="计划回收章节(数字)" type="number" style={{ flex: 1, padding: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={newItem.scope} onChange={e => setNewItem(p => ({ ...p, scope: e.target.value as any }))}
              style={{ padding: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}>
              <option value="global">贯穿全文</option>
              <option value="volume">卷级</option>
              <option value="chapter">章节级</option>
            </select>
            <select value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value }))}
              style={{ padding: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}>
              <option value="plot">剧情伏笔</option>
              <option value="character">人设伏笔</option>
              <option value="setting">设定伏笔</option>
              <option value="object">道具伏笔</option>
            </select>
            <select value={newItem.importance} onChange={e => setNewItem(p => ({ ...p, importance: parseInt(e.target.value) as 1|2|3 }))}
              style={{ padding: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}>
              <option value={1}>⭐</option><option value={2}>⭐⭐</option><option value={3}>⭐⭐⭐</option>
            </select>
            <input value={newItem.relatedCharacterIds} onChange={e => setNewItem(p => ({ ...p, relatedCharacterIds: e.target.value }))} placeholder="关联角色(逗号分隔)" style={{ flex: 1, padding: '6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={createItem} style={{ padding: '6px 14px', backgroundColor: '#e94560', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>添加</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '6px 10px', backgroundColor: 'transparent', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>✕</button>
          </div>
        </div>
      )}

      {/* 伏笔列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#8a8aa0', fontSize: '13px' }}>
            ⏳ 加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
            <p style={{ fontSize: '14px', color: '#8a8aa0', marginBottom: '4px' }}>
              {items.length === 0 ? '暂无伏笔' : '没有匹配的伏笔'}
            </p>
            <p style={{ fontSize: '12px', color: '#6c6c80', marginBottom: '16px' }}>
              {items.length === 0
                ? '请在灵感发现中创建项目时自动生成，或手动新建'
                : '尝试切换筛选条件'}
            </p>
            {items.length === 0 && (
              <button onClick={() => setShowCreate(true)} style={{
                padding: '8px 18px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px',
                color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                + 新建伏笔
              </button>
            )}
          </div>
        ) : (
          filtered.map(item => (
          <div key={item.id} style={{
            padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
            backgroundColor: expandedId === item.id ? `${STATUS_COLORS[item.status]}08` : 'rgba(255,255,255,0.02)',
            borderColor: expandedId === item.id ? `${STATUS_COLORS[item.status]}25` : 'rgba(255,255,255,0.06)',
          }} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: item.importance >= 3 ? '14px' : item.importance === 2 ? '12px' : '10px' }}>
                {'⭐'.repeat(item.importance)}
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: `${STATUS_COLORS[item.status]}15`, color: STATUS_COLORS[item.status], fontWeight: 600 }}>
                {STATUS_LABELS[item.status]}
              </span>
              <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '9px', backgroundColor: item.scope === 'global' ? 'rgba(233,69,96,0.1)' : item.scope === 'volume' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)', color: item.scope === 'global' ? '#e94560' : item.scope === 'volume' ? '#60a5fa' : '#6c6c80', fontWeight: 500 }}>
                {item.scope === 'global' ? '全文' : item.scope === 'volume' ? '卷级' : '章节'}
              </span>
              {editingId === item.id ? (
                <input value={editContent} onChange={e => setEditContent(e.target.value)} autoFocus
                  style={{ flex: 1, padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(233,69,96,0.3)', borderRadius: '4px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }}
                  onKeyDown={e => { if (e.key === 'Enter') updateContent(item.id); if (e.key === 'Escape') setEditingId(null); }} />
              ) : (
                <span style={{ flex: 1, fontSize: '13px', color: '#c0c0d0', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setEditContent(item.content); }}>{item.content}</span>
              )}
              <span style={{ fontSize: '11px', color: '#6c6c80' }}>#{item.buriedChapterIndex} → #{item.plannedRecoveryChapterIndex}</span>
              {item.status === 'buried' && item.plannedRecoveryChapterIndex > 0 && (
                <span style={{ padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontSize: '10px', fontWeight: 600 }}>
                  ⏰ 第{item.plannedRecoveryChapterIndex}章回收
                </span>
              )}
            </div>

            {expandedId === item.id && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '11px', color: '#8a8aa0' }}>类型: {item.type} | 关联角色: {item.relatedCharacterIds?.join(', ') || '无'}</div>
                {item.notes && <p style={{ margin: 0, fontSize: '12px', color: '#c0c0d0' }}>{item.notes}</p>}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {item.status === 'buried' && (
                    <button onClick={(e) => { e.stopPropagation(); changeStatus(item.id, 'activate'); }}
                      style={{ padding: '4px 10px', backgroundColor: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '4px', color: '#f39c12', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      标记待回收
                    </button>
                  )}
                  {item.status === 'pending' && (
                    <button onClick={(e) => { e.stopPropagation(); changeStatus(item.id, 'recover'); }}
                      style={{ padding: '4px 10px', backgroundColor: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: '4px', color: '#2ecc71', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      标记已回收
                    </button>
                  )}
                  {item.status !== 'cancelled' && (
                    <button onClick={(e) => { e.stopPropagation(); changeStatus(item.id, 'cancel'); }}
                      style={{ padding: '4px 10px', backgroundColor: 'rgba(149,165,166,0.1)', border: '1px solid rgba(149,165,166,0.2)', borderRadius: '4px', color: '#95a5a6', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      取消
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                    style={{ padding: '4px 10px', backgroundColor: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: '4px', color: '#e74c3c', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                    删除
                  </button>
                </div>
              </div>
            )}
          </div>
        )))}
      </div>

      {/* 伏笔回收推荐 */}
      <button onClick={async () => {
        try {
          const res = await api.post('/chain/foreshadow-recommend', {
            projectId, currentChapter: 5,
            foreshadowing: items.map(i => ({ id: i.id, content: i.content, buriedChapterIndex: i.buriedChapterIndex })),
          });
          const data = res.data as any;
          if (data.recommendations && data.recommendations.length > 0) {
            setGenProgress?.(`🔍 发现 ${data.recommendations.length} 个可回收伏笔`);
          } else {
            setGenProgress?.('✅ 暂无需要回收的伏笔');
          }
        } catch {}
      }} style={{ padding: '8px 16px', backgroundColor: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '6px', color: '#f39c12', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', width: 'fit-content' }}>
        🔍 伏笔回收推荐
      </button>

      {/* 递进反转规划 */}
      <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(155,89,182,0.05)', borderRadius: '8px', border: '1px solid rgba(155,89,182,0.1)' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#c0c0d0', marginBottom: '8px' }}>
          🔄 递进反转规划 {reversals.length > 0 ? `(${reversals.length}次→逐步加深)` : ''}
        </div>
        {reversals.length > 0 ? (
          reversals.map((r: any, i: number) => (
            <div key={i} style={{
              padding: '10px', marginBottom: '6px', borderRadius: '8px',
              backgroundColor: `rgba(233,69,96,${0.04 + i * 0.02})`,
              border: `1px solid rgba(233,69,96,${0.08 + i * 0.03})`,
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#e94560', marginBottom: '6px' }}>
                反转 {i + 1} · {r.position || r.id || ''}
                <span style={{ color: '#6c6c80', fontSize: '11px', marginLeft: '8px' }}>
                  {i === 0 ? '引导悬念' : i === reversals.length - 1 ? '终局真相' : '层层递进'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '11px' }}>
                <span style={{ color: '#6c6c80' }}>表面真相: <span style={{ color: '#c0c0d0' }}>{r.surfaceTruth || r.surface || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>实际真相: <span style={{ color: '#e94560' }}>{r.actualTruth || r.truth || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>支撑伏笔: <span style={{ color: '#f59e0b' }}>{r.foreshadowRef || r.foreshadowId || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>揭露方式: <span style={{ color: '#c0c0d0' }}>{r.revealMethod || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>对主角打击: <span style={{ color: '#e74c3c' }}>{r.impactOnCharacter || r.impact || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>对读者冲击: <span style={{ color: '#f39c12' }}>{r.impactOnReader || r.readerShock || ''}</span></span>
                {(r.changesUnderstanding !== undefined) && (
                  <span style={{ color: '#6c6c80', gridColumn: '1 / -1', fontSize: '10px' }}>
                    改变前文理解: {r.changesUnderstanding ? '✅ 是' : '否'}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '16px', color: '#6c6c80', fontSize: '12px' }}>
            暂无递进反转规划数据
            <br />
            <span style={{ fontSize: '11px' }}>在大纲生成时会自动生成反转表，或前往大纲页手动添加</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForeshadowingPage;
