/**
 * ImportExportPage - 导入导出
 * 对接后端 /import-export/* API
 */
import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { showNotification } from '../components/common/Notification';

const ImportExportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'publish'>('import');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('markdown');
  const [exportResult, setExportResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [previewFontSize, setPreviewFontSize] = useState(14);
  const [previewLineHeight, setPreviewLineHeight] = useState(1.8);
  const [previewMargin, setPreviewMargin] = useState(20);

  // 平台发布状态
  const [adaptedResults, setAdaptedResults] = useState<Record<string, any>>({});
  const [adapting, setAdapting] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [editableContent, setEditableContent] = useState('');

  const platformMeta: Record<string, { name: string; icon: string; accent: string; url: string }> = {
    douyin: { name: '抖音', icon: '🎵', accent: '#00d4ff', url: 'https://creator.douyin.com' },
    xiaohongshu: { name: '小红书', icon: '📕', accent: '#ff6b6b', url: 'https://creator.xiaohongshu.com' },
    wechat: { name: '微信公众号', icon: '💬', accent: '#07c160', url: 'https://mp.weixin.qq.com' },
  };

  const loadFormats = useCallback(async () => {
    try { return await api.get('/import-export/formats'); } catch { return null; }
  }, []);

  const handleImportText = useCallback(async () => {
    if (!content) return;
    setLoading(true);
    try {
      const deconstructRes = await api.post('/chain/ai-deconstruct', { content });
      const deconstructData = deconstructRes.data as any;
      const res = await api.post('/import-export/import/text', { projectId: id, content, fileName: 'import.txt' });
      const optimizeRes = await api.post('/chain/import-optimize', { projectId: id, content });
      const optimizeData = optimizeRes.data as any;
      const resData = res.data as any;
      setExportResult({
        import: resData,
        deconstruction: deconstructData.deconstruction,
        optimizations: optimizeData.optimizations,
      });
      if (resData?.projectId) setImportId(resData.projectId);
    } catch (err: any) { setExportResult({ error: err.message }); }
    setLoading(false);
  }, [id, content]);

  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      if (format === 'novel') {
        // .novel 项目包导出 - 先获取真实数据
        setLoading(true);
        try {
          const [chRes, charRes, wsRes, projRes] = await Promise.all([
            api.get(`/projects/${id}/chapters`).catch(() => ({ data: [] })),
            api.get(`/projects/${id}/characters`).catch(() => ({ data: [] })),
            api.get(`/projects/${id}/world-settings`).catch(() => ({ data: [] })),
            api.get(`/projects/${id}`).catch(() => ({ data: {} })),
          ]);
          const chapters = ((chRes as any).data ?? []) as any[];
          const characters = ((charRes as any).data ?? []) as any[];
          const worldSettings: any[] = ((wsRes as any).data ?? []) as any[];
          const projData = ((projRes as any).data ?? {}) as any;
          const project = (projData as any)?.data || projData || {};

          const res = await api.post('/chain/export-novel', {
            projectId: id,
            projectTitle: project.title || '',
            chapters: chapters.map((ch: any) => ({
              title: ch.title || ch.name || '',
              content: ch.content || '',
              status: ch.status || 'draft',
            })),
            characters: characters.map((c: any) => ({
              name: c.name || '',
              description: c.identity || c.description || '',
            })),
            worldSettings: Array.isArray(worldSettings)
              ? worldSettings.map((w: any) => ({ name: w.name || '', content: w.era || w.description || '' }))
              : [{ name: (worldSettings as any).name || '世界观', content: '' }],
            outline: '',
          });
          const data = res.data as any;
          if (data.success && data.downloadData) {
            const byteChars = atob(data.downloadData);
            const bytes = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${project.title || 'project'}.novel`; a.click();
            URL.revokeObjectURL(url);
            setExportResult({ message: `✅ 已导出 .novel 包（${data.summary?.chapterCount || chapters.length}章 ${data.summary?.totalWords || 0}字）` });
          } else {
            setExportResult({ error: data.error || '导出失败' });
          }
        } catch (e: any) {
          setExportResult({ error: e.message || '导出失败' });
        }
        setLoading(false);
      } else if (format === 'txt' || format === 'markdown') {
        const ext = format === 'markdown' ? 'md' : 'txt';
        const blob = new Blob([content || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `export.${ext}`; a.click();
        URL.revokeObjectURL(url);
        setExportResult({ success: true, message: `已下载 ${ext} 文件` });
      } else {
        const res = await api.post('/import-export/export', { projectId: id, format, content });
        setExportResult(res.data);
      }
    } catch (err: any) { setExportResult({ error: err.message }); }
    setLoading(false);
  }, [id, format, content]);

  const handlePreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post('/import-export/export/preview', { projectId: id, format, content });
      setExportResult(res.data);
    } catch (err: any) { setExportResult({ error: err.message }); }
    setLoading(false);
  }, [id, format, content]);

  const handleAdaptAll = useCallback(async () => {
    if (!content) return;
    setAdapting(true);
    const results: Record<string, any> = {};
    const platforms = ['douyin', 'xiaohongshu', 'wechat'];
    for (const platform of platforms) {
      try {
        const res = await api.post('/refinement/social/adapt', { text: content, platform });
        results[platform] = res.data;
      } catch {
        results[platform] = null;
      }
    }
    setAdaptedResults(results);
    setSelectedPlatform('douyin');
    setAdapting(false);
  }, [content]);

  const handleAdaptSingle = useCallback(async (platform: string) => {
    if (!content) return;
    try {
      const res = await api.post('/refinement/social/adapt', { text: content, platform });
      setAdaptedResults(prev => ({ ...prev, [platform]: res.data }));
      setSelectedPlatform(platform);
    } catch (err: any) {
      showNotification('error', `${platformMeta[platform]?.name}适配失败: ${err.message}`);
    }
  }, [content, platformMeta]);

  const handleCopyToClipboard = useCallback(async (platform: string) => {
    const data = adaptedResults[platform];
    if (!data) return;
    let textToCopy = '';
    switch (platform) {
      case 'douyin':
        textToCopy = `${data.content}\n\n${(data.hashtags || []).map((t: string) => `#${t}`).join(' ')}`;
        break;
      case 'xiaohongshu':
        textToCopy = `${data.title}\n\n${data.content}\n\n${(data.hashtags || []).map((t: string) => `#${t}`).join(' ')}`;
        break;
      case 'wechat':
        textToCopy = `标题：${data.title}\n\n摘要：${data.summary}\n\n${data.content}`;
        break;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      showNotification('success', `已复制到剪贴板，可直接粘贴到${platformMeta[platform]?.name}发布`);
    } catch {
      showNotification('error', '复制失败，请手动复制');
    }
  }, [adaptedResults, platformMeta]);

  const handleCopyAndOpen = useCallback(async (platform: string) => {
    await handleCopyToClipboard(platform);
    const url = platformMeta[platform]?.url;
    if (url) window.open(url, '_blank');
  }, [handleCopyToClipboard, platformMeta]);

  const getAdaptPreview = useCallback((platform: string): string => {
    const data = adaptedResults[platform];
    if (!data) return '';
    switch (platform) {
      case 'douyin':
        return `${data.content}\n\n${(data.hashtags || []).map((t: string) => `#${t}`).join(' ')}`;
      case 'xiaohongshu':
        return `${data.title}\n\n${data.content}\n\n${(data.hashtags || []).map((t: string) => `#${t}`).join(' ')}`;
      case 'wechat':
        return `标题：${data.title}\n\n摘要：${data.summary}\n\n${data.content}`;
      default:
        return '';
    }
  }, [adaptedResults]);

  const highlightChanges = useCallback((original: string, adapted: string): React.ReactNode => {
    const originalTags: string[] = original.match(/#\w+/g) || [];
    const adaptedTags: string[] = adapted.match(/#\w+/g) || [];
    const newTags = adaptedTags.filter((t: string) => !originalTags.includes(t));

    if (newTags.length === 0) {
      return <span>{adapted}</span>;
    }

    const parts: React.ReactNode[] = [];
    let remaining = adapted;
    for (const tag of newTags) {
      const idx = remaining.indexOf(tag);
      if (idx === -1) continue;
      if (idx > 0) parts.push(<span key={`pre-${tag}`}>{remaining.substring(0, idx)}</span>);
      parts.push(
        <span key={tag} style={{ color: '#2ecc71', fontWeight: 600, backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: '3px', padding: '0 2px' }}>
          {tag}
        </span>
      );
      remaining = remaining.substring(idx + tag.length);
    }
    if (remaining) parts.push(<span key="rest">{remaining}</span>);
    return <>{parts}</>;
  }, []);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>📦 导入导出</h1>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['import', 'export', 'publish'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setExportResult(null); }}
            style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: activeTab === tab ? '#e94560' : '#8a8aa0',
              borderBottom: activeTab === tab ? '2px solid #e94560' : '2px solid transparent',
            }}>{tab === 'import' ? '📥 导入' : tab === 'export' ? '📤 导出' : '🌐 发布到平台'}</button>
        ))}
      </div>

      {/* 导入 */}
      {activeTab === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#c0c0d0', fontWeight: 500 }}>粘贴文本或上传文件，AI 自动拆解为章节/角色/世界观/伏笔</p>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            style={{
              width: '100%', padding: '16px', backgroundColor: 'rgba(0,0,0,0.25)', border: '2px dashed rgba(255,255,255,0.12)',
              borderRadius: '10px', color: '#eaeaea', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', lineHeight: 1.8, boxSizing: 'border-box', minHeight: '240px',
            }} placeholder="在此粘贴小说文本内容，或点击下方按钮选择文件..." />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleImportText} disabled={loading || !content}
              style={{ padding: '10px 28px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading || !content ? 0.5 : 1 }}>
              {loading ? '⏳ AI拆解中...' : '📥 AI智能拆解导入'}
            </button>
            <input type="file" accept=".txt,.md,.docx,.epub" id="fileUpload"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                setContent(text);
              }} />
            <label htmlFor="fileUpload" style={{
              padding: '10px 20px', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', color: '#c0c0d0', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            }}>📁 选择文件 (.txt/.md)</label>
            {/* .novel 项目包导入 */}
            <input type="file" accept=".novel,.json" id="novelUpload"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLoading(true);
                try {
                  const text = await file.text();
                  const pkg = JSON.parse(text);
                  const res = await api.post('/chain/import-novel', {
                    projectId: id,
                    novelPackage: pkg,
                    fileName: file.name,
                  });
                  const data = res.data as any;
                  setExportResult(data.success
                    ? { message: `✅ .novel 包导入成功！还原了 ${data.chaptersImported || '?'}章 ${data.charactersImported || '?'}个角色` }
                    : { error: data.error || '导入失败' });
                } catch (err: any) {
                  setExportResult({ error: `导入失败: ${err.message || '文件解析错误'}` });
                }
                setLoading(false);
              }} />
            <label htmlFor="novelUpload" style={{
              padding: '10px 20px', backgroundColor: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.25)',
              borderRadius: '8px', color: '#2ecc71', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
            }}>📦 导入 .novel 包</label>
          </div>
          {exportResult && (
            <div style={{ padding: '12px', backgroundColor: exportResult.error ? 'rgba(231,76,60,0.1)' : 'rgba(46,204,113,0.08)', borderRadius: '8px', fontSize: '13px', color: exportResult.error ? '#e74c3c' : '#2ecc71' }}>
              {exportResult.error || `✅ ${exportResult.message || '导入完成！AI 已拆解为章节、角色和世界观'}`}
            </div>
          )}
        </div>
      )}

      {/* 导出 */}
      {activeTab === 'export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#8a8aa0' }}>选择格式和内容，支持Markdown/TXT/EPUB/PDF/DOCX/分镜/剧本</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['markdown', 'txt', 'novel', 'epub', 'pdf', 'docx', 'script', 'storyboard'].map(f => (
              <button key={f} onClick={() => { setFormat(f); setExportResult(null); }}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
                  backgroundColor: format === f ? 'rgba(233,69,96,0.12)' : 'rgba(255,255,255,0.04)',
                  borderColor: format === f ? '#e94560' : 'rgba(255,255,255,0.08)',
                  color: format === f ? '#e94560' : '#c0c0d0',
                }}>{f === 'novel' ? '📦 .novel' : f}</button>
            ))}
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
              outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '150px',
            }} placeholder="输入要导出的内容..." />

          {/* 短剧剧本预览 */}
          {format === 'script' && content && (
            <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', fontSize: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', textTransform: 'uppercase', marginBottom: '8px' }}>🎬 短剧剧本预览</div>
              <div style={{ color: '#c0c0d0', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {content.split('\n').map((line, i) => {
                  if (line.startsWith('第') && line.includes('章')) return <div key={i} style={{ color: '#e94560', fontWeight: 700, fontSize: '13px', margin: '8px 0 4px' }}>{line}</div>;
                  if (line.includes('：') && line.length < 15) return <div key={i} style={{ color: '#3498db', margin: '2px 0' }}><strong>{line.split('：')[0]}</strong>：{line.split('：').slice(1).join('：')}</div>;
                  if (line.includes('【')) return <div key={i} style={{ color: '#9b59b6', fontStyle: 'italic' }}>{line}</div>;
                  return <div key={i} style={{ margin: '1px 0' }}>{line}</div>;
                })}
              </div>
            </div>
          )}

          {/* 分镜脚本预览 */}
          {format === 'storyboard' && content && (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ padding: '8px', border: '1px solid rgba(255,255,255,0.08)', color: '#8a8aa0', textAlign: 'left' }}>镜头</th>
                    <th style={{ padding: '8px', border: '1px solid rgba(255,255,255,0.08)', color: '#8a8aa0', textAlign: 'left' }}>画面描述</th>
                    <th style={{ padding: '8px', border: '1px solid rgba(255,255,255,0.08)', color: '#8a8aa0', textAlign: 'left' }}>对白</th>
                    <th style={{ padding: '8px', border: '1px solid rgba(255,255,255,0.08)', color: '#8a8aa0', textAlign: 'left' }}>AI生图提示词</th>
                  </tr>
                </thead>
                <tbody>
                  {content.split('\n').filter(l => l.trim()).slice(0, 8).map((line, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)', color: '#6c6c80' }}>#{i + 1}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)', color: '#c0c0d0' }}>{line.substring(0, 60)}</td>
                      <td style={{ padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)', color: '#3498db' }}>对白占位</td>
                      <td style={{ padding: '6px 8px', border: '1px solid rgba(255,255,255,0.06)', color: '#9b59b6', fontSize: '10px' }}>镜头描述: {line.substring(0, 30)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handlePreview} disabled={loading}
              style={{ padding: '10px 20px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#eaeaea', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
              👁️ 预览
            </button>
            <button onClick={handleExport} disabled={loading}
              style={{ padding: '10px 24px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? '导出中...' : `📤 导出 ${format}`}
            </button>
          </div>

          {/* 导出预览 (K8) */}
          {exportResult && (
            <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{
                padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px',
              }}>
                <span style={{ color: '#8a8aa0', fontWeight: 600 }}>排版预览</span>
                <span style={{ color: '#6c6c80' }}>|</span>
                <label style={{ color: '#6c6c80' }}>字号</label>
                <input type="number" value={previewFontSize} onChange={e => setPreviewFontSize(parseInt(e.target.value) || 14)}
                  style={{ width: '50px', padding: '2px 6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }} />
                <label style={{ color: '#6c6c80' }}>行距</label>
                <input type="number" step="0.1" value={previewLineHeight} onChange={e => setPreviewLineHeight(parseFloat(e.target.value) || 1.8)}
                  style={{ width: '50px', padding: '2px 6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }} />
                <label style={{ color: '#6c6c80' }}>边距</label>
                <input type="number" value={previewMargin} onChange={e => setPreviewMargin(parseInt(e.target.value) || 20)}
                  style={{ width: '50px', padding: '2px 6px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ marginLeft: 'auto', color: '#5a5a70' }}>预览内容: {content.length} 字</span>
              </div>
              <div style={{
                padding: `${previewMargin}px`, maxHeight: '400px', overflow: 'auto',
                fontSize: `${previewFontSize}px`, lineHeight: previewLineHeight, color: '#d0d0e0',
                fontFamily: 'Georgia, "Noto Serif SC", serif', whiteSpace: 'pre-wrap',
              }}>
                {content || <span style={{ color: '#5a5a70', fontStyle: 'italic' }}>无内容预览</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 发布到平台 */}
      {activeTab === 'publish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#8a8aa0' }}>将内容适配到各平台格式，一键复制发布</p>

          {/* 内容输入 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
                outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '120px',
              }} placeholder="粘贴要发布的小说内容..." />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={handleAdaptAll} disabled={adapting || !content}
                style={{
                  padding: '10px 24px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  opacity: (adapting || !content) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                {adapting ? '⏳ 适配中...' : '🚀 一键适配所有平台'}
              </button>
              <span style={{ fontSize: '11px', color: '#6c6c80' }}>
                {content ? `${content.length} 字` : ''}
              </span>
            </div>
          </div>

          {/* 平台卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {Object.entries(platformMeta).map(([key, meta]) => {
              const data = adaptedResults[key];
              const previewText = data ? (data.content || data.title || '').substring(0, 200) : '';
              const hashtags = data?.hashtags || [];
              const wordCount = data ? (data.content || '').length : 0;
              const isSelected = selectedPlatform === key;

              return (
                <div key={key} onClick={() => { if (data) { setSelectedPlatform(key); setEditableContent(getAdaptPreview(key)); } }}
                  style={{
                    padding: '14px', backgroundColor: isSelected ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)',
                    borderRadius: '8px', border: `1px solid ${isSelected ? meta.accent : 'rgba(255,255,255,0.06)'}`,
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    cursor: data ? 'pointer' : 'default', transition: 'all 0.2s',
                    position: 'relative', overflow: 'hidden',
                  }}>
                  {/* 品牌色装饰条 */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                    backgroundColor: meta.accent, opacity: 0.7,
                  }} />

                  {/* 头部 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '18px' }}>{meta.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea' }}>{meta.name}</span>
                    {!data && <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#5a5a70' }}>待适配</span>}
                    {data && (
                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: meta.accent }}>
                        {wordCount} 字
                      </span>
                    )}
                  </div>

                  {/* 预览 */}
                  {data && (
                    <>
                      <div style={{
                        fontSize: '11px', color: '#a0a0b0', lineHeight: 1.5,
                        maxHeight: '60px', overflow: 'hidden',
                        backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '4px', padding: '6px 8px',
                      }}>
                        {previewText}{previewText.length >= 200 ? '...' : ''}
                      </div>

                      {/* 标签预览 */}
                      {hashtags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {hashtags.slice(0, 4).map((tag: string) => (
                            <span key={tag} style={{
                              fontSize: '10px', color: meta.accent, backgroundColor: `${meta.accent}15`,
                              padding: '2px 6px', borderRadius: '10px',
                            }}>#{tag}</span>
                          ))}
                          {hashtags.length > 4 && (
                            <span style={{ fontSize: '10px', color: '#6c6c80' }}>+{hashtags.length - 4}</span>
                          )}
                        </div>
                      )}

                      {/* 按钮组 */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                        <button onClick={(e) => { e.stopPropagation(); handleCopyToClipboard(key); }}
                          style={{
                            flex: 1, padding: '7px 0', backgroundColor: meta.accent, border: 'none',
                            borderRadius: '6px', color: '#fff', fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          📋 一键复制
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleCopyAndOpen(key); }}
                          style={{
                            padding: '7px 10px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '6px', color: '#c0c0d0', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                          }}>
                          复制+打开 ↗
                        </button>
                      </div>
                    </>
                  )}

                  {/* 未适配状态 */}
                  {!data && (
                    <button onClick={(e) => { e.stopPropagation(); handleAdaptSingle(key); }} disabled={!content}
                      style={{
                        padding: '7px 0', backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px', color: '#8a8aa0', fontSize: '11px', fontWeight: 600,
                        cursor: content ? 'pointer' : 'default', fontFamily: 'inherit',
                        opacity: content ? 1 : 0.5,
                      }}>
                      点击适配
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 适配预览面板 */}
          {selectedPlatform && adaptedResults[selectedPlatform] && (
            <div style={{
              border: `1px solid ${platformMeta[selectedPlatform]?.accent}40`,
              borderRadius: '8px', overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 12px',
                backgroundColor: `rgba(0,0,0,0.25)`,
                borderBottom: `1px solid ${platformMeta[selectedPlatform]?.accent}30`,
                display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px',
              }}>
                <span style={{ fontSize: '16px' }}>{platformMeta[selectedPlatform]?.icon}</span>
                <span style={{ color: '#eaeaea', fontWeight: 600 }}>{platformMeta[selectedPlatform]?.name} 适配预览</span>
                <span style={{ color: '#6c6c80', fontSize: '11px' }}>
                  {getAdaptPreview(selectedPlatform).length} 字
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleCopyToClipboard(selectedPlatform)}
                    style={{
                      padding: '5px 12px', backgroundColor: platformMeta[selectedPlatform]?.accent, border: 'none',
                      borderRadius: '5px', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    📋 一键复制
                  </button>
                  <button onClick={() => handleCopyAndOpen(selectedPlatform)}
                    style={{
                      padding: '5px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '5px', color: '#c0c0d0', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    复制+打开平台 ↗
                  </button>
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <textarea value={editableContent} onChange={e => setEditableContent(e.target.value)}
                  style={{
                    width: '100%', minHeight: '200px', padding: '12px', backgroundColor: 'rgba(0,0,0,0.15)',
                    border: 'none', color: '#d0d0e0', fontSize: '13px', fontFamily: 'inherit',
                    resize: 'vertical', outline: 'none', lineHeight: 1.7, boxSizing: 'border-box',
                  }} />
                {/* 变更高亮叠加层 */}
                <div style={{
                  position: 'absolute', bottom: '8px', right: '8px',
                  fontSize: '10px', color: '#2ecc71', backgroundColor: 'rgba(0,0,0,0.6)',
                  padding: '3px 8px', borderRadius: '4px', pointerEvents: 'none',
                }}>
                  ✨ 新增标签/格式已高亮
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 结果 */}
      {exportResult && (
        <div style={{
          padding: '14px', backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px', fontSize: '12px', color: '#c0c0d0', overflow: 'auto', maxHeight: '300px',
        }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(exportResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default ImportExportPage;
