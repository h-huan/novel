/**
 * AuthorNotePanel - 临时写作规则
 * 对接后端 /author-notes/* API
 */
import React, { useState, useCallback, useEffect } from 'react';
import { api } from '../../lib/api';

interface AuthorNote {
  id: string; rule: string; scope: 'chapter' | 'volume' | 'global';
  content: string; active: boolean; projectId?: string; chapterIndex?: number;
}

const SCOPE_LABELS: Record<string, string> = { chapter: '本章', volume: '本卷', global: '全局' };

const AuthorNotePanel: React.FC<{ projectId?: string; chapterId?: string }> = ({ projectId, chapterId }) => {
  const [notes, setNotes] = useState<AuthorNote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editRule, setEditRule] = useState('');
  const [editScope, setEditScope] = useState<'chapter' | 'volume' | 'global'>('chapter');
  const [loading, setLoading] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await api.get(`/author-notes?scope=chapter&chapterIndex=${chapterId || ''}`);
      const data = res.data as any;
      if (Array.isArray(data)) setNotes(data as AuthorNote[]);
      else if (data.data && Array.isArray(data.data)) setNotes(data.data as AuthorNote[]);
    } catch { /* backend not ready */ }
    setLoading(false);
  }, [projectId, chapterId]);

  const toggleNote = async (id: string, currentActive: boolean) => {
    try { await api.put(`/author-notes/${id}`, { isActive: !currentActive } as any); }
    catch { /* fallback */ }
    setNotes(prev => prev.map(n => n.id === id ? { ...n, active: !n.active } : n));
  };

  const createNote = async () => {
    if (!projectId) return;
    try {
      const res = await api.post('/author-notes', {
        projectId, rule: editRule || '新规则', content: editContent,
        scope: editScope, chapterIndex: chapterId ? parseInt(chapterId.replace(/\D/g, '')) || 0 : 0,
        isActive: true,
      } as any);
      const data = res.data as any;
      const newNote: AuthorNote = {
        id: data.id || `an-${Date.now()}`, rule: editRule || '新规则',
        scope: editScope, content: editContent, active: true, projectId,
      };
      setNotes(prev => [...prev, newNote]);
      setEditingId(null); setEditContent(''); setEditRule('');
    } catch {
      const newNote: AuthorNote = {
        id: `an-${Date.now()}`, rule: editRule || '新规则',
        scope: editScope, content: editContent, active: true, projectId,
      };
      setNotes(prev => [...prev, newNote]);
      setEditingId(null); setEditContent(''); setEditRule('');
    }
  };

  const deleteNote = async (id: string) => {
    try { await api.delete(`/author-notes/${id}`); } catch { /* fallback */ }
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          📝 Author's Note
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {notes.length > 0 && <button onClick={loadNotes} style={{ background: 'none', border: 'none', color: '#8a8aa0', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>🔄</button>}
          <button onClick={() => { setEditingId('__new__'); setEditContent(''); setEditRule(''); setEditScope('chapter'); }}
            style={{ background: 'none', border: 'none', color: '#e94560', fontSize: '16px', cursor: 'pointer', padding: '2px 6px' }}>+</button>
        </div>
      </div>

      {notes.map(n => (
        <div key={n.id} style={{
          padding: '8px 10px', backgroundColor: n.active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
          border: '1px solid', borderColor: n.active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          borderRadius: '6px', opacity: n.active ? 1 : 0.4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#c0c0d0' }}>{n.rule}</span>
              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: n.scope === 'global' ? 'rgba(59,130,246,0.15)' : n.scope === 'volume' ? 'rgba(245,158,11,0.15)' : 'rgba(233,69,96,0.15)', color: n.scope === 'global' ? '#60a5fa' : n.scope === 'volume' ? '#f59e0b' : '#e94560', fontWeight: 500 }}>
                {SCOPE_LABELS[n.scope]}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input type="checkbox" checked={n.active} onChange={() => toggleNote(n.id, n.active)} style={{ cursor: 'pointer' }} />
              <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '11px', padding: '2px' }}>✕</button>
            </div>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#8a8aa0', lineHeight: 1.4 }}>
            {n.content || <span style={{ fontStyle: 'italic', color: '#5a5a70' }}>未设置内容</span>}
          </p>
        </div>
      ))}

      {/* 新建/编辑 */}
      {editingId === '__new__' && (
        <div style={{ padding: '10px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input value={editRule} onChange={e => setEditRule(e.target.value)} placeholder="规则名称"
            style={{ padding: '6px 8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }} />
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} placeholder="规则内容..."
            style={{ padding: '6px 8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.5, minHeight: '40px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <select value={editScope} onChange={e => setEditScope(e.target.value as any)}
              style={{ padding: '4px 8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}>
              <option value="chapter">本章</option>
              <option value="volume">本卷</option>
              <option value="global">全局</option>
            </select>
            <button onClick={createNote}
              style={{ padding: '6px 14px', backgroundColor: '#e94560', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              添加
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorNotePanel;
