/**
 * ImmersiveView - 沉浸式创作视图
 *
 * 激活方式：F11快捷键 / 右键菜单切换
 * 视图布局：
 *   - 中央：全宽编辑器（Monaco，隐藏菜单栏/工具栏）
 *   - 左侧迷你栏：当前章大纲（可折叠为图标）
 *   - 右侧迷你栏：出场角色状态（最新24维快照）
 *   - 底部：字数统计+生成进度+自动保存状态
 * 退出：Esc键或F11返回标准视图
 * 适用场景：精写/修改/校对时使用，减少视觉干扰
 * 可选配置：用户可自定义沉浸视图显示哪些面板
 *
 * 设计原则：简洁明了，可视化操作
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChapterStore } from '../stores/chapterStore';
import { useProjectStore } from '../stores/projectStore';
import { api } from '../lib/api';

const ImmersiveView: React.FC = () => {
  const { id: projectId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const { chapters, fetchChapters } = useChapterStore();

  const [content, setContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [outline, setOutline] = useState<string>('');
  const [characters, setCharacters] = useState<Array<{ name: string; status: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // 加载章节内容
  useEffect(() => {
    if (!projectId || !chapterId) return;

    const loadChapter = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ content: string; wordCount: number }>(
          `/projects/${projectId}/chapters/${chapterId}`
        );
        setContent(res.data.content || '');
        setWordCount(res.data.wordCount || 0);
      } catch (err) {
        console.error('加载章节失败', err);
      } finally {
        setLoading(false);
      }
    };

    loadChapter();
    fetchChapters(projectId);
  }, [projectId, chapterId]);

  // 加载大纲和角色状态
  useEffect(() => {
    if (!projectId) return;

    const loadMeta = async () => {
      try {
        const [outlineRes, charRes] = await Promise.all([
          api.get<any[]>(`/projects/${projectId}/outlines`).catch(() => ({ data: [] as any[] } as any)),
          api.get<any[]>(`/projects/${projectId}/characters`).catch(() => ({ data: [] as any[] } as any)),
        ]);
        // 大纲简要信息
        const outlineData = (outlineRes as any).data || [];
        setOutline(outlineData.slice(0, 5).map((o: any) => o.title).join('\n'));
        // 角色状态
        const charData = (charRes as any).data || [];
        setCharacters(charData.slice(0, 8).map((c: any) => ({
          name: c.name,
          status: c.status ? '正常' : '异常',
        })));
      } catch {
        // 忽略错误，沉浸式视图中元数据是可选的
      }
    };

    loadMeta();
  }, [projectId]);

  // 自动保存
  useEffect(() => {
    if (saveStatus !== 'unsaved') return;
    const timer = setTimeout(() => {
      handleSave();
    }, 30000); // 30秒自动保存
    return () => clearTimeout(timer);
  }, [content, saveStatus]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || (e.key === 'F11')) {
        e.preventDefault();
        handleExit();
      }
      // Ctrl+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleContentChange = (value: string) => {
    setContent(value);
    setWordCount(value.replace(/\s/g, '').length);
    setSaveStatus('unsaved');
  };

  const handleSave = async () => {
    if (!projectId || !chapterId) return;
    setSaveStatus('saving');
    try {
      await api.put(`/projects/${projectId}/chapters/${chapterId}`, {
        content,
        wordCount,
      });
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (err) {
      console.error('保存失败', err);
      setSaveStatus('unsaved');
    }
  };

  const handleExit = () => {
    if (saveStatus === 'unsaved') {
      const confirm = window.confirm('有未保存的修改，是否保存？');
      if (confirm) {
        handleSave();
      }
    }
    navigate(`/project/${projectId}/editor/${chapterId}`);
  };

  // 简易 Markdown 渲染（沉浸式视图中用 textarea 编辑，预览用简单渲染）
  const renderPreview = () => {
    return content.split('\n').map((line, i) => {
      if (line.startsWith('# ')) {
        return <h1 key={i} style={{ fontSize: '24px', fontWeight: 700, margin: '16px 0 8px', color: '#e0e0e8' }}>{line.slice(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={i} style={{ fontSize: '20px', fontWeight: 600, margin: '12px 0 6px', color: '#d0d0d8' }}>{line.slice(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={i} style={{ fontSize: '16px', fontWeight: 600, margin: '8px 0 4px', color: '#c0c0c8' }}>{line.slice(4)}</h3>;
      }
      if (line.trim() === '') {
        return <br key={i} />;
      }
      return <p key={i} style={{ margin: '0 0 8px', lineHeight: 1.8, color: '#c8c8d0' }}>{line}</p>;
    });
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0f', color: '#8a8aa0' }}>
        加载中...
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        backgroundColor: '#0a0a0f',
        color: '#c8c8d0',
        fontFamily: "'Noto Serif SC', 'Source Han Serif SC', serif",
        overflow: 'hidden',
      }}
    >
      {/* 左侧迷你栏：大纲 */}
      {showLeftPanel && (
        <div
          style={{
            width: '200px',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            padding: '16px',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', marginBottom: '8px', letterSpacing: '0.05em' }}>
            大纲
          </div>
          <pre style={{ fontSize: '12px', color: '#a0a0b0', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {outline || '暂无大纲'}
          </pre>
        </div>
      )}

      {/* 中央编辑器 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 顶部工具栏（极简） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowLeftPanel(!showLeftPanel)}
              style={{
                background: 'none',
                border: 'none',
                color: '#8a8aa0',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
              }}
              title="切换大纲面板"
            >
              ☰
            </button>
            <span style={{ fontSize: '12px', color: '#6c6c80' }}>
              {currentProject?.title || '未命名项目'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: saveStatus === 'saved' ? '#2ecc71' : saveStatus === 'saving' ? '#f39c12' : '#e94560' }}>
              {saveStatus === 'saved' ? '✓ 已保存' : saveStatus === 'saving' ? '保存中...' : '未保存'}
            </span>
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              style={{
                background: 'none',
                border: 'none',
                color: '#8a8aa0',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
              }}
              title="切换角色面板"
            >
              👤
            </button>
          </div>
        </div>

        {/* 编辑区域 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 编辑模式 */}
          <textarea
            ref={editorRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              color: '#c8c8d0',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '24px 48px',
              fontSize: '16px',
              lineHeight: 1.8,
              fontFamily: "'Noto Serif SC', 'Source Han Serif SC', serif",
              letterSpacing: '0.02em',
            }}
            placeholder="开始写作..."
          />
        </div>

        {/* 底部状态栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 16px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            fontSize: '11px',
            color: '#6c6c80',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>字数: {wordCount.toLocaleString()}</span>
            <span>章节: {chapters.find(c => c.id === chapterId)?.chapterIndex ?? '-'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span>最后保存: {lastSaved.toLocaleTimeString()}</span>
            <span>Esc/F11 退出</span>
          </div>
        </div>
      </div>

      {/* 右侧迷你栏：角色状态 */}
      {showRightPanel && (
        <div
          style={{
            width: '200px',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            padding: '16px',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', marginBottom: '8px', letterSpacing: '0.05em' }}>
            出场角色
          </div>
          {characters.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#6c6c80' }}>暂无角色</div>
          ) : (
            characters.map((char, idx) => (
              <div
                key={idx}
                style={{
                  padding: '6px 8px',
                  marginBottom: '4px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: char.status === '正常' ? '#2ecc71' : '#e94560',
                    }}
                  />
                  <span style={{ color: '#c0c0d0' }}>{char.name}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ImmersiveView;
