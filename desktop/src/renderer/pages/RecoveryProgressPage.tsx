import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getBaseUrl, initializeApiBaseUrl } from '../lib/api';
import { getGenerationRecovery } from '../lib/generationRecovery';
import { openProject } from '../lib/openProject';
import { useProjectStore } from '../stores/projectStore';

type Phase = 'connecting' | 'running' | 'verifying' | 'done' | 'failed';
type ProgressEvent = { type?: string; step?: string; percent?: number; message?: string; status?: string };

/** 恢复进度与首次创建共用服务端 SSE；这里曾缺少恢复专用页面，按钮会等待整轮生成而不给用户任何反馈。 */
const RecoveryProgressPage: React.FC = () => {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const title = (location.state as { title?: string } | null)?.title || '本书';
  const fetchProjects = useProjectStore(state => state.fetchProjects);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('正在连接生成进度…');
  const [events, setEvents] = useState<string[]>([]);
  const [connection, setConnection] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    let source: EventSource | null = null;
    let auditTimer: ReturnType<typeof setInterval> | null = null;
    let terminalSeen = false;

    const settle = async () => {
      try {
        const audit = await getGenerationRecovery(projectId);
        if (disposed || !audit || audit.running) return;
        if (audit.status === 'active') {
          setPhase('done');
          setPercent(100);
          setMessage('创作资料已生成并通过激活检查。');
        } else {
          setPhase('failed');
          setMessage(previous => previous === '正在连接生成进度…'
            ? (audit.recommendedAction || '生成未完成，请查看诊断后重试。') : previous);
        }
        source?.close();
        if (auditTimer) clearInterval(auditTimer);
        void fetchProjects();
      } catch {
        if (!disposed) setConnection('状态暂时不可用，正在重试连接…');
      }
    };

    const connect = async () => {
      try {
        await initializeApiBaseUrl();
        if (disposed) return;
        source = new EventSource(`${getBaseUrl()}/chain/project-creation-progress/${encodeURIComponent(projectId)}`);
        source.onopen = () => { if (!disposed) setConnection('实时进度已连接'); };
        source.onmessage = raw => {
          if (disposed) return;
          let event: ProgressEvent;
          try { event = JSON.parse(raw.data); } catch { return; }
          if (event.type === 'heartbeat' || event.type === 'stats') return;
          if (typeof event.percent === 'number') {
            setPercent(previous => Math.max(previous, Math.min(100, Math.max(0, event.percent!))));
          }
          if (event.message) {
            setMessage(event.message);
            setEvents(previous => [...previous, event.message!].slice(-16));
          }
          if (event.type === 'done') {
            terminalSeen = true;
            setPhase('done');
            setPercent(100);
            source?.close();
            if (auditTimer) clearInterval(auditTimer);
            void fetchProjects();
          } else if (event.type === 'error') {
            terminalSeen = true;
            setPhase('verifying');
            setConnection('正在确认失败状态及原资料恢复结果…');
            source?.close();
            void settle();
          } else if (event.type === 'progress') {
            setPhase('running');
          }
        };
        source.onerror = () => {
          if (!disposed && !terminalSeen) setConnection('实时连接中断，正在自动重连…');
        };
        auditTimer = setInterval(() => { void settle(); }, 3000);
        void settle();
      } catch (error: any) {
        if (!disposed) {
          setPhase('failed');
          setMessage(error?.message || '无法连接进度服务，请检查服务状态。');
        }
      }
    };
    void connect();
    return () => {
      disposed = true;
      source?.close();
      if (auditTimer) clearInterval(auditTimer);
    };
  }, [projectId, fetchProjects]);

  const working = phase === 'connecting' || phase === 'running' || phase === 'verifying';
  return (
    <main className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-8 text-text-primary" aria-live="polite">
      <button type="button" onClick={() => navigate('/projects')} className="mb-8 text-sm text-text-secondary hover:text-text-primary">← 返回我的项目</button>
      <div className="mb-2 text-xs font-semibold tracking-widest text-accent">项目创建</div>
      <h1 className="text-2xl font-bold">{working ? '正在重新生成创作资料' : phase === 'done' ? '创作资料生成完成' : '重新生成未完成'}</h1>
      <p className="mt-2 text-sm text-text-secondary">{title}</p>

      <section className="mt-8 rounded-xl border border-border bg-bg-secondary p-6">
        <div className="flex items-center justify-between gap-4">
          <strong className="text-base">{phase === 'verifying' ? '确认失败状态' : phase === 'failed' ? '生成失败' : phase === 'done' ? '已完成' : '生成进度'}</strong>
          <span className="text-xl font-semibold tabular-nums">{percent}%</span>
        </div>
        <div role="progressbar" aria-label="重新生成进度" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-4 h-2 overflow-hidden rounded-full bg-bg-primary">
          <div className={`h-full rounded-full transition-all duration-500 ${phase === 'failed' ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${percent}%` }} />
        </div>
        <p className={`mt-5 whitespace-pre-wrap text-sm leading-7 ${phase === 'failed' ? 'text-red-300' : 'text-text-primary'}`}>{message}</p>
        {working && <p className="mt-3 text-xs text-text-secondary">{connection || '当前步骤完成后，进度会继续更新。'} 可以离开此页，稍后从项目列表返回查看。</p>}
      </section>

      {events.length > 0 && <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">执行记录</h2>
        <ol className="space-y-2 border-l border-border pl-5 text-sm text-text-secondary">
          {events.map((item, index) => <li key={`${index}-${item.slice(0, 12)}`} className="whitespace-pre-wrap leading-6">{item}</li>)}
        </ol>
      </section>}
      {phase === 'done' && <button type="button" onClick={() => void openProject(projectId, title, navigate)} className="mt-8 rounded-lg bg-accent px-5 py-3 font-semibold text-white">进入项目</button>}
      {phase === 'failed' && <button type="button" onClick={() => navigate('/projects')} className="mt-8 rounded-lg border border-border px-5 py-3 text-sm">返回项目列表查看诊断</button>}
    </main>
  );
};

export default RecoveryProgressPage;
