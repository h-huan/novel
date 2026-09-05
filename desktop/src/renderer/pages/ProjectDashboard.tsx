/**
 * ProjectDashboard - 项目进度看板
 * 对接真实后端数据，使用 store 缓存避免重复请求
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import { parseJsonToReadable } from '../lib/textList';

interface DashboardStats {
  totalChapters: number; completedChapters: number; writingChapters: number; writtenChapters?: number;
  totalWords: number; targetWords: number; totalCharacters: number;
  totalConflicts: number; unresolvedConflicts: number;
  _loadError?: boolean;
}

interface GenerationRecoveryAudit {
  status: string;
  counts: Record<string, number>;
  protectedHumanWork: boolean;
  protectionReasons: string[];
  missingModules: string[];
  consistencyIssues: string[];
  canResume: boolean;
  running: boolean;
  recommendedAction: string;
}


/** 轻量全局缓存：同一项目短时间内不重复请求 stats */
const statsCache: Record<string, { data: DashboardStats; ts: number }> = {};
const STATS_CACHE_TTL = 30_000; // 30秒内不重复请求

const dashboardText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return parseJsonToReadable(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(dashboardText).filter(Boolean).join('\n');
  if (typeof value === 'object') return parseJsonToReadable(value);
  return '';
};

const ProjectDashboard: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, selectProject } = useProjectStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState<GenerationRecoveryAudit | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [ov, setOv] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // 并行加载：项目详情用 store（有缓存），stats 用本地缓存
        const selectPromise = selectProject(projectId || null);

        // stats 使用缓存
        let statsData: DashboardStats | null = null;
        const cached = statsCache[projectId || ''];
        if (cached && Date.now() - cached.ts < STATS_CACHE_TTL) {
          statsData = cached.data;
        } else {
          const statsRes = await api.post('/chain/dashboard-stats', { projectId });
          const sdata = (statsRes as any).data ?? statsRes;
          if (sdata.stats) {
            statsData = sdata.stats as DashboardStats;
            statsCache[projectId || ''] = { data: statsData, ts: Date.now() };
          }
        }

        await selectPromise;
        if (statsData) setStats(statsData);
        if (projectId) {
          try {
            const recoveryRes = await api.getWithRetry(`/chain/generation-recovery/${projectId}`);
            const recoveryData = (recoveryRes as any).data ?? recoveryRes;
            setRecovery(recoveryData.audit || null);
          } catch (recoveryError: any) {
            console.warn('恢复诊断加载失败:', recoveryError?.message);
          }
        }
        if (projectId) {
          try {
            const ovRes = await api.getWithRetry(`/platform-analytics/overview?projectId=${projectId}&days=30`);
            const ovData = (ovRes as any).data ?? ovRes;
            setOv(ovData);
          } catch (ovError: any) {
            console.warn('本书看板加载失败:', ovError?.message);
          }
        }
      } catch (e: any) {
        console.warn('Dashboard 加载失败:', e?.message);
        setStats({ totalChapters: 0, completedChapters: 0, writingChapters: 0, writtenChapters: 0, totalWords: 0, targetWords: 0, totalCharacters: 0, totalConflicts: 0, unresolvedConflicts: 0, _loadError: true } as any);
      }
      setLoading(false);
    };
    load();
  }, [projectId, selectProject]);

  // 从 currentProject 解析 projectMeta（替代原来的本地 state）
  const projectMeta = currentProject || {};
  let settingsParsed: any = {};
  try {
    const rawSettings = (currentProject as any)?.settings;
    settingsParsed = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : (rawSettings || {});
  } catch {}

  if (loading || !stats) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>加载中...</div>;
  const baseSettings = settingsParsed?.coreSetting || settingsParsed?.baseSettings || {};
  const worldview = settingsParsed?.worldview || {};
  const timeline = settingsParsed?.timeline || [];
  const reversals = settingsParsed?.reversals || [];
  const dashboardCharacters = settingsParsed?.outlineCharacters || [];
  const dashboardForeshadows = settingsParsed?.outlineForeshadowings || [];

  const progress = stats.targetWords > 0 ? Math.round((stats.totalWords / stats.targetWords) * 100) : 0;
  const chapterProgress = stats.totalChapters > 0 ? Math.round((stats.completedChapters / stats.totalChapters) * 100) : 0;
  const projectStatus = String((currentProject as any)?.status || recovery?.status || '');
  const needsRecovery = ['generation_failed', 'creating'].includes(projectStatus);
  const hasConfirmedIdea = Boolean(
    (currentProject as any)?.confirmedIdea
    || (currentProject as any)?.ideaSeed
    || (currentProject as any)?.ideaStatus === 'confirmed',
  );
  const outlineReady = Boolean(recovery?.counts?.outlineChapters)
    && !recovery?.consistencyIssues?.some(issue => issue.includes('章节'));

  const resumeGeneration = async () => {
    if (!projectId || recovering || !recovery?.canResume) return;
    setRecovering(true);
    setRecoveryMessage('正在按已确认题材重新整理人物、世界、情节、伏笔和时间顺序，请勿重复点击……');
    try {
      const result = await api.post(`/chain/generation-recovery/${projectId}/resume`, {}, 1_800_000);
      const data = (result as any).data ?? result;
      setRecovery(data.audit || null);
      delete statsCache[projectId];
      await selectProject(projectId);
      const statsRes = await api.post('/chain/dashboard-stats', { projectId });
      const statsData = ((statsRes as any).data ?? statsRes).stats;
      if (statsData) setStats(statsData);
      setRecoveryMessage('创作资料已经重新整理完成，可以继续写作。');
    } catch (error: any) {
      setRecoveryMessage(error?.message || '创作资料尚未整理完成，原有内容已保留。');
      try {
        const auditRes = await api.get(`/chain/generation-recovery/${projectId}`);
        setRecovery((((auditRes as any).data ?? auditRes).audit) || null);
      } catch {}
    } finally {
      setRecovering(false);
    }
  };

  const stageDefinitions = [
    { id: 'inspiration', label: '灵感', icon: '💡', done: true, path: null, isLauncherAction: true },
    { id: 'outline', label: '大纲', icon: '📋', done: true, path: `/project/${projectId}/outline` },
    { id: 'writing', label: '正文', icon: '✍️', done: stats.writingChapters > 0, progress: chapterProgress, path: needsRecovery ? null : `/project/${projectId}/writing` },
    { id: 'refinement', label: '精修', icon: '✨', done: false, path: `/project/${projectId}/refinement` },
    { id: 'qa', label: '质检', icon: '🔍', done: false, path: `/project/${projectId}/refinement` },
    { id: 'export', label: '导出', icon: '📦', done: false, path: `/project/${projectId}/import-export` },
  ];
  const stages = stageDefinitions.map(stage => {
    if (stage.id === 'inspiration') return { ...stage, done: hasConfirmedIdea };
    if (stage.id === 'outline') return { ...stage, done: outlineReady };
    return stage;
  });

  return (
    <div style={{ padding: '28px 32px', maxWidth: '800px', margin: '0 auto', overflow: 'auto', height: '100%', background: 'var(--color-bg-primary)' }}>
      <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '24px' }}>🏠 首页</h1>
      {(needsRecovery || recoveryMessage) && (
        <div style={{ padding: '16px', marginBottom: '20px', borderRadius: '10px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-warning)', marginBottom: '7px' }}>
            {needsRecovery ? '创作资料尚未准备好' : '创作资料提醒'}
          </div>
          <div style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.65 }}>
            {recoveryMessage || '继续整理时会严格沿用已确认题材，原有内容会在成功前保留。'}
          </div>
          {!!recovery?.missingModules?.length && (
            <div style={{ marginTop: '6px', fontSize: 'var(--font-size-xs)', color: '#fca5a5' }}>尚未准备：{recovery.missingModules.join('、')}</div>
          )}
          {recoveryMessage && <div style={{ marginTop: '7px', fontSize: 'var(--font-size-xs)', color: '#bfdbfe' }}>{recoveryMessage}</div>}
          {needsRecovery && (
            <button type="button" onClick={resumeGeneration} disabled={!recovery?.canResume || recovering}
              style={{ marginTop: '12px', padding: '9px 15px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.45)', backgroundColor: recovery?.canResume && !recovering ? 'var(--color-warning)' : 'var(--color-bg-elevated)', color: 'var(--color-white)', cursor: recovery?.canResume && !recovering ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
              {recovering ? '正在整理创作资料…' : '继续准备创作资料'}
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: '总字数', value: `${(stats.totalWords / 1000).toFixed(1)}k`, sub: `目标 ${(stats.targetWords / 1000).toFixed(0)}k`, color: 'var(--color-text-primary)' },
          { label: '章节', value: `${stats.writtenChapters ?? stats.completedChapters}/${stats.totalChapters}`, sub: `已定稿${stats.completedChapters}章`, color: 'var(--color-info)' },
          { label: '完成度', value: `${progress}%`, sub: `${stats.targetWords - stats.totalWords > 0 ? '剩余' : '超出'} ${Math.abs(stats.targetWords - stats.totalWords) / 1000}k`, color: progress > 80 ? 'var(--color-success)' : 'var(--color-warning)' },
          { label: '冲突', value: `${stats.unresolvedConflicts}`, sub: `共${stats.totalConflicts}个`, color: stats.unresolvedConflicts > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>字数进度</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>{progress}%</span>
        </div>
        <div style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(progress, 100)}%`, backgroundColor: progress > 80 ? 'var(--color-success)' : 'var(--color-accent)', borderRadius: '3px' }} />
        </div>
      </div>


      {ov && ov.process && (
        <div style={{ padding: '16px', marginBottom: '24px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>📊 本书生成效率（正文按“章”统计，补字/重写不算多次生成）</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: flowRateColor(ov.process.firstPassRate) }}>
              {'整体一次成功率 ' + Math.round((ov.process.firstPassRate ?? 0) * 100) + '%'}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={flowThStyle}>环节</th>
                <th style={flowThR}>章数/次数</th>
                <th style={flowThR}>一次成功率</th>
                <th style={flowThStyle}>平均尝试</th>
                <th style={flowThR}>产出/目标</th>
              </tr>
            </thead>
            <tbody>
              {ov.process.steps.map((s: any) => (
                <tr key={s.scenario} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', backgroundColor: s.isBody ? 'rgba(59,118,195,0.08)' : 'transparent' }}>
                  <td style={flowTdStyle}>{s.scenarioName}{s.isBody ? '（本书正文）' : ''}{s.failCount > 0 ? <span style={{ color: 'var(--color-danger)', marginLeft: 6 }}>{'失败' + s.failCount}</span> : null}</td>
                  <td style={flowTdR}>{s.isBody ? (s.calls + ' 章' + (s.llmCalls ? '（前后 ' + s.llmCalls + ' 版）' : '')) : (s.calls + ' 次')}</td>
                  <td style={{ ...flowTdR, color: flowRateColor(s.firstPassRate), fontWeight: 600 }}>{s.firstPassRate == null ? '—' : Math.round(s.firstPassRate * 100) + '%'}</td>
                  <td style={flowTdStyle}>{s.isBody
                    ? (s.avgAttempts + ' 版/章（补字 ' + s.avgLengthRetry + ' · 对齐重写 ' + s.avgAlignmentRepair + ' · 基准精修 ' + s.avgBenchmarkRefine + '）')
                    : (s.avgAttempts + ' 次')}</td>
                  <td style={flowTdR}>{s.avgTargetWords ? (s.avgOutputWords + ' / ' + s.avgTargetWords) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ov && ov.chapterMatrix && ov.chapterMatrix.available && (
        <div style={{ padding: '16px', marginBottom: '24px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>📖 逐章质量（对照本书平台基准，点任意一行去正文改）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['章节', '字数', '对话占比', '平均段长', '开篇钩', '章尾钩', '返工', '追读风险', '质检分'].map(h => <th key={h} style={flowThStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {ov.chapterMatrix.rows.map((r: any) => (
                <tr key={r.chapterId} onClick={() => navigate('/project/' + projectId + '/writing')} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}>
                  <td style={flowTdStyle}>{'第' + r.chapterIndex + '章 ' + (r.title || '')}</td>
                  <td style={flowTdR}>{r.words}{r.wordStatus !== 'ok' ? '（应 ' + r.wordMin + '-' + r.wordMax + '）' : ''}</td>
                  <td style={flowTdR}>{Math.round(r.dialogueRatio * 100) + '%'}</td>
                  <td style={flowTdR}>{r.avgParaChars} 字</td>
                  <td style={flowTdR}>{r.openingHook ? '有' : '无'}</td>
                  <td style={flowTdR}>{r.endingHook ? '有' : '无'}</td>
                  <td style={flowTdR}>{r.repairCount}</td>
                  <td style={{ ...flowTdR, color: r.retentionRisk === 0 ? 'var(--color-success)' : r.retentionRisk === 1 ? 'var(--color-warning)' : 'var(--color-danger)' }} title={(r.retentionReasons || []).join('；')}>{r.retentionRisk === 0 ? '安全' : r.retentionRisk === 1 ? '注意' : '高风险'}</td>
                  <td style={flowTdR}>{r.qualityScore == null ? '待质检' : r.qualityScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>创作流程</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {stages.map(s => (
            <div
              key={s.id}
              onClick={() => {
                if (s.isLauncherAction) {
                  // 灵感发现 → 回到引导窗口（创建新项目流程），不走项目内路由
                  window.electronAPI?.invoke('close-project').catch(() => navigate('/'));
                  return;
                }
                if (s.path) navigate(s.path);
              }}
              style={{
                flex: 1, padding: '12px', borderRadius: '8px',
                cursor: s.path || s.isLauncherAction ? 'pointer' : 'default', textAlign: 'center',
                backgroundColor: s.done ? 'rgba(46,204,113,0.08)' : 'rgba(255,255,255,0.02)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: s.done ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: s.done ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                {s.label}
              </div>
              {s.progress !== undefined && <div style={{ marginTop: '6px', height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${s.progress}%`, backgroundColor: 'var(--color-accent)', borderRadius: '2px' }} /></div>}
              {s.done && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', marginTop: '4px' }}>✓</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ===== 基础设定（按文档格式：类型/卖点/读者/背景/冲突/情绪/主角/困境/反派）===== */}
      {Object.keys(baseSettings).length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <div style={sectionTitleStyle}>📖 基础设定</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {baseSettings.title && <InfoBlock label="书名" val={baseSettings.title} />}
            {baseSettings.type && <InfoBlock label="类型" val={baseSettings.type} />}
            {renderArrayField(baseSettings.coreSellingPoints, '核心卖点')}
            {baseSettings.targetReaders && <InfoBlock label="目标读者" val={baseSettings.targetReaders} />}
            {baseSettings.setting && <InfoBlock label="故事背景" val={baseSettings.setting} />}
            {baseSettings.coreConflict && <InfoBlock label="核心冲突" val={baseSettings.coreConflict} />}
            {baseSettings.emotionalEnding && <InfoBlock label="情绪落点" val={baseSettings.emotionalEnding} />}
            {baseSettings.protagonist && <InfoBlock label="主角身份" val={baseSettings.protagonist} />}
            {baseSettings.initialDilemma && <InfoBlock label="初始困境" val={baseSettings.initialDilemma} />}
            {baseSettings.antagonist && <InfoBlock label="反派/阻碍" val={baseSettings.antagonist} />}
            {baseSettings.wantMost && <InfoBlock label="主角渴望" val={baseSettings.wantMost} />}
            {baseSettings.fearMost && <InfoBlock label="主角恐惧" val={baseSettings.fearMost} />}
          </div>
        </div>
      )}

      {/* ===== 世界观 ===== */}
      {(Object.keys(worldview).length > 0) && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>🌍 世界观</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
            {worldview.geography && Array.isArray(worldview.geography) && worldview.geography.length > 0 && (
              <div style={dimBlockStyle}>
                <div style={dimLabelStyle}>🗺️ 世界地理</div>
                <div style={dimContentStyle}>{worldview.geography.map(dashboardText).filter(Boolean).join('\n')}</div>
              </div>
            )}
            {worldview.geography && typeof worldview.geography === 'string' && <DimRow icon="🗺️" label="世界地理" val={worldview.geography} />}
            {worldview.socialStructure && <DimRow icon="🏛️" label="社会结构" val={worldview.socialStructure} />}
            {worldview.powerSystem && <DimRow icon="⚡" label="力量体系" val={worldview.powerSystem} />}
            {worldview.economy && <DimRow icon="💰" label="经济体系" val={worldview.economy} />}
            {worldview.culture && <DimRow icon="🎭" label="文化特色" val={worldview.culture} />}
            {worldview.history && Array.isArray(worldview.history) && worldview.history.length > 0 && (
              <div style={dimBlockStyle}>
                <div style={dimLabelStyle}>📜 历史背景</div>
                <div style={dimContentStyle}>{worldview.history.map(dashboardText).filter(Boolean).join('\n')}</div>
              </div>
            )}
            {worldview.history && typeof worldview.history === 'string' && <DimRow icon="📜" label="历史背景" val={worldview.history} />}
            {worldview.factions && Array.isArray(worldview.factions) && worldview.factions.length > 0 && (
              <div style={dimBlockStyle}>
                <div style={dimLabelStyle}>🏴 势力分布</div>
                <div style={dimContentStyle}>{worldview.factions.map(dashboardText).filter(Boolean).join('\n')}</div>
              </div>
            )}
            {worldview.factions && typeof worldview.factions === 'string' && <DimRow icon="🏴" label="势力分布" val={worldview.factions} />}
          </div>
        </div>
      )}

      {/* ===== 角色一览（按文档格式：姓名/身份/性格/目标/弧光）===== */}
      {dashboardCharacters.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>👥 角色体系 ({dashboardCharacters.length}人)</div>
          {dashboardCharacters.map((c: any, i: number) => (
            <div key={i} style={{ padding: '10px', marginBottom: '6px', borderRadius: '8px', backgroundColor: 'rgba(52,152,219,0.05)', border: '1px solid rgba(52,152,219,0.1)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-info)', marginBottom: '4px' }}>
                {c.name || `角色${i + 1}`}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: '8px' }}>{c.identity || ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>性格: <span style={{ color: 'var(--color-text-soft)' }}>{c.personality || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>目标: <span style={{ color: 'var(--color-text-soft)' }}>{c.shortTermGoal || c.longTermGoal || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>背景: <span style={{ color: 'var(--color-text-soft)' }}>{truncate(c.background, 40)}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>弧光: <span style={{ color: 'var(--color-text-soft)' }}>{c.growthArc || ''}</span></span>
                {c.fear && <span style={{ color: 'var(--color-text-muted)', gridColumn: '1 / -1' }}>恐惧: <span style={{ color: 'var(--color-danger)' }}>{c.fear}</span></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 时间线（按文档格式：日期→事件→章节 三列表）===== */}
      {Array.isArray(timeline) && timeline.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>📅 时间线 ({timeline.length}个节点)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--color-text-dim)', fontWeight: 600 }}>日期</th>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--color-text-dim)', fontWeight: 600 }}>事件</th>
                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--color-text-dim)', fontWeight: 600 }}>章节</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((t: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '5px 10px', color: 'var(--color-accent)', fontWeight: 500 }}>{t.date || ''}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--color-text-soft)' }}>{t.event || ''}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--color-text-muted)', textAlign: 'right' }}>{t.chapterReference || t.chapter || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 反转表（按文档格式：8维度完整展示）===== */}
      {reversals.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>🔄 递进反转表 ({reversals.length}次→逐步加深)</div>
          {reversals.map((r: any, i: number) => (
            <div key={i} style={{ padding: '12px', marginBottom: '6px', borderRadius: '8px', backgroundColor: 'rgba(233,69,96,0.05)', border: '1px solid rgba(233,69,96,0.1)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '6px' }}>反转 {i + 1} · {r.position || r.id || ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 'var(--font-size-xs)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>表面真相: <span style={{ color: 'var(--color-text-soft)' }}>{r.surfaceTruth || r.surface || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>实际真相: <span style={{ color: 'var(--color-accent)' }}>{r.actualTruth || r.truth || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>支撑伏笔: <span style={{ color: 'var(--color-warning)' }}>{r.foreshadowRef || r.foreshadowId || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>揭露方式: <span style={{ color: 'var(--color-text-soft)' }}>{r.revealMethod || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>对主角打击: <span style={{ color: 'var(--color-danger)' }}>{r.impactOnCharacter || r.impact || ''}</span></span>
                <span style={{ color: 'var(--color-text-muted)' }}>对读者冲击: <span style={{ color: 'var(--color-warning)' }}>{r.impactOnReader || r.readerShock || ''}</span></span>
                {(r.changesUnderstanding !== undefined) && (
                  <span style={{ color: 'var(--color-text-muted)', gridColumn: '1 / -1' }}>
                    改变前文理解: <span style={{ color: r.changesUnderstanding ? 'var(--color-success)' : 'var(--color-text-muted)' }}>{r.changesUnderstanding ? '是' : '否'}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 伏笔网络概览 ===== */}
      {dashboardForeshadows.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>🎯 伏笔网络 ({dashboardForeshadows.length}条)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
            {[
              { label: '贯穿全文', count: dashboardForeshadows.filter((f: any) => f.scope === 'global').length, color: 'var(--color-accent)' },
              { label: '卷级', count: dashboardForeshadows.filter((f: any) => f.scope === 'volume').length, color: 'var(--color-warning)' },
              { label: '章级', count: dashboardForeshadows.filter((f: any) => f.scope === 'chapter').length, color: 'var(--color-info)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {dashboardForeshadows.map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: '8px', padding: '5px 10px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.01)', marginBottom: '3px', alignItems: 'center' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: f.scope === 'global' ? 'var(--color-accent)' : f.scope === 'volume' ? 'var(--color-warning)' : 'var(--color-info)', flexShrink: 0 }} />
              <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', flex: 1 }}>{truncate(f.content, 50)}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>#{f.setupChapter}→#{f.recoveryChapter}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

const InfoBlock: React.FC<{ label: string; val: string }> = ({ label, val }) => (
  <div style={{ padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: '2px', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', lineHeight: 1.4 }}>{val}</div>
  </div>
);

const renderArrayField = (arr: any, label: string) => {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
  return <InfoBlock label={label} val={arr.join('、')} />;
};

const truncate = (str: string, max: number) => {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
};

const DimRow: React.FC<{ icon: string; label: string; val: string }> = ({ icon, label, val }) => (
  <div style={{ display: 'flex', gap: '8px', padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
    <span style={{ fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>{icon}</span>
    <span style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', fontWeight: 600, flexShrink: 0, minWidth: '56px' }}>{label}</span>
    <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>{val}</span>
  </div>
);

const flowThStyle: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-dim)', fontWeight: 600, fontSize: 'var(--font-size-xs)' };
const flowThR: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-dim)', fontWeight: 600, fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap' };
const flowTdStyle: React.CSSProperties = { padding: '6px 8px', color: 'var(--color-text-soft)' };
const flowTdR: React.CSSProperties = { padding: '6px 8px', color: 'var(--color-text-soft)', textAlign: 'right', whiteSpace: 'nowrap' };
const flowRateColor = (r: number): string => (r >= 0.85 ? 'var(--color-success)' : r >= 0.6 ? 'var(--color-warning)' : 'var(--color-danger)');

const sectionTitleStyle: React.CSSProperties = { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' };
const dimBlockStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' };
const dimLabelStyle: React.CSSProperties = { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: '3px', textTransform: 'uppercase' };
const dimContentStyle: React.CSSProperties = { fontSize: '14px', color: 'var(--color-text-soft)', lineHeight: 1.6, whiteSpace: 'pre-wrap' };

export default ProjectDashboard;
