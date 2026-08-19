import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type ChangeRow = { id: string; field_key: string; field_label: string; before_value: string; after_value: string; chapter_index?: number; reason: string; source: string };

const payload = (res: any) => res?.data?.data ?? res?.data ?? res ?? [];

export const ChangeHistoryPanel: React.FC<{ projectId: string; characterId: string; fieldKey: string; fieldLabel: string; onClose: () => void }> = ({
  projectId, characterId, fieldKey, fieldLabel, onClose,
}) => {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [chapter, setChapter] = useState('');
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    const res = await api.get(`/projects/${projectId}/characters/${characterId}/profile-changes`);
    const data = payload(res);
    setRows(Array.isArray(data) ? data.filter((r: any) => r.field_key === fieldKey) : []);
  }, [projectId, characterId, fieldKey]);
  useEffect(() => { void load(); }, [load]);
  const addManual = async () => {
    await api.post(`/projects/${projectId}/characters/${characterId}/profile-changes`, {
      fieldKey, fieldLabel, beforeValue: '', afterValue: '', chapterIndex: chapter ? Number(chapter) : null, reason,
    });
    setChapter(''); setReason('');
    await load();
  };
  const remove = async (id: string) => {
    await api.delete(`/projects/${projectId}/characters/${characterId}/profile-changes/${id}`);
    await load();
  };
  return (
    <div style={{ marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid rgba(233,69,96,0.22)', backgroundColor: 'rgba(0,0,0,0.18)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#eaeaea' }}>{fieldLabel} · 变动历史</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8aa0', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      {rows.length === 0 && <p style={{ fontSize: 14, color: '#8a8aa0', margin: '8px 0' }}>暂无变动记录。保存设定时的自动变化会记录在这里，也可手动补录。</p>}
      {rows.map(row => (
        <div key={row.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 14, color: '#c0c0d0' }}>
          <strong style={{ color: '#f59e0b' }}>{row.chapter_index ? `第${row.chapter_index}章` : '未定位章节'}</strong>
          <span style={{ color: '#8a8aa0' }}> · {row.source === 'auto' ? '自动' : '手动'}</span>
          <div style={{ marginTop: 3, lineHeight: 1.6 }}>
            {row.before_value && <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{row.before_value}</span>}
            {row.before_value && row.after_value && <span style={{ color: '#8a8aa0', margin: '0 4px' }}>→</span>}
            {row.after_value && <span style={{ color: '#22c55e' }}>{row.after_value}</span>}
          </div>
          {row.reason && <div style={{ color: '#fbbf24', marginTop: 2 }}>原因：{row.reason}</div>}
          <button type="button" onClick={() => remove(row.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, marginTop: 3 }}>删除</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input value={chapter} onChange={e => setChapter(e.target.value)} placeholder="第几章（可空）" style={{ width: 90, padding: '6px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', fontSize: 14 }} />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="变化原因（如：第5章真相揭晓后不再伪装）" style={{ flex: 1, minWidth: 180, padding: '6px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', fontSize: 14 }} />
        <button type="button" onClick={addManual} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', backgroundColor: '#e94560', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>补录变化</button>
      </div>
    </div>
  );
};
