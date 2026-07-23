import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import StatusBar from './StatusBar';
import { useAppStore } from '../../stores/appStore';
import { useProjectStore } from '../../stores/projectStore';
import { setBaseUrl } from '../../lib/api';
import { api } from '../../lib/api';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { serverStatus, serverError, startHealthPolling } = useAppStore();
  const { currentProject } = useProjectStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState<{ canResume: boolean; running: boolean; recommendedAction: string; missingModules: string[]; consistencyIssues: string[]; protectionReasons: string[] } | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  // 判断是否有打开的项目（侧边栏应该始终显示）
  const hasProject = Boolean(currentProject);

  useEffect(() => {
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

  useEffect(() => {
    if (currentProject?.status !== 'generation_failed') {
      setRecovery(null);
      setRecoveryMessage('');
      return;
    }
    let cancelled = false;
    api.get(`/chain/generation-recovery/${currentProject.id}`)
      .then((response: any) => {
        if (!cancelled) setRecovery((response?.data ?? response)?.audit ?? null);
      })
      .catch((error: Error) => {
        if (!cancelled) setRecoveryMessage(`无法读取恢复诊断：${error.message}`);
      });
    return () => { cancelled = true; };
  }, [currentProject?.id, currentProject?.status]);

  const resumeFailedGeneration = async () => {
    if (!currentProject || !recovery?.canResume || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryMessage('正在从失败前快照恢复，并按原确认题材和配置重新生成……');
    try {
      const response: any = await api.post(`/chain/generation-recovery/${currentProject.id}/resume`, {}, 1_800_000);
      const result = response?.data ?? response;
      setRecovery(result.audit ?? null);
      setRecoveryMessage(result.status === 'active' ? '创作资料已完整恢复并激活。' : '恢复未通过完整性门禁；旧资料已还原，可查看诊断后再次处理。');
    } catch (error: any) {
      setRecoveryMessage(`恢复失败，旧资料已保留：${error?.message || '未知错误'}`);
      try {
        const response: any = await api.get(`/chain/generation-recovery/${currentProject.id}`);
        setRecovery((response?.data ?? response)?.audit ?? null);
      } catch {}
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
          {currentProject?.status === 'generation_failed' && (
            <div style={{
              margin: '12px 16px 0', padding: '12px 14px', borderRadius: 8,
              backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.34)',
              color: '#fbd38d', fontSize: 12, lineHeight: 1.55,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 260, flex: '1 1 520px' }}>
                <div style={{ fontWeight: 700 }}>项目创建失败，当前资料只读，不能进入正文或继续修改。</div>
                <div style={{ marginTop: 4 }}>恢复方式：手动触发。系统会先建立快照；恢复失败会还原旧资料，不会清空后丢失。</div>
                {recovery?.recommendedAction && <div style={{ marginTop: 4, color: '#fde68a' }}>下一步：{recovery.recommendedAction}</div>}
                {!!recovery?.missingModules?.length && <div style={{ marginTop: 4, color: '#fca5a5' }}>未完成：{recovery.missingModules.join('、')}</div>}
                {!!recovery?.consistencyIssues?.length && <div style={{ marginTop: 4, color: '#fca5a5' }}>一致性问题：{recovery.consistencyIssues.join('；')}</div>}
                {!!recovery?.protectionReasons?.length && <div style={{ marginTop: 4, color: '#fca5a5' }}>自动恢复已保护：{recovery.protectionReasons.join('；')}</div>}
                {recoveryMessage && <div style={{ marginTop: 5, color: '#bfdbfe' }}>{recoveryMessage}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" onClick={resumeFailedGeneration} disabled={!recovery?.canResume || recoveryBusy} style={{
                  padding: '7px 11px', borderRadius: 6, border: '1px solid rgba(251,211,141,0.45)',
                  backgroundColor: recovery?.canResume && !recoveryBusy ? '#b45309' : '#374151', color: '#fff', cursor: recovery?.canResume && !recoveryBusy ? 'pointer' : 'not-allowed',
                }}>{recoveryBusy ? '正在恢复…' : '继续准备创作资料'}</button>
                <button type="button" onClick={() => navigate(`/project/${currentProject.id}/dashboard`)} style={{
                  padding: '7px 11px', borderRadius: 6, border: '1px solid rgba(251,211,141,0.45)',
                  backgroundColor: 'rgba(0,0,0,0.18)', color: '#fff', cursor: 'pointer',
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
