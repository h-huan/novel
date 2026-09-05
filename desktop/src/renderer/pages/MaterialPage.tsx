/**
 * MaterialPage - 素材库 (Module I)
 * 拆书引擎+风格资产化+语义检索+融合模式
 */
import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';
import EmptyState from '../components/common/EmptyState';

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
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--color-bg-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>📚 素材库</h1>
        <span style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>共 {materials.length} 条素材</span>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['browse', 'import', 'search', 'market'] as const).map(tab => (
          <button key={tab} onClick={() => tab === 'market' ? handleMarketTabSwitch() : setActiveTab(tab)}
            style={{
              padding: '8px 14px', fontSize: '14px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: activeTab === tab ? 'var(--color-accent)' : 'var(--color-text-dim)', borderBottom: activeTab === tab ? '2px solid var(--color-accent)' : '2px solid transparent',
            }}>
            {tab === 'browse' ? '📂 浏览' : tab === 'import' ? '📥 拆书导入' : tab === 'search' ? '🔍 语义检索' : '🏪 素材市场'}
          </button>
        ))}
      </div>

      {/* 拆书导入 */}
      {activeTab === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-dim)' }}>导入小说/文章 → AI自动拆解为词汇/句式/描写/节奏模板</p>
          <textarea value={importText} onChange={e => setImportText(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '180px',
            }} placeholder="粘贴小说文本/素材内容..." />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleImport} disabled={importLoading}
              style={{ padding: '10px 24px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '8px', color: 'var(--color-white)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: importLoading ? 0.6 : 1 }}>
              {importLoading ? '拆解中...' : '🔧 AI拆解素材'}
            </button>
          </div>
          {materials.length > 0 && (
            <div style={{ padding: '10px', backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: '6px', color: 'var(--color-success)', fontSize: '14px' }}>
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
              style={{ flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={handleSearch} style={{ padding: '10px 20px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '8px', color: 'var(--color-white)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>搜索</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>融合模式:</span>
            {(['balanced', 'style_boost', 'deep_immersion'] as const).map(mode => (
              <button key={mode} onClick={() => setSearchMode(mode)}
                style={{
                  padding: '4px 10px', borderRadius: '4px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: searchMode === mode ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                  borderColor: searchMode === mode ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                  color: searchMode === mode ? 'var(--color-accent)' : 'var(--color-text-dim)',
                }}>
                {mode === 'balanced' ? '均衡' : mode === 'style_boost' ? '风格强化' : '深度仿写'}
              </button>
            ))}
          </div>
          {searchResults.length === 0 && searchQuery && (
            <EmptyState
              icon="🔍"
              title="未找到相关素材"
              description="尝试更换关键词，或调整融合模式后重新搜索。"
            />
          )}
          {searchResults.map((r, i) => (
            <div key={i} style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600, minWidth: '24px' }}>#{i + 1}</span>
                <span style={{ fontSize: '16px' }}>{TYPE_ICONS[r.type]}</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '14px', backgroundColor: 'rgba(233,69,96,0.1)', color: 'var(--color-accent)', fontWeight: 600 }}>{TYPE_LABELS[r.type]}</span>
              </div>
              <div style={{ fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.6 }}>{r.content}</div>
              {r.tags && r.tags.length > 0 && (
                <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '8px' }}>标签: {r.tags.join(', ')}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 素材市场 */}
      {activeTab === 'market' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-dim)' }}>从内置素材市场中挑选高质量描写片段、句式模板和节奏模板，一键导入到你的素材库</p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => { setMarketCategory(null); loadMarketMaterials(); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === null ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === null ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === null ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>📋 全部</button>
            <button onClick={() => { setMarketCategory('environment'); loadMarketMaterials('environment'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'environment' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'environment' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'environment' ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>🌄 环境描写</button>
            <button onClick={() => { setMarketCategory('action'); loadMarketMaterials('action'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'action' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'action' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'action' ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>⚔️ 动作描写</button>
            <button onClick={() => { setMarketCategory('psychology'); loadMarketMaterials('psychology'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'psychology' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'psychology' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'psychology' ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>💭 心理描写</button>
            <button onClick={() => { setMarketCategory('dialogue'); loadMarketMaterials('dialogue'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'dialogue' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'dialogue' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'dialogue' ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>💬 对话句式</button>
            <button onClick={() => { setMarketCategory('rhythm'); loadMarketMaterials('rhythm'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'rhythm' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'rhythm' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'rhythm' ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>🎵 节奏模板</button>
            <button onClick={() => { setMarketCategory('reversal'); loadMarketMaterials('reversal'); }}
              style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                backgroundColor: marketCategory === 'reversal' ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                borderColor: marketCategory === 'reversal' ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                color: marketCategory === 'reversal' ? 'var(--color-accent)' : 'var(--color-text-soft)',
              }}>🔄 转折手法</button>
          </div>
          {marketLoading && (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)', fontSize: '14px' }}>加载中...</div>
          )}
          {!marketLoading && marketMaterials.length === 0 && (
            <EmptyState
              icon="🏪"
              title="暂无内置素材"
              description="请检查后端服务是否运行，或选择其他分类查看素材。"
            />
          )}
          <div style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            {marketMaterials.map((m, i) => {
              const isDownloaded = downloadedIds.has(m.id);
              return (
                <div key={m.id || i} style={{
                  padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.06)', position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600, minWidth: '24px' }}>#{i + 1}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '14px', backgroundColor: 'rgba(233,69,96,0.1)', color: 'var(--color-accent)', fontWeight: 600 }}>
                      内置
                    </span>
                    <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{m.source || '素材市场'}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => handleDownload(m)} disabled={isDownloaded}
                      style={{
                        padding: '4px 12px', borderRadius: '4px', fontSize: '14px', border: '1px solid', cursor: isDownloaded ? 'default' : 'pointer', fontFamily: 'inherit',
                        backgroundColor: isDownloaded ? 'rgba(46,204,113,0.1)' : 'rgba(233,69,96,0.1)',
                        borderColor: isDownloaded ? 'var(--color-success)' : 'var(--color-accent)',
                        color: isDownloaded ? 'var(--color-success)' : 'var(--color-accent)',
                      }}>
                      {isDownloaded ? '✅ 已导入' : '📥 导入'}
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-soft)', lineHeight: 1.6 }}>{m.content}</p>
                  {(m.tags || []).length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {(m.tags || []).map((t, ti) => (
                        <span key={ti} style={{ padding: '2px 8px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '4px', fontSize: '14px', color: 'var(--color-text-dim)' }}>#{t}</span>
                      ))}
                    </div>
                  )}
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
                  padding: '6px 12px', borderRadius: '6px', fontSize: '14px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                  backgroundColor: activeType === key ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.04)',
                  borderColor: activeType === key ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
                  color: activeType === key ? 'var(--color-accent)' : 'var(--color-text-soft)',
                }}>{TYPE_ICONS[key]} {label}</button>
            ))}
          </div>
          <div style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 && (
              <EmptyState
                icon="📂"
                title="暂无素材"
                description="切换到「拆书导入」标签粘贴小说文本，或从「素材市场」一键导入。"
                actionLabel="去拆书导入"
                onAction={() => setActiveTab('import')}
              />
            )}
            {filtered.map((m, idx) => (
              <div key={m.id} style={{ padding: '12px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600, minWidth: '24px' }}>#{idx + 1}</span>
                  <span style={{ fontSize: '16px' }}>{TYPE_ICONS[m.type]}</span>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '14px', backgroundColor: 'rgba(233,69,96,0.1)', color: 'var(--color-accent)', fontWeight: 600 }}>{TYPE_LABELS[m.type]}</span>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{m.source}</span>
                </div>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-soft)', lineHeight: 1.6 }}>{m.content}</p>
                {Array.isArray(m.tags) && m.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {m.tags.map((t, i) => (
                      <span key={i} style={{ padding: '2px 8px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '4px', fontSize: '14px', color: 'var(--color-text-dim)' }}>#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaterialPage;
