/**
 * ConflictDashboard - 冲突优先级可视化面板
 * 对接后端 /conflict-engine/* API
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface ConflictItem {
  id: string; type: string; description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'unresolved' | 'resolving' | 'resolved';
  level: 'P0' | 'P1' | 'P2' | 'P3';
  location: string; suggestion?: string;
}

const LEVEL_COLORS: Record<string, string> = { P0: '#e74c3c', P1: '#f39c12', P2: '#3498db', P3: '#95a5a6' };
const PRIORITY_COLORS: Record<string, string> = { critical: '#e74c3c', high: '#f39c12', medium: '#3498db', low: '#95a5a6' };
const STATUS_COLORS: Record<string, string> = { unresolved: '#e74c3c', resolving: '#f39c12', resolved: '#2ecc71' };
const STATUS_LABELS: Record<string, string> = { unresolved: '未解决', resolving: '处理中', resolved: '已解决' };

const ConflictDashboard: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/conflicts?priority=&type=&status=&chapterIndex=&projectId=${projectId}`);
      const data = (res as any).data ?? res;
      if (data.conflicts) setConflicts(data.conflicts as ConflictItem[]);
    } catch { /* 后端未就绪 */ }
    setLoading(false);
  }, [projectId]);

  // 自动加载（首次挂载时）
  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  const resolved = conflicts.filter(c => c.status === 'resolved').length;
  const resolveRate = conflicts.length > 0 ? Math.round((resolved / conflicts.length) * 100) : 0;
  const selected = conflicts.find(c => c.id === selectedId);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 顶部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>⚡ 冲突优先级</h1>
        <button onClick={loadConflicts} disabled={loading}
          style={{ padding: '8px 16px', backgroundColor: 'rgba(233,69,96,0.12)', border: '1px solid rgba(233,69,96,0.3)', borderRadius: '6px', color: '#e94560', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {loading ? '加载中...' : '🔄 刷新'}
        </button>
      </div>

      {/* 优先级金字塔 */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
        {(['P0', 'P1', 'P2', 'P3'] as const).map(level => (
          <div key={level} style={{
            flex: level === 'P0' ? 1 : level === 'P1' ? 2 : level === 'P2' ? 3 : 4,
            padding: '8px', borderRadius: '6px', textAlign: 'center',
            backgroundColor: `${LEVEL_COLORS[level]}15`, border: `1px solid ${LEVEL_COLORS[level]}30`,
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: LEVEL_COLORS[level] }}>{level}</div>
            <div style={{ fontSize: '9px', color: '#6c6c80', marginTop: '2px' }}>
              {level === 'P0' ? '锁定正文' : level === 'P1' ? '世界观' : level === 'P2' ? '基础设定' : '未锁定正文'}
            </div>
          </div>
        ))}
      </div>

      {/* 统计 */}
      <div style={{ display: 'flex', gap: '16px' }}>
        {[
          { label: '总冲突', value: conflicts.length, color: '#eaeaea' },
          { label: '已解决', value: resolved, color: '#2ecc71' },
          { label: '解决率', value: `${resolveRate}%`, color: resolveRate > 70 ? '#2ecc71' : '#f39c12' },
          { label: '未解决', value: conflicts.filter(c => c.status !== 'resolved').length, color: '#e74c3c' },
          { label: 'P0待处理', value: conflicts.filter(c => c.level === 'P0' && c.status !== 'resolved').length, color: '#e74c3c' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, padding: '14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 列表+详情 */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'auto' }}>
          {conflicts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c6c80' }}>
              <p>暂无冲突，点击刷新按钮加载</p>
            </div>
          )}
          {conflicts.map(c => (
            <div key={c.id} onClick={() => setSelectedId(c.id)}
              style={{
                padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
                backgroundColor: selectedId === c.id ? 'rgba(233,69,96,0.08)' : 'rgba(255,255,255,0.02)',
                borderColor: selectedId === c.id ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 700, backgroundColor: `${LEVEL_COLORS[c.level]}20`, color: LEVEL_COLORS[c.level] }}>{c.level}</span>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: PRIORITY_COLORS[c.priority], flexShrink: 0 }} />
                <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: `${PRIORITY_COLORS[c.priority]}20`, color: PRIORITY_COLORS[c.priority] }}>{c.type}</span>
                <span style={{ flex: 1, fontSize: '13px', color: '#c0c0d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: `${STATUS_COLORS[c.status]}15`, color: STATUS_COLORS[c.status] }}>{STATUS_LABELS[c.status]}</span>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div style={{ width: '320px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '16px', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: '#eaeaea' }}>冲突详情</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div><span style={{ color: '#6c6c80' }}>优先级: </span><span style={{ color: LEVEL_COLORS[selected.level], fontWeight: 700 }}>{selected.level} · {selected.priority}</span></div>
              <div><span style={{ color: '#6c6c80' }}>类型: </span><span style={{ color: '#c0c0d0' }}>{selected.type}</span></div>
              <div><span style={{ color: '#6c6c80' }}>描述: </span><p style={{ margin: '4px 0 0 0', color: '#c0c0d0', lineHeight: 1.5 }}>{selected.description}</p></div>
              <div><span style={{ color: '#6c6c80' }}>位置: </span><span style={{ color: '#e94560' }}>{selected.location}</span></div>
              <div><span style={{ color: '#6c6c80' }}>状态: </span><span style={{ color: STATUS_COLORS[selected.status] }}>{STATUS_LABELS[selected.status]}</span></div>
              {selected.suggestion && (
                <div style={{ padding: '10px', backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: '6px', border: '1px solid rgba(46,204,113,0.15)' }}>
                  <span style={{ color: '#2ecc71', fontWeight: 600, fontSize: '11px' }}>建议方案: </span>
                  <p style={{ margin: '4px 0 0 0', color: '#c0c0d0', fontSize: '11px', lineHeight: 1.5 }}>{selected.suggestion}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConflictDashboard;
