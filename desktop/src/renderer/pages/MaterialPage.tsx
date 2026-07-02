/**
 * MaterialPage - 素材库 (Module I)
 * 拆书引擎+风格资产化+语义检索+融合模式
 */
import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';

interface MaterialItem {
  id: string;
  type: 'vocabulary' | 'sentence' | 'action' | 'environment' | 'psychology' | 'rhythm';
  content: string;
  source: string;
  tags: string[];
  style: string;
}

const TYPE_LABELS: Record<string, string> = {
  vocabulary: '词汇', sentence: '句式', action: '动作描写',
  environment: '环境描写', psychology: '心理描写', rhythm: '节奏模板',
};
const TYPE_ICONS: Record<string, string> = {
  vocabulary: '📝', sentence: '✏️', action: '🏃',
  environment: '🌄', psychology: '💭', rhythm: '🎵',
};

const MaterialPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'import' | 'browse' | 'search' | 'market'>('browse');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MaterialItem[]>([]);
  const [searchMode, setSearchMode] = useState<string>('balanced');
  const [activeType, setActiveType] = useState<string | null>(null);
  const [marketMaterials, setMarketMaterials] = useState<MaterialItem[]>([]);
  const [marketCategory, setMarketCategory] = useState<string | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const handleImport = useCallback(async () => {
    if (!importText.trim()) return;
    setImportLoading(true);
    try {
      const res = await api.post('/import-export/import/text', { content: importText, format: 'txt' });
      const data = res.data as any;
      if (data.chapters || data.data) {
        // 导入成功，从 API 返回数据中提取素材
        const importedMaterials = data.materials || data.data?.materials || [];
        setMaterials(prev => [...importedMaterials, ...prev]);
      }
    } catch (error) {
      console.error('导入失败:', error);
      // 显示错误提示，不显示 mock 数据
    }
    setImportLoading(false);
  }, [importText]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await api.post('/material/search', {
        query: searchQuery,
        mode: searchMode,
        limit: 20,
      });
      const data = res.data as any;
      const results = (data?.data?.items) || data?.items || [];
      setSearchResults(results);
    } catch (error) {
      console.error('搜索失败:', error);
      setSearchResults([]);
    }
  }, [searchQuery, searchMode]);

  const filtered = activeType ? materials.filter(m => m.type === activeType) : materials;

  /** 从后端获取内置素材 */
  const loadMarketMaterials = useCallback(async (category?: string) => {
    setMarketLoading(true);
    try {
      const url = category ? `/material/builtin?category=${category}` : '/material/builtin';
      const res = await api.get(url);
      const data = res.data as any;
      setMarketMaterials(Array.isArray(data) ? data : data?.items || []);
    } catch (error) {
      console.error('加载内置素材失败:', error);
      // 不显示 mock 数据，显示空状态
      setMarketMaterials([]);
    }
    setMarketLoading(false);
  }, []);

  const handleMarketTabSwitch = useCallback(() => {
    setActiveTab('market');
    loadMarketMaterials(marketCategory || undefined);
  }, [loadMarketMaterials, marketCategory]);

  const handleDownload = useCallback((item: MaterialItem) => {
    if (downloadedIds.has(item.id)) return;
    setMaterials(prev => [{ ...item, id: `imported-${Date.now()}` }, ...prev]);
    setDownloadedIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  }, [downloadedIds]);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>📚 素材库</h1>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['browse', 'import', 'search', 'market'] as const).map(tab => (
          <button key={tab} onClick={() => tab === 'market' ? handleMarketTabSwitch() : setActiveTab(tab)}
            style={{
              padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: activeTab === tab ? '#e94560' : '#8a8aa0', borderBottom: activeTab === tab ? '2px solid #e94560' : '2px solid transparent',
            }}>
            {tab === 'browse' ? '📂 浏览' : tab === 'import' ? '📥 拆书导入' : tab === 'search' ? '🔍 语义检索' : '🏪 素材市场'}
          </button>
        ))}
      </div>

      {/* 拆书导入 */}
      {activeTab === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#8a8aa0' }}>导入小说/文章 → AI自动拆解为词汇/句式/描写/节奏模板</p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '180px',
            }} placeholder="粘贴小说文本/素材内容..." />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleImport} disabled={importLoading}
              style={{ padding: '10px 24px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: importLoading ? 0.6 : 1 }}>
              {importLoading ? '拆解中...' : '🔧 AI拆解素材'}
            </button>
          </div>
          {materials.length > 0 && (
            <div style={{ padding: '10px', backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: '6px', color: '#2ecc71', fontSize: '12px' }}>
              ✅ 已拆解 {materials.length} 条素材
            </div>
          )}
        </div>
      )}

      {/* 语义检索 */}
      {activeTab === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入关键词搜索素材..."
              style={{ flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={handleSearch} style={{ padding: '10px 20px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>搜索</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#8a8aa0' }}>融合模式:</span>
            {(['balanced', 'style_boost', 'deep_immersion'] as const).map(mode => (
              <button key={mode} onClick={() => setSearchMode(mode)}
                style={{
                  padding: '4px 10px', borderRadius: '4px', fontSize: '11px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: searchMode === mode ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                  borderColor: searchMode === mode ? '#e94560' : 'rgba(255,255,255,0.08)',
                  color: searchMode === mode ? '#e94560' : '#8a8aa0',
                }}>
                {mode === 'balanced' ? '均衡' : mode === 'style_boost' ? '风格强化' : '深度仿写'}
              </button>
            ))}
          </div>
          {searchResults.map((r, i) => (
            <div key={i} style={{ padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '12px', color: '#eaeaea' }}>{r.content}</div>
              <div style={{ fontSize: '10px', color: '#6c6c80', marginTop: '4px' }}>{TYPE_ICONS[r.type]} {TYPE_LABELS[r.type]} | 标签: {r.tags.join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      {/* 素材市场 */}
      {activeTab === 'market' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#8a8aa0' }}>从内置素材市场中挑选高质量描写片段、句式模板和节奏模板，一键导入到你的素材库</p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => { setMarketCategory(null); loadMarketMaterials(); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === null ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === null ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === null ? '#e94560' : '#c0c0d0',
              }}>📋 全部</button>
            <button onClick={() => { setMarketCategory('environment'); loadMarketMaterials('environment'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'environment' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'environment' ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'environment' ? '#e94560' : '#c0c0d0',
              }}>🌄 环境描写</button>
            <button onClick={() => { setMarketCategory('action'); loadMarketMaterials('action'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'action' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'action' ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'action' ? '#e94560' : '#c0c0d0',
              }}>⚔️ 动作描写</button>
            <button onClick={() => { setMarketCategory('psychology'); loadMarketMaterials('psychology'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'psychology' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'psychology' ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'psychology' ? '#e94560' : '#c0c0d0',
              }}>💭 心理描写</button>
            <button onClick={() => { setMarketCategory('dialogue'); loadMarketMaterials('dialogue'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'dialogue' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'dialogue' ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'dialogue' ? '#e94560' : '#c0c0d0',
              }}>💬 对话句式</button>
            <button onClick={() => { setMarketCategory('rhythm'); loadMarketMaterials('rhythm'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'rhythm' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'rhythm' ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'rhythm' ? '#e94560' : '#c0c0d0',
              }}>🎵 节奏模板</button>
            <button onClick={() => { setMarketCategory('reversal'); loadMarketMaterials('reversal'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'reversal' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'reversal' ? '#e94560' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'reversal' ? '#e94560' : '#c0c0d0',
              }}>🔄 转折手法</button>
          </div>
          {marketLoading && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#6c6c80', fontSize: '13px' }}>加载中...</div>
          )}
          {!marketLoading && marketMaterials.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c6c80', fontSize: '13px' }}>
              暂无内置素材，请检查后端服务是否运行
            </div>
          )}
          <div style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            {marketMaterials.map((m, i) => {
              const isDownloaded = downloadedIds.has(m.id);
              return (
                <div key={m.id || i} style={{
                  padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.06)', position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(233,69,96,0.1)', color: '#e94560' }}>
                      内置
                    </span>
                    <span style={{ fontSize: '11px', color: '#6c6c80' }}>{m.source || '素材市场'}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => handleDownload(m)} disabled={isDownloaded}
                      style={{
                        padding: '4px 12px', borderRadius: '4px', fontSize: '11px', border: '1px solid', cursor: isDownloaded ? 'default' : 'pointer', fontFamily: 'inherit',
                        backgroundColor: isDownloaded ? 'rgba(46,204,113,0.1)' : 'rgba(233,69,96,0.1)',
                        borderColor: isDownloaded ? '#2ecc71' : '#e94560',
                        color: isDownloaded ? '#2ecc71' : '#e94560',
                      }}>
                      {isDownloaded ? '✅ 已导入' : '📥 导入'}
                    </button>
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#c0c0d0', lineHeight: 1.5 }}>{m.content}</p>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {(m.tags || []).map((t, ti) => (
                      <span key={ti} style={{ padding: '2px 6px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '3px', fontSize: '10px', color: '#6c6c80' }}>#{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 浏览 */}
      {activeTab === 'browse' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => setActiveType(activeType === key ? null : key)}
                style={{
                  padding: '6px 12px', borderRadius: '6px', fontSize: '12px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: activeType === key ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                  borderColor: activeType === key ? '#e94560' : 'rgba(255,255,255,0.08)',
                  color: activeType === key ? '#e94560' : '#c0c0d0',
                }}>{TYPE_ICONS[key]} {label}</button>
            ))}
          </div>
          <div style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6c6c80', fontSize: '13px' }}>
                暂无素材，切换到「拆书导入」标签导入文本
              </div>
            )}
            {filtered.map(m => (
              <div key={m.id} style={{ padding: '10px 14px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>{TYPE_ICONS[m.type]}</span>
                  <span style={{ padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: 'rgba(233,69,96,0.1)', color: '#e94560' }}>{TYPE_LABELS[m.type]}</span>
                  <span style={{ fontSize: '11px', color: '#6c6c80' }}>{m.source}</span>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#c0c0d0', lineHeight: 1.5 }}>{m.content}</p>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  {Array.isArray(m.tags) && m.tags.map((t, i) => (
                    <span key={i} style={{ padding: '2px 6px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '3px', fontSize: '10px', color: '#6c6c80' }}>#{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialPage;
