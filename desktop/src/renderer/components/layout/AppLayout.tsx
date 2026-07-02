import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';
import OnboardingModal from '../common/OnboardingModal';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { setBaseUrl } from '../../lib/api';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const { serverStatus, serverError, startHealthPolling } = useAppStore();
  const { currentProject } = useProjectStore();
  const location = useLocation();

  // 判断是否有打开的项目（侧边栏应该始终显示）
  const hasProject = Boolean(currentProject);

  useEffect(() => {
    const completed = localStorage.getItem('onboarding_complete');
    if (!completed) {
      setOnboardingOpen(true);
    }
    startHealthPolling();

    // 监听服务端实际端口（支持端口 fallback 场景）
    const handleServerStatus = (status: { running: boolean; port?: number }) => {
      if (status.port) {
        setBaseUrl(status.port);
      }
    };

    window.electronAPI?.on('server-status', handleServerStatus);

    return () => {
      window.electronAPI?.removeAllListeners('server-status');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOnboardingClose = () => {
    localStorage.setItem('onboarding_complete', 'true');
    setOnboardingOpen(false);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Server status banner */}
      {serverStatus === 'offline' && (
        <div style={{
          padding: '6px 16px', backgroundColor: 'rgba(231,76,60,0.15)',
          borderBottom: '1px solid rgba(231,76,60,0.3)', textAlign: 'center',
          fontSize: '12px', color: '#e74c3c', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
        }}>
          🔴 {serverError || '服务器未连接'} — 尝试启动中...&nbsp;
          <button onClick={() => startHealthPolling()} style={{
            padding: '2px 10px', backgroundColor: 'rgba(231,76,60,0.2)', border: '1px solid rgba(231,76,60,0.3)',
            borderRadius: '4px', color: '#e74c3c', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit',
          }}>重试</button>
        </div>
      )}
      {serverStatus === 'connecting' && (
        <div style={{
          padding: '6px 16px', backgroundColor: 'rgba(245,158,11,0.1)',
          borderBottom: '1px solid rgba(245,158,11,0.2)', textAlign: 'center',
          fontSize: '12px', color: '#f59e0b',
        }}>
          🟡 正在连接服务器...
        </div>
      )}

      {/* Header */}
      <Header />

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* 项目已打开时显示侧边栏（包含所有项目功能tab） */}
        {hasProject && <Sidebar />}

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-bg-primary">
          {children}
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Onboarding Modal */}
      <OnboardingModal open={onboardingOpen} onClose={handleOnboardingClose} />
    </div>
  );
};

export default AppLayout;
