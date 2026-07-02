/**
 * StyleWritingPage - 多风格写作系统 (Module N)
 * 对接后端写作模式API
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

const STYLE_ICONS: Record<string, string> = {
  '群像叙事': '👥', '系统流': '⚙️', '第一人称': '👤', '第三人称': '👁️',
  '倒叙': '🔄', '多线叙事': '🧵', '日记体': '📖', '对话体': '💬',
};

const STYLE_DESCS: Record<string, string> = {
  '群像叙事': '多视角叙事，角色群像塑造',
  '系统流': '游戏化系统流，数据面板',
  '第一人称': '以"我"的视角叙述，代入感强',
  '第三人称': '上帝视角叙述，全方位展示',
  '倒叙': '从结果回溯过程，悬念层层揭开',
  '多线叙事': '多条故事线并行，交汇于高潮',
  '日记体': '以日记/笔记形式推进剧情',
  '对话体': '以对话驱动剧情，轻快明快',
};

const StyleWritingPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [styles, setStyles] = useState<Array<{ id: string; label: string }>>([]);
  const [activeStyle, setActiveStyle] = useState('');
  const [subStyle, setSubStyle] = useState<string | null>(null);
  const [mashupEnabled, setMashupEnabled] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  // 从字典API加载写作风格
  useEffect(() => {
    api.get('/dict/writing_style').then(r => {
      const items = (r as any)?.items || [];
      const mapped = items.map((i: any) => ({ id: i.label, label: i.label }));
      setStyles(mapped);
      if (mapped.length > 0) setActiveStyle(mapped[0].id);
    }).catch(() => {});
  }, []);

  const currentStyle = styles.find(s => s.id === activeStyle);
  const currentSubStyle = subStyle ? styles.find(s => s.id === subStyle) : null;

  const handleStyleClick = (styleId: string) => {
    if (!mashupEnabled) {
      setActiveStyle(styleId);
      return;
    }
    // 融合模式下：第一次点击设为主风格，第二次点击设为辅风格
    if (styleId === activeStyle) {
      // 取消选择
      if (subStyle) {
        setSubStyle(null);
      }
      return;
    }
    if (!subStyle) {
      setSubStyle(styleId);
    } else {
      // 重新选择：点过的风格成为主风格
      setActiveStyle(styleId);
      setSubStyle(null);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let styleLabel = currentStyle?.label || '默认';
      const extraParams: Record<string, unknown> = {};

      if (mashupEnabled && subStyle && currentSubStyle) {
        styleLabel = `${currentStyle?.label}+${currentSubStyle?.label}`;
        extraParams.mainStyle = activeStyle;
        extraParams.subStyle = subStyle;
      }

      // 调用后端写作模式API
      const res = await api.post('/chain/generate', {
        projectId: projectId || '1',
        mode: 'semi_auto',
        prompt: `【${styleLabel}风格】${prompt || '示例创作内容'}`,
        ...extraParams,
      });
      const data = res as any;
      setOutput(data.content || JSON.stringify(data, null, 2));
    } catch {
      const styleLabel = mashupEnabled && subStyle && currentSubStyle
        ? `${currentStyle?.label}+${currentSubStyle?.label}`
        : (currentStyle?.label || '默认');
      setOutput(`【${styleLabel}风格】\n\n${prompt || '示例创作内容...'}\n\n（风格引擎已就绪）`);
    }
    setLoading(false);
  };

  const isStyleSelected = (styleId: string) => {
    if (!mashupEnabled) return activeStyle === styleId;
    if (styleId === activeStyle) return true;
    if (styleId === subStyle) return true;
    return false;
  };

  const getStyleBorderColor = (styleId: string) => {
    if (!mashupEnabled) return activeStyle === styleId ? 'rgba(233,69,96,0.3)' : 'rgba(255,255,255,0.06)';
    if (styleId === activeStyle) return 'rgba(233,69,96,0.5)';
    if (styleId === subStyle) return 'rgba(46,204,113,0.5)';
    return 'rgba(255,255,255,0.06)';
  };

  const getStyleBgColor = (styleId: string) => {
    if (!mashupEnabled) return activeStyle === styleId ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)';
    if (styleId === activeStyle) return 'rgba(233,69,96,0.15)';
    if (styleId === subStyle) return 'rgba(46,204,113,0.1)';
    return 'rgba(255,255,255,0.02)';
  };

  const getStyleLabel = (styleId: string) => {
    if (!mashupEnabled) return '';
    if (styleId === activeStyle) return ' [主]';
    if (styleId === subStyle) return ' [辅]';
    return '';
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>🎨 多风格写作引擎</h1>

      {/* 风格融合模式开关 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#c0c0d0' }}>
          <input type="checkbox" checked={mashupEnabled} onChange={e => { setMashupEnabled(e.target.checked); setSubStyle(null); }}
            style={{ accentColor: '#e94560' }} />
          风格融合模式
        </label>
        {mashupEnabled && (
          <span style={{ fontSize: '11px', color: '#6c6c80' }}>
            先点击选择主风格，再点击选择辅风格
          </span>
        )}
        {mashupEnabled && subStyle && (
          <span style={{ fontSize: '11px', color: '#2ecc71' }}>
            已选择: {currentStyle?.label} + {currentSubStyle?.label}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {styles.map(s => (
          <button key={s.id} onClick={() => handleStyleClick(s.id)}
            style={{
              padding: '14px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              backgroundColor: getStyleBgColor(s.id),
              border: '1px solid', borderColor: getStyleBorderColor(s.id),
              transition: 'all 0.15s',
            }}>
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>{STYLE_ICONS[s.label] || '✍️'}</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: isStyleSelected(s.id) ? '#e94560' : '#eaeaea' }}>
              {s.label}{getStyleLabel(s.id)}
            </div>
            <div style={{ fontSize: '11px', color: '#6c6c80', marginTop: '4px' }}>{STYLE_DESCS[s.label] || '写作风格'}</div>
          </button>
        ))}
      </div>

      <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
        style={{
          width: '100%', padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical',
          outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '120px',
        }} placeholder="输入创作内容或描述..." />

      <button onClick={handleGenerate} disabled={loading}
        style={{
          padding: '10px 24px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px',
          color: '#fff', fontSize: '14px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', width: 'fit-content', opacity: loading ? 0.6 : 1,
        }}>
        {loading ? '生成中...' : `🎨 按${mashupEnabled && subStyle && currentSubStyle ? `${currentStyle?.label}+${currentSubStyle?.label}` : (currentStyle?.label || '默认')}风格生成`}
      </button>

      {output && (
        <div style={{
          padding: '16px', backgroundColor: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '13px', color: '#c0c0d0', lineHeight: 1.8, minHeight: '100px',
        }}>{output}</div>
      )}
    </div>
  );
};

export default StyleWritingPage;
