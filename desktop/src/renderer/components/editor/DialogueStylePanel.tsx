/**
 * DialogueStylePanel - 角色对话风格分析组件
 * 插入到角色详情面板中
 */
import React, { useState, useCallback } from 'react';
import { api } from '../../lib/api';

const DialogueStylePanel: React.FC<{ projectId: string; characterName: string }> = ({ projectId, characterName }) => {
  const [dialogues, setDialogues] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async () => {
    if (!dialogues.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/chain/dialogue-style', {
        projectId, characterName,
        dialogues: dialogues.split('\n').filter(Boolean),
      });
      setResult((res.data as any).success ? res.data : res.data);
    } catch { /* */ }
    setLoading(false);
  }, [projectId, characterName, dialogues]);

  return (
    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#c0c0d0', marginBottom: '8px' }}>💬 对话风格分析 - {characterName}</div>
      <textarea value={dialogues} onChange={e => setDialogues(e.target.value)} placeholder={`输入${characterName}的几句对话，每行一句...`}
        style={{ width: '100%', padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', minHeight: '60px', lineHeight: 1.5, boxSizing: 'border-box' }} />
      <button onClick={analyze} disabled={loading || !dialogues.trim()}
        style={{ marginTop: '8px', padding: '6px 14px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
        {loading ? '分析中...' : '🎯 分析对话风格'}
      </button>
      {result && result.style && (
        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            <div style={{ padding: '4px 8px', backgroundColor: 'rgba(233,69,96,0.1)', borderRadius: '4px', fontSize: '11px', color: '#e94560' }}>说话习惯: {result.style.speechPattern}</div>
            <div style={{ padding: '4px 8px', backgroundColor: 'rgba(52,152,219,0.1)', borderRadius: '4px', fontSize: '11px', color: '#3498db' }}>语气: {result.style.tone}</div>
            <div style={{ padding: '4px 8px', backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: '4px', fontSize: '11px', color: '#2ecc71' }}>频率: {result.style.frequency}</div>
          </div>
          {result.examples && result.examples.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#6c6c80', textTransform: 'uppercase', marginBottom: '6px' }}>优化建议</div>
              {result.examples.map((ex: any, i: number) => (
                <div key={i} style={{ padding: '6px 8px', marginBottom: '4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', fontSize: '11px' }}>
                  <div style={{ color: '#8a8aa0' }}>原文: <span style={{ color: '#c0c0d0' }}>{ex.original}</span></div>
                  <div style={{ color: '#8a8aa0' }}>推荐: <span style={{ color: '#2ecc71' }}>{ex.recommended}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DialogueStylePanel;
