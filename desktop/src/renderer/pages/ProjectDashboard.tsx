/**
 * ProjectDashboard - 项目进度看板
 * 对接真实后端数据，使用 store 缓存避免重复请求
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import { useWorkflowGuardStore } from '../stores/workflowGuardStore';
import WorkflowAssistantPanel from '../components/workflow/WorkflowAssistantPanel';

interface DashboardStats {
  totalChapters: number; completedChapters: number; writingChapters: number;
  totalWords: number; targetWords: number; totalCharacters: number;
  totalConflicts: number; unresolvedConflicts: number;
  _loadError?: boolean;
}

/** 轻量全局缓存：同一项目短时间内不重复请求 stats */
const statsCache: Record<string, { data: DashboardStats; ts: number }> = {};
const STATS_CACHE_TTL = 30_000; // 30秒内不重复请求

const ProjectDashboard: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, selectProject } = useProjectStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

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
      } catch (e: any) {
        console.warn('Dashboard 加载失败:', e?.message);
        setStats({ totalChapters: 0, completedChapters: 0, writingChapters: 0, totalWords: 0, targetWords: 0, totalCharacters: 0, totalConflicts: 0, unresolvedConflicts: 0, _loadError: true } as any);
      }
      setLoading(false);
    };
    load();
    // 加载流程守卫数据
    if (projectId) {
      useWorkflowGuardStore.getState().fetchGuard(projectId);
    }
  }, [projectId, selectProject]);

  // 从 currentProject 解析 projectMeta（替代原来的本地 state）
  const projectMeta = currentProject || {};
  let settingsParsed: any = {};
  try {
    const rawSettings = (currentProject as any)?.settings;
    settingsParsed = typeof rawSettings === 'string' ? JSON.parse(rawSettings) : (rawSettings || {});
  } catch {}

  if (loading || !stats) return <div style={{ padding: '40px', textAlign: 'center', color: '#6c6c80' }}>加载中...</div>;
  const baseSettings = settingsParsed?.coreSetting || settingsParsed?.baseSettings || {};
  const worldview = settingsParsed?.worldview || {};
  const timeline = settingsParsed?.timeline || [];
  const reversals = settingsParsed?.reversals || [];
  const dashboardCharacters = settingsParsed?.outlineCharacters || [];
  const dashboardForeshadows = settingsParsed?.outlineForeshadowings || [];

  const progress = stats.targetWords > 0 ? Math.round((stats.totalWords / stats.targetWords) * 100) : 0;
  const chapterProgress = stats.totalChapters > 0 ? Math.round((stats.completedChapters / stats.totalChapters) * 100) : 0;
  const stages = [
    { id: 'inspiration', label: '灵感', icon: '💡', done: true, path: null, isLauncherAction: true },
    { id: 'outline', label: '大纲', icon: '📋', done: true, path: `/project/${projectId}/outline` },
    { id: 'writing', label: '正文', icon: '✍️', done: stats.writingChapters > 0, progress: chapterProgress, path: `/project/${projectId}/writing` },
    { id: 'refinement', label: '精修', icon: '✨', done: false, path: `/project/${projectId}/refinement` },
    { id: 'qa', label: '质检', icon: '🔍', done: false, path: `/project/${projectId}/refinement` },
    { id: 'export', label: '导出', icon: '📦', done: false, path: `/project/${projectId}/import-export` },
  ];
  const quickActions = [
    { label: '✍️ 继续写作', path: `/project/${projectId}/writing`, color: '#e94560' },
    { label: '📋 查看大纲', path: `/project/${projectId}/outline`, color: '#3498db' },
    { label: '⚡ 处理冲突', path: `/project/${projectId}/conflicts`, color: '#f39c12', badge: stats.unresolvedConflicts },
    { label: '📤 导出', path: `/project/${projectId}/import-export`, color: '#2ecc71' },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: '800px', margin: '0 auto', overflow: 'auto', height: '100%' }}>
      <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#eaeaea', marginBottom: '24px' }}>🏠 首页</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: '总字数', value: `${(stats.totalWords / 1000).toFixed(1)}k`, sub: `目标 ${(stats.targetWords / 1000).toFixed(0)}k`, color: '#eaeaea' },
          { label: '章节', value: `${stats.completedChapters}/${stats.totalChapters}`, sub: `${stats.writingChapters}章写作中`, color: '#3498db' },
          { label: '完成度', value: `${progress}%`, sub: `${stats.targetWords - stats.totalWords > 0 ? '剩余' : '超出'} ${Math.abs(stats.targetWords - stats.totalWords) / 1000}k`, color: progress > 80 ? '#2ecc71' : '#f39c12' },
          { label: '冲突', value: `${stats.unresolvedConflicts}`, sub: `共${stats.totalConflicts}个`, color: stats.unresolvedConflicts > 0 ? '#e74c3c' : '#2ecc71' },
        ].map(s => (
          <div key={s.label} style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: '#6c6c80', marginTop: '2px' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: '#8a8aa0' }}>字数进度</span>
          <span style={{ fontSize: '12px', color: '#8a8aa0' }}>{progress}%</span>
        </div>
        <div style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(progress, 100)}%`, backgroundColor: progress > 80 ? '#2ecc71' : '#e94560', borderRadius: '3px' }} />
        </div>
      </div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>快捷操作</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {quickActions.map(a => (
            <button key={a.label} onClick={() => navigate(a.path)}
              style={{ padding: '10px 18px', borderRadius: '8px', border: `1px solid ${a.color}30`, cursor: 'pointer', backgroundColor: `${a.color}10`, color: a.color, fontSize: '13px', fontWeight: 500, fontFamily: 'inherit', position: 'relative' }}>
              {a.label}
              {a.badge ? <span style={{ position: 'absolute', top: '-6px', right: '-6px', padding: '2px 6px', borderRadius: '10px', backgroundColor: a.color, color: '#fff', fontSize: '10px', fontWeight: 700 }}>{a.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>创作流程</div>
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
                border: '1px solid',
                borderColor: s.done ? 'rgba(46,204,113,0.2)' : 'rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: s.done ? '#2ecc71' : '#6c6c80' }}>
                {s.label}
              </div>
              {s.progress !== undefined && <div style={{ marginTop: '6px', height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${s.progress}%`, backgroundColor: '#e94560', borderRadius: '2px' }} /></div>}
              {s.done && <div style={{ fontSize: '10px', color: '#2ecc71', marginTop: '4px' }}>✓</div>}
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

      {/* ===== 世界观（按文档格式：7维度表）===== */}
      {(Object.keys(worldview).length > 0) && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>🌍 世界观设定</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
            {worldview.geography && Array.isArray(worldview.geography) && worldview.geography.length > 0 && (
              <div style={dimBlockStyle}>
                <div style={dimLabelStyle}>🗺️ 世界地理</div>
                <div style={dimContentStyle}>{worldview.geography.map((g: any) => typeof g === 'string' ? g : g.name || g.description || JSON.stringify(g)).join(' · ')}</div>
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
                <div style={dimContentStyle}>{worldview.history.map((h: any) => typeof h === 'string' ? h : h.date ? `${h.date}: ${h.event || ''}` : h).join(' | ')}</div>
              </div>
            )}
            {worldview.history && typeof worldview.history === 'string' && <DimRow icon="📜" label="历史背景" val={worldview.history} />}
            {worldview.factions && Array.isArray(worldview.factions) && worldview.factions.length > 0 && (
              <div style={dimBlockStyle}>
                <div style={dimLabelStyle}>🏴 势力分布</div>
                <div style={dimContentStyle}>{worldview.factions.map((f: any) => typeof f === 'string' ? f : (f.name || f.title || '') + (f.coreGoal ? `(${f.coreGoal})` : '')).filter(Boolean).join(' · ')}</div>
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
          {dashboardCharacters.slice(0, 5).map((c: any, i: number) => (
            <div key={i} style={{ padding: '10px', marginBottom: '6px', borderRadius: '8px', backgroundColor: 'rgba(52,152,219,0.05)', border: '1px solid rgba(52,152,219,0.1)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#3498db', marginBottom: '4px' }}>
                {c.name || `角色${i + 1}`}
                <span style={{ fontSize: '10px', color: '#6c6c80', marginLeft: '8px' }}>{c.identity || ''}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: '11px' }}>
                <span style={{ color: '#6c6c80' }}>性格: <span style={{ color: '#c0c0d0' }}>{c.personality || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>目标: <span style={{ color: '#c0c0d0' }}>{c.shortTermGoal || c.longTermGoal || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>背景: <span style={{ color: '#c0c0d0' }}>{truncate(c.background, 40)}</span></span>
                <span style={{ color: '#6c6c80' }}>弧光: <span style={{ color: '#c0c0d0' }}>{c.growthArc || ''}</span></span>
                {c.fear && <span style={{ color: '#6c6c80', gridColumn: '1 / -1' }}>恐惧: <span style={{ color: '#e74c3c' }}>{c.fear}</span></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 时间线（按文档格式：日期→事件→章节 三列表）===== */}
      {Array.isArray(timeline) && timeline.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <div style={sectionTitleStyle}>📅 时间线 ({timeline.length}个节点)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#8a8aa0', fontWeight: 600 }}>日期</th>
                <th style={{ textAlign: 'left', padding: '6px 10px', color: '#8a8aa0', fontWeight: 600 }}>事件</th>
                <th style={{ textAlign: 'right', padding: '6px 10px', color: '#8a8aa0', fontWeight: 600 }}>章节</th>
              </tr>
            </thead>
            <tbody>
              {timeline.slice(0, 10).map((t: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '5px 10px', color: '#e94560', fontWeight: 500 }}>{t.date || ''}</td>
                  <td style={{ padding: '5px 10px', color: '#c0c0d0' }}>{t.event || ''}</td>
                  <td style={{ padding: '5px 10px', color: '#6c6c80', textAlign: 'right' }}>{t.chapterReference || t.chapter || ''}</td>
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
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#e94560', marginBottom: '6px' }}>反转 {i + 1} · {r.position || r.id || ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '11px' }}>
                <span style={{ color: '#6c6c80' }}>表面真相: <span style={{ color: '#c0c0d0' }}>{r.surfaceTruth || r.surface || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>实际真相: <span style={{ color: '#e94560' }}>{r.actualTruth || r.truth || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>支撑伏笔: <span style={{ color: '#f59e0b' }}>{r.foreshadowRef || r.foreshadowId || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>揭露方式: <span style={{ color: '#c0c0d0' }}>{r.revealMethod || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>对主角打击: <span style={{ color: '#e74c3c' }}>{r.impactOnCharacter || r.impact || ''}</span></span>
                <span style={{ color: '#6c6c80' }}>对读者冲击: <span style={{ color: '#f39c12' }}>{r.impactOnReader || r.readerShock || ''}</span></span>
                {(r.changesUnderstanding !== undefined) && (
                  <span style={{ color: '#6c6c80', gridColumn: '1 / -1' }}>
                    改变前文理解: <span style={{ color: r.changesUnderstanding ? '#2ecc71' : '#6c6c80' }}>{r.changesUnderstanding ? '是' : '否'}</span>
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
              { label: '贯穿全文', count: dashboardForeshadows.filter((f: any) => f.scope === 'global').length, color: '#e94560' },
              { label: '卷级', count: dashboardForeshadows.filter((f: any) => f.scope === 'volume').length, color: '#f39c12' },
              { label: '章级', count: dashboardForeshadows.filter((f: any) => f.scope === 'chapter').length, color: '#3498db' },
            ].map(s => (
              <div key={s.label} style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: '9px', color: '#6c6c80' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {dashboardForeshadows.slice(0, 5).map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: '8px', padding: '5px 10px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.01)', marginBottom: '3px', alignItems: 'center' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: f.scope === 'global' ? '#e94560' : f.scope === 'volume' ? '#f39c12' : '#3498db', flexShrink: 0 }} />
              <span style={{ color: '#c0c0d0', fontSize: '11px', flex: 1 }}>{truncate(f.content, 50)}</span>
              <span style={{ color: '#6c6c80', fontSize: '9px' }}>#{f.setupChapter}→#{f.recoveryChapter}</span>
            </div>
          ))}
        </div>
      )}

      {/* 创作流程助手 */}
      {projectId && <WorkflowAssistantPanel projectId={projectId} />}
    </div>
  );
};

const InfoBlock: React.FC<{ label: string; val: string }> = ({ label, val }) => (
  <div style={{ padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
    <div style={{ fontSize: '9px', color: '#6c6c80', marginBottom: '2px', textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: '12px', color: '#c0c0d0', lineHeight: 1.4 }}>{val}</div>
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
    <span style={{ fontSize: '12px', flexShrink: 0 }}>{icon}</span>
    <span style={{ color: '#8a8aa0', fontSize: '10px', fontWeight: 600, flexShrink: 0, minWidth: '56px' }}>{label}</span>
    <span style={{ color: '#c0c0d0', fontSize: '11px', lineHeight: 1.5 }}>{val}</span>
  </div>
);

const sectionTitleStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' };
const dimBlockStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' };
const dimLabelStyle: React.CSSProperties = { fontSize: '9px', color: '#6c6c80', marginBottom: '3px', textTransform: 'uppercase' };
const dimContentStyle: React.CSSProperties = { fontSize: '11px', color: '#c0c0d0', lineHeight: 1.5 };

export default ProjectDashboard;
