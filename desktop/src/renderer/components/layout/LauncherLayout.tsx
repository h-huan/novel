/**
 * LauncherLayout - 引导窗口布局
 *
 * 极简设计，类似 IDEA 欢迎窗口：
 * - 顶部：标题栏（AI写作平台）+ 最小化/关闭按钮
 * - 底部：服务器状态（仅 Electron 模式）
 * - 中间：内容区
 * - 没有侧边栏，没有复杂 Header
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';
import { setBaseUrl } from '../../lib/api';

/** 是否运行在 Electron 中（有 IPC 通道）*/
const isElectron = !!window.electronAPI?.invoke;

/** 引导窗口顶部全局导航（落地页=工作台，项目管理独立到 /projects） */
const LAUNCHER_NAV: Array<{ to: string; label: string }> = [
  { to: '/', label: '工作台' },
  { to: '/projects', label: '我的项目' },
  { to: '/discover', label: '灵感发现' },
  { to: '/module-standards', label: '系统工作流规则' },
];

interface LauncherLayoutProps {
  children: React.ReactNode;
}

const LauncherLayout: React.FC<LauncherLayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { serverStatus, serverError, startHealthPolling, stopHealthPolling } = useAppStore();

  // Web 模式下的后端健康检查状态
  const [webBackendOk, setWebBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (isElectron) {
      // Electron 模式：通过 IPC 监听服务器状态
      startHealthPolling();

      const handleServerStatus = (status: { running: boolean; port?: number }) => {
        if (status.port) {
          setBaseUrl(status.port);
        }
      };

      window.electronAPI?.on('server-status', handleServerStatus);

      return () => {
        stopHealthPolling();
        window.electronAPI?.removeAllListeners('server-status');
      };
    } else {
      // Web 模式：直接用 fetch 健康检查
      let cancelled = false;
      const check = async () => {
        try {
          const res = await fetch('/api/v1/health', { signal: AbortSignal.timeout(3000) });
          if (!cancelled) setWebBackendOk(res.ok);
        } catch {
          if (!cancelled) setWebBackendOk(false);
        }
      };
      check();
      const timer = setInterval(check, 15_000);
      return () => { cancelled = true; clearInterval(timer); }
    }
  }, [startHealthPolling, stopHealthPolling]);

  // 判断是否显示服务状态横幅
  const showServerBanner = isElectron
    ? serverStatus === 'offline' || serverStatus === 'connecting'
    : webBackendOk === false;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Server status banner */}
      {showServerBanner && (
        <div style={{
          padding: '6px 16px',
          backgroundColor: isElectron
            ? (serverStatus === 'connecting' ? 'rgba(245,158,11,0.1)' : 'rgba(231,76,60,0.15)')
            : 'rgba(231,76,60,0.15)',
          borderBottom: `1px solid ${isElectron
            ? (serverStatus === 'connecting' ? 'rgba(245,158,11,0.2)' : 'rgba(231,76,60,0.3)')
            : 'rgba(231,76,60,0.3)'}`,
          textAlign: 'center',
          fontSize: 'var(--font-size-xs)',
          color: isElectron
            ? (serverStatus === 'connecting' ? 'var(--color-warning)' : 'var(--color-danger)')
            : 'var(--color-danger)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
        }}>
          {isElectron ? (
            <>
              {serverStatus === 'connecting' ? '🟡 正在连接服务器...' : <>🔴 {serverError || '服务器未连接'} — 尝试启动中...&nbsp;</>}
              {serverStatus === 'offline' && (
                <button onClick={() => startHealthPolling()} style={{
                  padding: '2px 10px', backgroundColor: 'rgba(231,76,60,0.2)', border: '1px solid rgba(231,76,60,0.3)',
                  borderRadius: '4px', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit',
                }}>重试</button>
              )}
            </>
          ) : (
            <>🔴 后端服务未响应（部分功能不可用）&nbsp;
              <button onClick={() => {
                setWebBackendOk(null);
                fetch('/api/v1/health').then(r => setWebBackendOk(r.ok)).catch(() => setWebBackendOk(false));
              }} style={{
                padding: '2px 10px', backgroundColor: 'rgba(231,76,60,0.2)', border: '1px solid rgba(231,76,60,0.3)',
                borderRadius: '4px', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit',
              }}>重试</button>
            </>
          )}
        </div>
      )}

      {/* 极简 Header */}
      <header className="drag-region h-12 bg-bg-secondary border-b border-border flex items-center justify-between px-4 select-none flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-accent font-bold text-sm select-none">✦ 写作工作台</span>
          <div className="flex items-center gap-1 no-drag">
            {LAUNCHER_NAV.map(tab => {
              const active = tab.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(tab.to);
              return (
                <button
                  key={tab.to}
                  onClick={() => navigate(tab.to)}
                  className={`px-3 py-1 text-[13px] rounded-md transition-colors duration-150 ${
                    active ? 'text-accent bg-accent/10 font-semibold' : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1 no-drag">
          <button
            className="p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            title="设置"
            onClick={() => navigate('/settings')}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M7.2 0h1.6l.5 1.6c.3.1.7.3 1 .5l1.5-.7 1.2 1.2-.7 1.5c.2.3.4.7.5 1l1.6.5v1.6l-1.6.5c-.1.3-.3.7-.5 1l.7 1.5-1.2 1.2-1.5-.7c-.3.2-.7.4-1 .5l-.5 1.6H7.2l-.5-1.6c-.3-.1-.7-.3-1-.5l-1.5.7-1.2-1.2.7-1.5c-.2-.3-.4-.7-.5-1L1.6 8.4V6.8l1.6-.5c.1-.3.3-.7.5-1l-.7-1.5 1.2-1.2 1.5.7c.3-.2.7-.4 1-.5L7.2 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </header>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-bg-primary">
        {children}
      </main>
    </div>
  );
};

export default LauncherLayout;
