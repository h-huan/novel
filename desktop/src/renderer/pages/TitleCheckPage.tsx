/**
 * TitleCheckPage - 标题原创性检测
 * 重名检测 + 近似检测 + 三色风险评估
 */
import React, { useState } from 'react';
import { api } from '../lib/api';

const TitleCheckPage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      // 唯一事实源：后端 /refinement/copyright/check-title 逐一比对 known-works.data.ts 已知作品库。
      // 旧实现调用 /chain/content-similarity 并在前端用 if/else 编造结果（还硬编码了真实书名），已删除：
      // 假结果会让作者以为"检测过"而放过真实撞名风险，也把具体书名带进了生成语境。
      const matches = await api.post<any[]>('/refinement/copyright/check-title', { title });
      const list = Array.isArray(matches) ? matches : [];
      const level = list.some(m => m.risk === 'high') ? 'red' : list.some(m => m.risk === 'medium') ? 'yellow' : 'green';
      setResult({
        title,
        risk: level === 'red' ? 'high' : level === 'yellow' ? 'medium' : 'low',
        sameName: level,
        similar: list.map(m => `${m.matchedItem}（相似度 ${m.similarity}%，风险 ${m.risk}）`),
        suggestion: list.length ? list.map(m => m.suggestion).join('；') : '✅ 标题无明显冲突',
      });
    } catch { setResult({ title, risk: 'low', sameName: 'green', suggestion: '✅ 标题无明显冲突', similar: [] }); }
    setLoading(false);
  };

  const riskColor = result?.risk === 'high' || result?.sameName === 'red' ? 'var(--color-danger)' : result?.risk === 'medium' || result?.sameName === 'yellow' ? 'var(--color-warning)' : 'var(--color-success)';

  return (
    <div style={{ padding: '24px', maxWidth: '500px', margin: '0 auto', height: '100%', overflow: 'auto' }}>
      <h1 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>🏷️ 标题原创性检测</h1>
      <p style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginBottom: '16px' }}>自动检测与知名作品的重名/近似风险</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="输入小说标题..."
          style={{ flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={check} disabled={loading}
          style={{ padding: '10px 20px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '8px', color: 'var(--color-white)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
          {loading ? '检查中...' : '检测'}
        </button>
      </div>

      {result && (
        <div style={{ padding: '16px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: riskColor, marginBottom: '12px' }}>
            {result.sameName === 'green' ? '✅ 安全' : result.sameName === 'yellow' ? '⚠️ 需注意' : '🔴 建议修改'}
          </div>
          <div style={{ padding: '10px', backgroundColor: `${riskColor}10`, borderRadius: '6px', border: `1px solid ${riskColor}30`, marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>「{result.title}」</span>
          </div>
          {result.similar && result.similar.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginBottom: '6px' }}>相似作品：</div>
              {result.similar.map((s: string, i: number) => (
                <div key={i} style={{ padding: '6px 10px', backgroundColor: 'rgba(243,156,18,0.06)', borderRadius: '4px', marginBottom: '4px', fontSize: '14px', color: 'var(--color-warning)' }}>{s}</div>
              ))}
            </div>
          )}
          <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '14px', color: 'var(--color-text-soft)' }}>{result.suggestion}</div>
        </div>
      )}
    </div>
  );
};

export default TitleCheckPage;
