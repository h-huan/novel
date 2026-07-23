/**
 * ToolsPage - 综合工具面板
 * 时代检查 + 篇幅规划 + 文风分析 + 相似内容检查 + 创作资料检查
 */
import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

const ToolsPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [tab, setTab] = useState('era');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const callApi = useCallback(async (endpoint: string, body: any) => {
    setLoading(true); setResult(null);
    try {
      const res = await api.post(endpoint, { projectId, ...body });
      setResult(res.data);
    } catch (err: any) { setResult({ error: err.message }); }
    setLoading(false);
  }, [projectId]);

  const tabs = [
    { id: 'era', label: '时代检查', icon: '🏛️', desc: '检查正文中是否出现不符合时代背景的内容' },
    { id: 'wordplan', label: '篇幅规划', icon: '📐', desc: '依据故事体量和节奏规划卷章与字数' },
    { id: 'stylevec', label: '文风分析', icon: '🎨', desc: '分析句式、节奏、用词和叙事倾向' },
    { id: 'similarity', label: '相似内容检查', icon: '🔍', desc: '检查相似表达与版权风险' },
    { id: 'schedule', label: '创作资料检查', icon: '📅', desc: '检查大纲、人物、伏笔和时间顺序是否一致' },
  ];

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', maxWidth: '720px' }}>
      <h1 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>🛠️ 创作工具</h1>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setResult(null); }}
            style={{
              padding: '8px 14px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
              backgroundColor: tab === t.id ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)',
              borderColor: tab === t.id ? '#e94560' : 'rgba(255,255,255,0.06)',
              color: tab === t.id ? '#e94560' : '#c0c0d0',
            }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* 内容输入 */}
      {(tab === 'era' || tab === 'similarity' || tab === 'stylevec') && (
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="输入要检测的文本内容..."
          style={{ width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '100px', marginBottom: '12px' }} />
      )}

      {/* 执行按钮 */}
      <button onClick={() => {
        const endpoints: Record<string, string> = { era: '/chain/era-check', wordplan: '/chain/word-plan', stylevec: '/chain/style-vectorize', similarity: '/chain/content-similarity', schedule: '/chain/schedule-check' };
        if (['era', 'stylevec', 'similarity'].includes(tab) && !content.trim()) { setResult({ error: '请提供真实文本；系统不会使用示例内容代替。' }); return; }
        const bodies: Record<string, any> = { era: { content }, wordplan: {}, stylevec: { samples: [content] }, similarity: { content }, schedule: {} };
        callApi(endpoints[tab], bodies[tab]);
      }} disabled={loading}
        style={{ padding: '10px 24px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1, marginBottom: '16px' }}>
        {loading ? '执行中...' : `▶ 执行${tabs.find(t => t.id === tab)?.label}`}
      </button>

      {/* 结果 */}
      {result && (
        <div style={{ padding: '16px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
          {result.error ? (
            <p style={{ color: '#e74c3c', fontSize: '13px' }}>❌ {result.error}</p>
          ) : tab === 'era' && result.checks ? (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: result.passed ? '#2ecc71' : '#e74c3c', marginBottom: '12px' }}>
                {result.passed ? '✅ 时代一致通过' : '❌ 存在不一致'}
              </div>
              {result.checks.map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: c.passed ? '#2ecc71' : '#e74c3c', fontSize: '12px' }}>{c.passed ? '✓' : '✗'}</span>
                  <span style={{ color: '#c0c0d0', fontSize: '12px', flex: 1 }}>{c.name}</span>
                  <span style={{ color: '#6c6c80', fontSize: '11px' }}>{c.detail}</span>
                </div>
              ))}
            </div>
          ) : tab === 'wordplan' && result.plan ? (
            <div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1, padding: '10px', backgroundColor: 'rgba(52,152,219,0.08)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#3498db' }}>{result.plan.totalChapters ? `${result.plan.totalChapters}章` : `${result.plan.feasibleChapterRange?.min}-${result.plan.feasibleChapterRange?.max}章`}</div>
                  <div style={{ fontSize: '11px', color: '#6c6c80' }}>总章节</div>
                </div>
                <div style={{ flex: 1, padding: '10px', backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#2ecc71' }}>{result.plan.volumes ? `${result.plan.volumes}卷` : '待规划'}</div>
                  <div style={{ fontSize: '11px', color: '#6c6c80' }}>卷数</div>
                </div>
                <div style={{ flex: 1, padding: '10px', backgroundColor: 'rgba(243,156,18,0.08)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#f39c12' }}>{result.plan.estimatedDays ? `${result.plan.estimatedDays}天` : '未设置'}</div>
                  <div style={{ fontSize: '11px', color: '#6c6c80' }}>预计工期</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#6c6c80', marginBottom: '8px' }}>每章范围 {result.plan.chapterWordRange?.min}-{result.plan.chapterWordRange?.max}字 · 具体目标按本章任务动态确定 · 每日目标 {result.plan.dailyTarget || '未设置'}</div>
              <div style={{ fontSize: '12px', color: '#8a8aa0', marginBottom: '8px' }}>{result.plan.note}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(result.plan.volumeBreakdown || []).map((v: any, i: number) => (
                  <div key={i} style={{ padding: '8px 10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#c0c0d0', fontSize: '12px' }}>{v.title || `第${v.volume}卷`} · {v.chapters}章</span>
                    <span style={{ color: '#6c6c80', fontSize: '11px' }}>{(v.wordsTarget / 1000).toFixed(0)}k字</span>
                  </div>
                ))}
              </div>
            </div>
          ) : tab === 'stylevec' && result.features ? (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea', marginBottom: '10px' }}>
                🎨 风格: {result.styleName} · 维度: {result.vector.dimensions}
              </div>
              {result.features.map((f: any, i: number) => (
                <div key={i} style={{ padding: '8px 10px', marginBottom: '6px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#c0c0d0', fontSize: '12px' }}>{f.name}</span>
                    <span style={{ color: '#6c6c80', fontSize: '11px' }}>权重 {f.weight}</span>
                  </div>
                  <div style={{ color: '#8a8aa0', fontSize: '11px', marginTop: '2px' }}>{f.value}</div>
                </div>
              ))}
            </div>
          ) : tab === 'similarity' ? (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: result.analysis?.overallRisk === 'low' ? '#2ecc71' : '#f39c12', marginBottom: '8px' }}>
                {result.analysis?.overallRisk === 'low' ? '✅ 低风险' : '⚠️ 需关注'} · {(result.analysis as any)?.summary || '分析完成'}
              </div>
            </div>
          ) : tab === 'schedule' ? (
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: result.overall === 'healthy' ? '#2ecc71' : result.overall === 'warning' ? '#f39c12' : '#e74c3c', marginBottom: '12px' }}>
                {result.overall === 'healthy' ? '✅ 系统健康' : result.overall === 'warning' ? '⚠️ 存在告警' : '🔴 需要修复'}
              </div>
              {result.checks?.map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: c.status === 'pass' ? '#2ecc71' : c.status === 'warn' ? '#f39c12' : '#e74c3c', fontSize: '12px' }}>
                    {c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗'}
                  </span>
                  <span style={{ color: '#c0c0d0', fontSize: '12px', flex: 1 }}>{c.name}</span>
                  <span style={{ color: '#6c6c80', fontSize: '11px' }}>{c.detail}</span>
                </div>
              ))}
              <div style={{ marginTop: '12px', fontSize: '11px', color: '#6c6c80' }}>下次校验: {new Date(result.nextScheduled).toLocaleString()}</div>
            </div>
          ) : <p style={{ margin: 0, fontSize: '13px', color: '#c0c0d0' }}>操作已完成，请在对应创作模块查看结果。</p>}
        </div>
      )}
    </div>
  );
};

export default ToolsPage;
