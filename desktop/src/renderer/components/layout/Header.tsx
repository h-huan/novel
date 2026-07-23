import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { useDiscoveryStore } from '../../stores/discoveryStore';
import HelpPanel from '../common/HelpPanel';
import DictionaryModal from './DictionaryModal';
import PromptChainModal from './PromptChainModal';
import SettingsPage from '../../pages/SettingsPage';

/**
 * Header - 顶部导航栏
 *
 * 设计理念（VSCode / iDEA 风格）：
 *  1. 左上角 = 项目下拉选择器（最近打开项目 + 创建新项目）
 *  2. 灵感发现 → 统一走 close-project 回引导窗口（不在顶部单独放按钮）
 *  3. 字典 / Prompt Chain / 使用手册 → 弹框（Modal）
 *  4. 切换到引导窗口前检测后台任务
 */
const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { autoSaveStatus } = useAppStore();
  const { currentProject, projects, fetchProjects, selectProject } = useProjectStore();
  const { isCreating, hasActiveCreation, creationProgress, creationStepStatus } = useDiscoveryStore();

  const [helpOpen, setHelpOpen] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  const [promptChainOpen, setPromptChainOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 项目下拉选择器状态
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 后台任务确认对话框状态
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  // 判断是否在项目内部
  const isInProject = Boolean(currentProject) && location.pathname.startsWith('/project/');

  // ──────────────────── 后台任务检测 ────────────────────

  /** 是否有任何后台任务正在运行 */
  const hasRunningTasks = useMemo(() => {
    if (isCreating || hasActiveCreation) return true;
    return false;
  }, [isCreating, hasActiveCreation]);

  /** 获取当前任务描述文字 */
  const runningTaskLabel = useMemo(() => {
    if (isCreating || hasActiveCreation) {
      const progress = creationProgress > 0 ? ` (${creationProgress}%)` : '';
      const stepLabels: Record<string, string> = {
        project: '创建项目中', outline: '生成大纲中',
        characters: '生成角色中', world: '生成世界观中',
        orgs: '生成组织中', foreshadowing: '生成伏笔中',
      };
      const currentStep = Object.entries(creationStepStatus).find(([, v]) => v === 'running');
      if (currentStep) return `${stepLabels[currentStep[0]] || '处理中'}${progress}`;
      return `正在创建项目${progress}`;
    }
    return '';
  }, [isCreating, hasActiveCreation, creationProgress, creationStepStatus]);

  // ────────────── 安全离开：带任务检测的导航 ──────────────

  /** 尝试执行导航动作，有后台任务时弹确认框 */
  const navigateWithTaskCheck = useCallback((action: () => void) => {
    if (hasRunningTasks) {
      setPendingNavigation(() => action);
      setConfirmLeaveOpen(true);
    } else {
      action();
    }
  }, [hasRunningTasks]);

  const confirmLeave = useCallback(() => {
    setConfirmLeaveOpen(false);
    pendingNavigation?.();
    setPendingNavigation(null);
  }, [pendingNavigation]);

  const cancelLeave = useCallback(() => {
    setConfirmLeaveOpen(false);
    setPendingNavigation(null);
  }, []);

  // ────────────────── 回到引导窗口 ──────────────────

  /** 关闭当前项目，回到 launcher 窗口（用于创建新项目 / 灵感发现） */
  const goBackToLauncher = useCallback(() => {
    navigateWithTaskCheck(() => {
      window.electronAPI?.invoke('close-project').catch(() => {
        navigate('/');
      });
    });
  }, [navigate, navigateWithTaskCheck]);

  // ───────────── 项目下拉选择器逻辑 ─────────────

  /** 打开下拉时刷新项目列表（每次都刷新，保证最近打开顺序准确） */
  useEffect(() => {
    if (dropdownOpen) {
      fetchProjects();
    }
  }, [dropdownOpen, fetchProjects]);

  /** 点击外部关闭下拉 */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  /** 最近打开的项目（按 updatedAt 降序，排除当前项目，最多显示 8 个） */
  const recentProjects = useMemo(() => {
    return projects
      .filter((p) => p.id !== currentProject?.id)
      .sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA; // 最近修改的排前面
      })
      .slice(0, 8);
  }, [projects, currentProject?.id]);

  /** 切换项目 */
  const handleSwitchProject = useCallback(async (projectId: string) => {
    setDropdownOpen(false);
    await selectProject(projectId);
    navigate(`/project/${projectId}/dashboard`);
  }, [selectProject, navigate]);

  // ─────────────────── 样式常量 ───────────────────

  const saveLabel: Record<string, string> = {
    saved: '已保存', saving: '保存中...', error: '保存失败', idle: '',
  };

  // 下拉面板样式
  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    minWidth: '280px',
    maxHeight: '400px',
    overflowY: 'auto',
    backgroundColor: '#1e1e36',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    zIndex: 100,
    padding: '6px',
  };

  /** 通用列表项样式 */
  const itemStyle = (
    opts: { isActive?: boolean; hoverable?: boolean; danger?: boolean } = {}
  ): React.CSSProperties & { _hover?: React.CSSProperties } => {
    const { isActive = false, hoverable = true, danger = false } = opts;
    const base: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '8px 10px', borderRadius: '6px',
      cursor: hoverable ? 'pointer' : 'default',
      fontSize: '13px', fontWeight: isActive ? 600 : 400,
      color: danger ? '#e94560' : isActive ? '#e94560' : '#c0c0d0',
      backgroundColor: isActive ? 'rgba(233,69,96,0.08)' : 'transparent',
      transition: 'background-color 0.12s, color 0.12s',
    };
    return base;
  };

  // ─────────────────── 渲染 ───────────────────

  return (
    <header className="drag-region h-header bg-bg-secondary border-b border-border flex items-center justify-between px-4 select-none">
      {/* Left: Project Selector + Tool Buttons */}
      <div className="flex items-center gap-2">
        {isInProject ? (
          <>
            {/* ════════ 项目下拉选择器（VSCode/iDEA 风格） ════════ */}
            <div ref={dropdownRef} className="relative no-drag">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-md transition-colors duration-150 hover:bg-white/5"
                title="切换项目或创建新项目"
              >
                {/* 项目图标 */}
                <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-current text-accent" style={{ flexShrink: 0 }}>
                  <path d="M2 2h4v4H2V2zm6 0h4v4H8V2zM2 8h4v4H2V8zm6 0h4v4H8V8z" opacity="0.8" />
                </svg>
                {/* 当前项目名 */}
                <span className="text-text-primary font-medium truncate max-w-[180px]">
                  {currentProject?.title || '未命名项目'}
                </span>
                {/* 展开箭头 */}
                <svg
                  viewBox="0 0 12 12"
                  className={`w-3 h-3 fill-current text-text-muted transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                  style={{ flexShrink: 0 }}
                >
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* ═══════ 下拉面板内容 ═══════ */}
              {dropdownOpen && (
                <div style={dropdownStyle} className="custom-scrollbar">
                  {/* ① 当前项目（置顶高亮） */}
                  <div
                    style={{ ...itemStyle({ isActive: true, hoverable: false }), paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '4px' }}
                  >
                    <span style={{ flex: 1 }}>{currentProject?.title || '未命名'}</span>
                    <span style={{ fontSize: '11px', color: '#e94560' }}>✓ 当前</span>
                  </div>

                  {/* ② 最近打开的项目 */}
                  {recentProjects.length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#6c6c80', padding: '4px 6px 2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        最近打开
                      </div>
                      {recentProjects.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => handleSwitchProject(p.id)}
                          style={itemStyle()}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                          <span style={{ fontSize: '10px', color: '#6c6c80', flexShrink: 0 }}>
                            {p.wordCount >= 1000 ? `${(p.wordCount / 1000).toFixed(1)}k` : `${p.wordCount}`}字
                          </span>
                        </div>
                      ))}
                      <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                    </>
                  )}

                  {/* ③ 创建新项目 → 回到引导窗口的灵感发现流程 */}
                  <div
                    onClick={() => { setDropdownOpen(false); goBackToLauncher(); }}
                    style={itemStyle()}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(233,69,96,0.08)'; e.currentTarget.style.color = '#e94560'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#c0c0d0'; }}
                  >
                    <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" style={{ flexShrink: 0 }}>
                      <path d="M7 1v12M1 7h12" stroke="#e94560" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span style={{ color: 'inherit' }}>创建新项目</span>
                    <span style={{ fontSize: '9px', color: '#6c6c80', marginLeft: 'auto' }}>从灵感开始</span>
                  </div>
                </div>
              )}
            </div>

            {/* ════════ 工具类弹框按钮（字典 / Chain / 手册） ════════ */}
            <div className="flex items-center gap-0.5 ml-1 no-drag">
              {/* 使用手册弹框 */}
              <button
                onClick={() => setHelpOpen(true)}
                className={`px-2.5 py-1 text-xs rounded transition-colors duration-150 ${
                  helpOpen
                    ? 'text-green-400 bg-green-400/10'
                    : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
                }`}
                title="使用手册"
              >
                📖 使用手册
              </button>
            </div>
          </>
        ) : (
          /* 不在项目内时：只显示平台名 */
          <h1 className="text-text-primary text-sm font-medium truncate max-w-[300px]">
            AI 写作平台
          </h1>
        )}
      </div>

      {/* Right: Status + Window Controls */}
      <div className="flex items-center gap-1 no-drag">
        {/* Auto-save indicator */}
        {autoSaveStatus !== 'idle' && (
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              autoSaveStatus === 'saved'
                ? 'text-success bg-success/10'
                : autoSaveStatus === 'saving'
                  ? 'text-warning bg-warning/10'
                  : 'text-accent bg-accent/10'
            }`}
          >
            {saveLabel[autoSaveStatus]}
          </span>
        )}

        {/* Settings */}
        <button
          className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          title="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
            <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M7.2 0h1.6l.5 1.6c.3.1.7.3 1 .5l1.5-.7 1.2 1.2-.7 1.5c.2.3.4.7.5 1l1.6.5v1.6l-1.6.5c-.1.3-.3.7-.5 1l.7 1.5-1.2 1.2-1.5-.7c-.3.2-.7.4-1 .5l-.5 1.6H7.2l-.5-1.6c-.3-.1-.7-.3-1-.5l-1.5.7-1.2-1.2.7-1.5c-.2-.3-.4-.7-.5-1L1.6 8.4V6.8l1.6-.5c.1-.3.3-.7.5-1l-.7-1.5 1.2-1.2 1.5.7c.3-.2.7-.4 1-.5L7.2 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Window Controls */}
        <div className="flex items-center ml-2">
          <button className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors" title="最小化">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><rect x="2" y="7" width="12" height="1.5" rx="0.3" /></svg>
          </button>
          <button className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors" title="最大化">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button className="p-1.5 rounded-md text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors" title="关闭">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* ═══════ 弹框组件 ═══════ */}
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <DictionaryModal open={dictOpen} onClose={() => setDictOpen(false)} />
      <PromptChainModal open={promptChainOpen} onClose={() => setPromptChainOpen(false)} />
      {settingsOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1900, backgroundColor: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px' }}
          onClick={() => setSettingsOpen(false)}
        >
          <div
            style={{ width: 'min(920px, 92vw)', maxHeight: '88vh', overflow: 'auto', backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', boxShadow: '0 24px 80px rgba(0,0,0,0.55)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0' }}>
              <button onClick={() => setSettingsOpen(false)} style={{ width: '28px', height: '28px', border: 'none', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.06)', color: '#c0c0d0', cursor: 'pointer' }}>×</button>
            </div>
            <SettingsPage />
          </div>
        </div>
      )}

      {/* ═══════ 后台任务确认对话框 ═══════ */}
      {confirmLeaveOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.65)' }}
          onClick={cancelLeave}
        >
          <div
            style={{ width: '420px', maxWidth: '90vw', backgroundColor: '#1a1a2e', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>⚠️</div>
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#eaeaea' }}>有任务正在运行</h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#c0c0d0', lineHeight: 1.6 }}>
                {runningTaskLabel}，切换页面可能会导致任务中断或进度丢失。<br />确定要离开吗？
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={cancelLeave} style={{ padding: '8px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', backgroundColor: 'transparent', color: '#8a8aa0', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                继续留在当前页面
              </button>
              <button onClick={confirmLeave} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: '#e94560', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                确定离开
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
