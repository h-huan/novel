/**
 * NewsPage - 新闻热点聚合 + 创作素材
 * 对接 /chain/news-rss 端点
 */
import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';

interface NewsItem { id: string; title: string; source: string; summary: string; storyAngle: string; tags: string[]; publishTime: string; }

const NewsPage: React.FC = () => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keywords, setKeywords] = useState('');

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post('/chain/news-rss', { keywords: keywords || undefined, count: 10 });
      const data = res as any;
      if (data.items) setItems(data.items as NewsItem[]);
    } catch { /* */ }
    setLoading(false);
  }, [keywords]);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', maxWidth: '700px' }}>
      <h1 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>📰 新闻热点 · 创作素材</h1>
      <p style={{ fontSize: '12px', color: '#8a8aa0', marginBottom: '16px' }}>实时聚合新闻热点，自动提取可创作的故事题材</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input value={keywords} onChange={e => setKeywords(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchNews()}
          placeholder="搜索关键词（可选）"
          style={{ flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={fetchNews} disabled={loading}
          style={{ padding: '10px 20px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
          {loading ? '抓取中...' : '🔍 获取热点'}
        </button>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '50px 0', color: '#6c6c80' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📰</div>
          <p style={{ fontSize: '14px' }}>点击"获取热点"加载最新新闻素材</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map(item => (
          <div key={item.id} style={{ padding: '14px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#eaeaea' }}>{item.title}</span>
              <span style={{ fontSize: '10px', color: '#6c6c80', whiteSpace: 'nowrap' }}>{item.source}</span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#c0c0d0', lineHeight: 1.5 }}>{item.summary}</p>
            <div style={{ marginTop: '8px', padding: '8px 10px', backgroundColor: 'rgba(233,69,96,0.05)', borderRadius: '6px', border: '1px solid rgba(233,69,96,0.1)' }}>
              <span style={{ fontSize: '11px', color: '#e94560', fontWeight: 500 }}>💡 创作角度: </span>
              <span style={{ fontSize: '11px', color: '#c0c0d0' }}>{item.storyAngle}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              {Array.isArray(item.tags) && item.tags.map((t, i) => (
                <span key={i} style={{ padding: '2px 8px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '4px', fontSize: '10px', color: '#6c6c80' }}>#{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsPage;
