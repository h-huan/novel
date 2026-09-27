import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { setBaseUrl } from '../../lib/api';
import { getGenerationRecovery, startFailedProjectRecovery } from '../../lib/generationRecovery';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { serverStatus, serverError, startHealthPolling, stopHealthPolling } = useAppStore();
  const { currentProject, fetchProject } = useProjectStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState<{ canResume: boolean; running: boolean; recommendedAction: string; missingModules: string[]; consistencyIssues: string[]; protectionReasons: string[] } | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  // 从 URL 提取项目 ID
  const urlProjectId = useMemo(() => {
    const match = location.pathname.match(/^\/project\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  // 路由切到另一项目时也重新读取，不能沿用缓存的上一本书。
  useEffect(() => {
    if (urlProjectId && currentProject?.id !== urlProjectId) {
      void fetchProject(urlProjectId);
    }
  }, [urlProjectId, currentProject?.id, fetchProject]);

  // 这里曾凭缓存的 currentProject 在全局发现/项目列表显示项目侧栏，离开项目后留下空白导航。
  // 项目导航只由当前 URL 决定；全局页即使缓存了上一本书，也不能显示书内侧栏。
  const hasProject = Boolean(urlProjectId && currentProject?.id === urlProjectId);

  useEffect(() => {
    startHealthPolling();

    // 监听固定服务端的就绪状态
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
  }, [startHealthPolling, stopHealthPolling]);

  useEffect(() => {
    if (currentProject?.status !== 'generation_failed') {
      setRecovery(null);
      setRecoveryMessage('');
      return;
    }
    let cancelled = false;
    getGenerationRecovery(currentProject.id)
      .then((audit) => {
        if (!cancelled) setRecovery(audit);
      })
      .catch((error: Error) => {
        if (!cancelled) setRecoveryMessage(`无法读取恢复诊断：${error.message}`);
      });
    return () => { cancelled = true; };
  }, [currentProject?.id, currentProject?.status]);

  const resumeFailedGeneration = async () => {
    if (!currentProject || recoveryBusy) return;
    if (recovery?.running) {
      navigate(`/generation-progress/${currentProject.id}`, { state: { title: currentProject.title } });
      return;
    }
    if (!recovery?.canResume) return;
    setRecoveryBusy(true);
    setRecoveryMessage('正在启动重新生成并打开进度页……');
    try {
      await startFailedProjectRecovery(currentProject.id);
      navigate(`/generation-progress/${currentProject.id}`, { state: { title: currentProject.title } });
    } catch (error: any) {
      try {
        const audit = await getGenerationRecovery(currentProject.id);
        setRecovery(audit);
        if (audit?.running) {
          navigate(`/generation-progress/${currentProject.id}`, { state: { title: currentProject.title } });
          return;
        }
      } catch {}
      setRecoveryMessage(`启动失败：${error?.message || '未知错误'}`);
    } finally {
      setRecoveryBusy(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Server status banner */}
      {serverStatus === 'offline' && (
        <div style={{
          padding: '6px 16px', backgroundColor: 'rgba(231,76,60,0.15)',
          borderBottom: '1px solid rgba(231,76,60,0.3)', textAlign: 'center',
          fontSize: '14px', color: 'var(--color-danger)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
        }}>
          🔴 {serverError || '服务器未连接'} — 尝试启动中...&nbsp;
          <button onClick={() => startHealthPolling()} style={{
            padding: '2px 10px', backgroundColor: 'rgba(231,76,60,0.2)', border: '1px solid rgba(231,76,60,0.3)',
            borderRadius: '4px', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit',
          }}>重试</button>
        </div>
      )}
      {serverStatus === 'connecting' && (
        <div style={{
          padding: '6px 16px', backgroundColor: 'rgba(245,158,11,0.1)',
          borderBottom: '1px solid rgba(245,158,11,0.2)', textAlign: 'center',
          fontSize: '14px', color: 'var(--color-warning)',
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
          {urlProjectId === currentProject?.id && currentProject?.status === 'generation_failed' && (
            <div style={{
              margin: '12px 16px 0', padding: '12px 14px', borderRadius: 8,
              backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.34)',
              color: '#fbd38d', fontSize: 14, lineHeight: 1.55,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 260, flex: '1 1 520px' }}>
                <div style={{ fontWeight: 700 }}>{recovery?.running ? '正在重新生成创作资料，当前资料只读。' : '项目创建失败，当前资料只读，不能进入正文或继续修改。'}</div>
                <div style={{ marginTop: 4 }}>{recovery?.running ? '可以打开进度页查看当前阶段。' : '恢复方式：手动触发。系统会先建立快照；恢复失败会还原旧资料，不会清空后丢失。'}</div>
                {recovery?.recommendedAction && <div style={{ marginTop: 4, color: '#fde68a' }}>下一步：{recovery.recommendedAction}</div>}
                {!!recovery?.missingModules?.length && <div style={{ marginTop: 4, color: '#fca5a5' }}>未完成：{recovery.missingModules.join('、')}</div>}
                {!!recovery?.consistencyIssues?.length && <div style={{ marginTop: 4, color: '#fca5a5' }}>一致性问题：{recovery.consistencyIssues.join('；')}</div>}
                {!!recovery?.protectionReasons?.length && <div style={{ marginTop: 4, color: '#fca5a5' }}>自动恢复已保护：{recovery.protectionReasons.join('；')}</div>}
                {recoveryMessage && <div style={{ marginTop: 5, color: '#bfdbfe' }}>{recoveryMessage}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" onClick={resumeFailedGeneration} disabled={(!recovery?.canResume && !recovery?.running) || recoveryBusy} style={{
                  padding: '7px 11px', borderRadius: 6, border: '1px solid rgba(251,211,141,0.45)',
                  backgroundColor: (recovery?.canResume || recovery?.running) && !recoveryBusy ? 'var(--color-warning)' : 'var(--color-bg-elevated)', color: 'var(--color-white)', cursor: (recovery?.canResume || recovery?.running) && !recoveryBusy ? 'pointer' : 'not-allowed',
                }}>{recoveryBusy ? '正在启动…' : recovery?.running ? '查看生成进度' : '继续准备创作资料'}</button>
                <button type="button" onClick={() => navigate(`/project/${currentProject.id}/dashboard`)} style={{
                  padding: '7px 11px', borderRadius: 6, border: '1px solid rgba(251,211,141,0.45)',
                  backgroundColor: 'rgba(0,0,0,0.18)', color: 'var(--color-white)', cursor: 'pointer',
                }}>查看完整诊断</button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

    </div>
  );
};

export default AppLayout;
