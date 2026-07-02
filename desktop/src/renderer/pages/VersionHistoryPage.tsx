/**
 * VersionHistoryPage - 版本管理页面
 * 显示版本列表+版本对比+恢复功能
 */
import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Version { id: string; title: string; timestamp: string; size: number; isCurrent?: boolean; }

const VersionHistoryPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [chapterId, setChapterId] = useState('');
  const [versions, setVersions] = useState<Version[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<any>(null);
  const [tab, setTab] = useState<'history' | 'diff'>('history');

  const loadHistory = useCallback(async () => {
    if (!chapterId.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/chain/version/history', { projectId, chapterId });
      const data = res.data as any;
      if (data.versions) setVersions(data.versions as Version[]);
    } catch { /* */ }
    setLoading(false);
  }, [projectId, chapterId]);

  const createSnapshot = useCallback(async () => {
    if (!chapterId.trim() || !content.trim()) return;
    setLoading(true);
    try {
      await api.post('/chain/version/snapshot', { projectId, chapterId, content, title: `手动保存 ${new Date().toLocaleTimeString()}` });
      await loadHistory();
      setContent('');
    } catch { /* */ }
    setLoading(false);
  }, [projectId, chapterId, content, loadHistory]);

  const restoreVersion = useCallback(async (versionId: string) => {
    if (!confirm('确定要恢复到该版本吗？当前内容将被覆盖。')) return;
    try {
      const res = await api.post('/chain/version/restore', { projectId, chapterId, versionId });
      alert((res.data as any).message || '已恢复');
      await loadHistory();
    } catch { /* */ }
  }, [projectId, chapterId, loadHistory]);

  const compareVersions = useCallback(async () => {
    if (!selectedA || !selectedB) return;
    setLoading(true);
    try {
      const res = await api.post('/chain/version/diff', { projectId, chapterId, versionA: selectedA, versionB: selectedB });
      setDiffResult((res.data as any).diff || (res.data as any));
      setTab('diff');
    } catch { /* */ }
    setLoading(false);
  }, [projectId, chapterId, selectedA, selectedB]);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', maxWidth: '700px' }}>
      <h1 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>📋 版本管理</h1>

      {/* 输入章节ID */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={chapterId} onChange={e => setChapterId(e.target.value)} placeholder="章节ID"
          style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={loadHistory} disabled={loading}
          style={{ padding: '8px 16px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {loading ? '...' : '加载历史'}
        </button>
      </div>

      {/* 创建快照 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="输入要保存为版本快照的章节内容..."
          style={{ flex: 1, padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', minHeight: '50px', lineHeight: 1.5 }} />
        <button onClick={createSnapshot} disabled={loading || !chapterId}
          style={{ padding: '8px 16px', backgroundColor: 'rgba(46,204,113,0.15)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: '6px', color: '#2ecc71', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          + 创建快照
        </button>
      </div>

      {/* Tab切换 */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '14px' }}>
        <button onClick={() => setTab('history')} style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: tab === 'history' ? '#e94560' : '#8a8aa0', borderBottom: tab === 'history' ? '2px solid #e94560' : '2px solid transparent' }}>版本历史</button>
        <button onClick={() => setTab('diff')} disabled={!diffResult} style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: tab === 'diff' ? '#e94560' : !diffResult ? '#3a3a50' : '#8a8aa0', borderBottom: tab === 'diff' ? '2px solid #e94560' : '2px solid transparent' }}>版本对比</button>
      </div>

      {/* 版本历史 */}
      {tab === 'history' && (
        <div>
          {versions.length === 0 && <p style={{ color: '#6c6c80', fontSize: '13px', textAlign: 'center', padding: '30px' }}>暂无版本历史，输入章节ID后点击加载</p>}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <select value={selectedA || ''} onChange={e => setSelectedA(e.target.value || null)} style={{ flex: 1, padding: '6px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">选择版本A(旧)</option>
              {versions.map(v => <option key={v.id} value={v.id}>{v.title} ({new Date(v.timestamp).toLocaleDateString()})</option>)}
            </select>
            <select value={selectedB || ''} onChange={e => setSelectedB(e.target.value || null)} style={{ flex: 1, padding: '6px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">选择版本B(新)</option>
              {versions.map(v => <option key={v.id} value={v.id}>{v.title} ({new Date(v.timestamp).toLocaleDateString()})</option>)}
            </select>
            <button onClick={compareVersions} disabled={!selectedA || !selectedB}
              style={{ padding: '6px 14px', backgroundColor: '#3498db', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              对比
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {versions.map(v => (
              <div key={v.id} style={{
                padding: '10px 14px', borderRadius: '8px', border: '1px solid',
                backgroundColor: v.isCurrent ? 'rgba(46,204,113,0.06)' : 'rgba(255,255,255,0.02)',
                borderColor: v.isCurrent ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: v.isCurrent ? '#2ecc71' : '#eaeaea' }}>{v.title}</span>
                    <span style={{ fontSize: '11px', color: '#6c6c80', marginLeft: '8px' }}>{new Date(v.timestamp).toLocaleString()}</span>
                    <span style={{ fontSize: '11px', color: '#6c6c80', marginLeft: '8px' }}>{v.size}字</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {v.isCurrent && <span style={{ padding: '2px 8px', backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: '4px', fontSize: '10px', color: '#2ecc71' }}>当前</span>}
                    {!v.isCurrent && (
                      <button onClick={() => restoreVersion(v.id)} style={{ padding: '3px 8px', backgroundColor: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '4px', color: '#f39c12', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        恢复
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 版本对比 */}
      {tab === 'diff' && diffResult && (
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <div style={{ padding: '10px', backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: '6px', flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#2ecc71' }}>+{diffResult.additions || diffResult.stats?.additions || 0}</div>
              <div style={{ fontSize: '11px', color: '#6c6c80' }}>新增</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(231,76,60,0.08)', borderRadius: '6px', flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#e74c3c' }}>-{diffResult.deletions || diffResult.stats?.deletions || 0}</div>
              <div style={{ fontSize: '11px', color: '#6c6c80' }}>删除</div>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(52,152,219,0.08)', borderRadius: '6px', flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#3498db' }}>{diffResult.net || diffResult.stats?.net || 0}</div>
              <div style={{ fontSize: '11px', color: '#6c6c80' }}>净变化</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(diffResult.changes || diffResult.differences || []).map((c: any, i: number) => (
              <div key={i} style={{
                padding: '8px 12px', borderRadius: '6px', border: '1px solid',
                borderColor: c.type === 'insert' ? 'rgba(46,204,113,0.2)' : c.type === 'delete' ? 'rgba(231,76,60,0.2)' : 'rgba(243,156,18,0.2)',
                backgroundColor: c.type === 'insert' ? 'rgba(46,204,113,0.04)' : c.type === 'delete' ? 'rgba(231,76,60,0.04)' : 'rgba(243,156,18,0.04)',
              }}>
                <div style={{ fontSize: '11px', color: c.type === 'insert' ? '#2ecc71' : c.type === 'delete' ? '#e74c3c' : '#f39c12', fontWeight: 600 }}>
                  {c.type === 'insert' ? '+ 新增' : c.type === 'delete' ? '- 删除' : '~ 修改'} · {c.location || c.position}
                </div>
                <div style={{ fontSize: '12px', color: '#c0c0d0', marginTop: '4px' }}>{c.desc || c.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VersionHistoryPage;
