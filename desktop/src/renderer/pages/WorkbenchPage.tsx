/**
 * WorkbenchPage — 创作工作台 = 创作质量驾驶舱（应用落地页 "/"，进入首先看到）
 *
 * 图表化呈现「作者真正要改的写作问题」，且每一张图都能【下钻到具体章节问题并一键跳过去处理】：
 *   质量画像：质量总览仪表环 + 七维问题雷达（点维度展开：问题类型 → 具体章节/原文片段 → 去处理）
 *            + 标签契合雷达（含最需加强章节，可点跳转）+ 字数达标环 + 矛盾（可点去矛盾页）
 *            + 平台/长短篇构成 + 问题排行；
 *   每日变化：问题新增 vs 解决双线趋势，可切生成/字数/章节；
 *   返工与效率：一次成功率、正文首版一次到位率/平均补字轮次/平均回炉、回炉原因分布、
 *            失败原因、反复修改章节、各环节返工表。
 * 口径：只统计每章最新报告仍 open 的问题（重检旧问题自动失效），区分空壳章节，无数据如实占位，绝不伪造。
 * 字号走 tokens 令牌（界面文字最小 14px，SVG 轴标签同样 ≥14）；不写教用户用面板的废话。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { openProject } from '../lib/openProject';
import SearchableSelect, { SearchOption } from '../components/common/SearchableSelect';
import { RadarChart, Donut, GaugeRing, TrendChart, HBars } from '../components/common/charts';

const formatWords = (n: any) => {
  const v = Number(n) || 0;
  if (v >= 10000) return (v / 10000).toFixed(1) + ' 万字';
  if (v >= 1000) return (v / 1000).toFixed(1) + ' 千字';
  return v + ' 字';
};
const pct = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : Math.round(v * 100));
const num = (v: any) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
const DIM_SHORT: Record<string, string> = { hook: '开篇钩子', pacing: '节奏', dialogue: '对话', ai: 'AI痕迹', logic: '逻辑', detail: '细节', punctuation: '标点', other: '其它' };
const TAG_SHORT: Record<string, string> = { platform: '平台', tone: '基调', style: '风格', genre: '流派' };
const PALETTE = ['#60a5fa', '#a855f7', '#2ecc71', '#f39c12', '#e94560', '#3b76c3', '#e67e22'];
const sevColor = (sev: string) => (sev === 'high' || sev === 'critical') ? 'var(--color-danger)' : sev === 'medium' ? 'var(--color-warning)' : 'var(--color-text-muted)';
const benchStatusColor = (st: string) => (st === 'ok' ? 'var(--color-success)' : st === 'warn' ? 'var(--color-warning)' : 'var(--color-danger)');

const card: React.CSSProperties = { backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '16px 18px' };
const h3: React.CSSProperties = { fontSize: 'var(--font-size-lg)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 };
const pill = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontFamily: 'inherit',
  border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
  background: active ? 'var(--color-accent)' : 'transparent', color: active ? '#fff' : 'var(--color-text-secondary)',
  fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
});
const colorBar = (color: string): React.CSSProperties => ({ width: 3, height: 16, borderRadius: 2, background: color, display: 'inline-block' });
const linkBtn: React.CSSProperties = { fontSize: 'var(--font-size-sm)', fontFamily: 'inherit', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', border: '1px solid var(--color-accent)', color: 'var(--color-accent)', background: 'transparent', whiteSpace: 'nowrap' };

type TabKey = 'quality' | 'daily' | 'rework';
type TrendKey = 'issues' | 'llmCalls' | 'outputWords' | 'newChapters';

const WorkbenchPage: React.FC = () => {
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [stdStatus, setStdStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [projectId, setProjectId] = useState('');
  const [storyType, setStoryType] = useState('');
  const [platform, setPlatform] = useState('');
  const [tab, setTab] = useState<TabKey>('quality');
  const [trendKey, setTrendKey] = useState<TrendKey>('issues');
  const [openDim, setOpenDim] = useState<string | null>(null);

  const load = useCallback((d: number, pid: string, st: string, pf: string) => {
    const q = new URLSearchParams({ days: String(d) });
    if (pid) q.set('projectId', pid);
    if (!pid && st) q.set('storyType', st);
    if (!pid && pf) q.set('platform', pf);
    setLoading(true);
    // 只读看板：后端重启窗口内自动有限重试，避免一次失败就永久停在全 0 空白
    api.getWithRetry(`/platform-analytics/overview?${q.toString()}`)
      .then(r => { setData((r as any).data ?? r); setLoadError(null); })
      .catch((e: any) => setLoadError(e?.message || '看板数据加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(days, projectId, storyType, platform); }, [days, projectId, storyType, platform, load]);

  // 后端重启恢复后，切回本窗口/标签会立即重拉一次，实现自愈、无需手动刷新整页
  useEffect(() => {
    const reload = () => load(days, projectId, storyType, platform);
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reload);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', reload); };
  }, [load, days, projectId, storyType, platform]);

  useEffect(() => {
    const pull = () => api.get('/module-standards/status')
      .then(r => setStdStatus((r as any).data ?? r))
      // 轮询失败说明后端正在重启/不可达：进程一旦重启，旧的“归纳中”不可能延续，清掉假转圈
      .catch(() => setStdStatus((prev: any) => (prev ? { ...prev, running: [] } : prev)));
    pull();
    const t = setInterval(pull, 8000);
    return () => clearInterval(t);
  }, []);

  // 跳转到某本书的具体处理页（引导窗口走 IPC 开主窗口，主窗口内直接路由）
  const gotoProjectPage = useCallback((pid: string, ptitle: string | undefined, subPath: string) => {
    if (!pid) return;
    void openProject(pid, ptitle || '该作品', navigate, subPath);
  }, [navigate]);

  const options = data?.filterOptions || { projects: [], platforms: [], storyTypes: [] };
  const k = useMemo(() => ({
    projectCount: 0, chapterCount: 0, writtenChapterCount: 0, emptyChapterCount: 0, totalWords: 0, avgChapterWords: 0,
    wordComplianceRate: null as number | null, avgQualityScore: null as number | null,
    currentIssues: 0, currentConsistency: 0, rewriteChapterCount: 0,
    llmCalls: 0, firstPassRate: null as number | null,
    autoQuality: { written: 0, ok: 0, needsRewrite: 0, failed: 0, running: 0, none: 0 },
    ...(data?.kpis || {}),
  }), [data]);
  const aq = k.autoQuality || { written: 0, ok: 0, needsRewrite: 0, failed: 0, running: 0, none: 0 };
  const dims: any[] = data?.qualityDimensions || [];
  const drilldown: any[] = data?.issueDrilldown || [];
  const issueTypes: any[] = data?.currentIssues || [];
  const consistency = data?.consistency || { total: 0, types: [], severity: [] };
  const tagFit = data?.tagFit || { available: false, items: [], best: null, worst: null, chapterWorst: [], chapterBest: null };
  const wc = data?.wordCompliance || { writtenChapters: 0, ok: 0, short: 0, long: 0, rate: null, avgWords: 0, avgDeficit: 0 };
  const revision = data?.revision || { revisedChapters: 0, totalRevisions: 0, avgPerChapter: 0, heavyChapters: [], distribution: [] };
  const process = data?.process || { calls: 0, firstPassRate: null, avgAttempts: null, failCount: 0, truncatedCount: 0, emptyCount: 0, avgOutputWords: null, avgTargetWords: null, errorKinds: [], steps: [] };
  const bodyConv = data?.bodyConvergence || { bodyCallCount: 0, firstCount: 0, firstHitCount: 0, firstHitRate: null, avgLengthRetry: 0, avgAlignmentRepair: 0, chaptersNeedLengthRetry: 0, chaptersNeedRepair: 0 };
  const repairReasons: any[] = data?.repairReasons || [];
  const benchmark: any = data?.benchmarkCompare || { available: false, groups: [] };
  const matrix: any = data?.chapterMatrix || { available: false, rows: [], passRate: {} };
  const dist = data?.distributions || { platform: [], storyType: [] };
  const trend: any[] = data?.trend || [];

  const scopeOptions: SearchOption[] = [
    { value: '', label: '平台总览（全部作品）' },
    ...options.projects.map((p: any) => ({ value: p.id, label: p.title, hint: `${p.platformLabel}·${p.typeLabel}` })),
  ];
  const typeOptions: SearchOption[] = [{ value: '', label: '全部类型' }, ...options.storyTypes.map((t: any) => ({ value: t.value, label: t.label }))];
  const platformOptions: SearchOption[] = [{ value: '', label: '全部平台' }, ...options.platforms.map((p: any) => ({ value: p.value, label: p.label }))];
  const currentProject = options.projects.find((p: any) => p.id === projectId);

  const TREND_CONF: Record<TrendKey, { label: string; series: any[] }> = {
    issues: { label: '问题', series: [{ key: 'newIssues', label: '新增问题', color: '#f39c12' }, { key: 'resolvedIssues', label: '解决问题', color: '#2ecc71' }] },
    llmCalls: { label: 'AI 生成次数', series: [{ key: 'llmCalls', label: 'AI 生成次数', color: '#60a5fa', area: true }] },
    outputWords: { label: '产出字数', series: [{ key: 'outputWords', label: '产出字数', color: '#34d399', area: true }] },
    newChapters: { label: '新建章节', series: [{ key: 'newChapters', label: '新建章节', color: '#a855f7', area: true }] },
  };
  const trendTotals = useMemo(() => TREND_CONF[trendKey].series.map(s => ({ ...s, total: trend.reduce((a, t) => a + num(t[s.key]), 0) })), [trend, trendKey]);
  const dimRadar = dims.map(d => ({ label: DIM_SHORT[d.dim] || d.name, value: d.count }));
  const tagRadar = tagFit.available ? tagFit.items.map((it: any) => ({ label: TAG_SHORT[it.dim] || it.name, value: it.score ?? 0 })) : [];
  const activeDim = drilldown.find(d => d.dim === openDim);

  const running: any[] = stdStatus?.running || [];
  const dirtyCount: number = stdStatus?.dirtyCount || 0;

  const kpis = [
    { label: '作品', value: num(k.projectCount) },
    { label: '有正文章节', value: num(k.writtenChapterCount), sub: k.emptyChapterCount > 0 ? `另有 ${k.emptyChapterCount} 章只有标题` : undefined, tone: undefined as any },
    { label: '累计字数', value: formatWords(k.totalWords), sub: k.avgChapterWords ? `章均 ${formatWords(k.avgChapterWords)}` : undefined, tone: undefined },
    { label: '当前待改问题', value: num(k.currentIssues), tone: k.currentIssues > 0 ? 'var(--color-danger)' : 'var(--color-success)' },
    { label: '当前矛盾', value: num(k.currentConsistency), tone: k.currentConsistency > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: '返工过的章节', value: num(k.rewriteChapterCount) },
    {
      label: '质检达标章节(≥90)', value: num(aq.ok),
      sub: aq.needsRewrite > 0 ? `${aq.needsRewrite} 章未达90分·待精修` : aq.failed > 0 ? `${aq.failed} 章质检失败、可重跑` : (aq.none > 0 ? `${aq.none} 章有正文但尚未质检` : (aq.running > 0 ? `${aq.running} 章质检中` : undefined)),
      tone: (aq.needsRewrite > 0 || aq.none > 0) ? 'var(--color-warning)' : (aq.failed > 0 ? 'var(--color-danger)' : undefined) as any,
    },
  ];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 26px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 标题行 + 创建入口 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 800 }}>
          {projectId ? `《${currentProject?.title || '未命名'}》质量看板` : '创作质量看板'}
        </div>
        {projectId && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{currentProject?.platformLabel} · {currentProject?.typeLabel}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => navigate('/discover')} style={{ padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600, border: '1px solid var(--color-border-strong)', color: 'var(--color-text-primary)', backgroundColor: 'rgba(255,255,255,0.06)' }}>✨ 灵感发现</button>
        <button onClick={() => navigate('/projects?new=1')} style={{ padding: '8px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 700, border: 'none', color: '#fff', background: 'linear-gradient(135deg,var(--color-accent),var(--color-accent-hover))' }}>＋ 新建项目</button>
      </div>

      {running.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, backgroundColor: 'rgba(59,118,195,0.12)', border: '1px solid rgba(59,118,195,0.35)', fontSize: 'var(--font-size-sm)' }}>
          <span className="spin" style={{ width: 13, height: 13, border: '2px solid rgba(108,182,255,0.35)', borderTopColor: 'var(--color-info-light)', borderRadius: '50%', display: 'inline-block', animation: 'wbSpin 0.9s linear infinite' }} />
          正在自归纳 {running.map(x => x.moduleName).join('、')} 的执行标准…
          <style>{`@keyframes wbSpin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {!running.length && dirtyCount > 0 && (
        <div onClick={() => navigate('/module-standards')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, backgroundColor: 'rgba(243,156,18,0.10)', border: '1px solid rgba(243,156,18,0.35)', fontSize: 'var(--font-size-sm)', color: 'var(--color-warning)', cursor: 'pointer' }}>
          ⚙️ {dirtyCount} 个模块有新生成变化，将自动归纳（点击查看）
        </div>
      )}

      {/* 范围筛选条 */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>查看范围</span>
        <SearchableSelect width={260} value={projectId} options={scopeOptions} onChange={setProjectId} placeholder="搜索作品名…" />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>类型</span>
        <SearchableSelect width={140} value={storyType} options={typeOptions} onChange={setStoryType} disabled={!!projectId} placeholder="全部类型" />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>平台</span>
        <SearchableSelect width={140} value={platform} options={platformOptions} onChange={setPlatform} disabled={!!projectId} placeholder="全部平台" />
        {projectId && (
          <button onClick={() => { setProjectId(''); setStoryType(''); setPlatform(''); }} style={{ fontSize: 'var(--font-size-sm)', background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>× 返回平台总览</button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ d: 1, t: '今天' }, { d: 7, t: '近7天' }, { d: 14, t: '近14天' }, { d: 30, t: '近30天' }].map(x => (
            <button key={x.d} style={pill(days === x.d)} onClick={() => setDays(x.d)}>{x.t}</button>
          ))}
        </div>
      </div>

      {/* 首次加载 / 加载失败：区分“真的没数据”和“后端没连上”，不再静默显示成全 0 */}
      {loading && !data && (
        <div style={{ ...card, padding: '30px 20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-md)' }}>
          正在加载看板数据…（若后端刚重启，会自动重试连接）
        </div>
      )}
      {!loading && loadError && !data && (
        <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderColor: 'var(--color-danger)' }}>
          <span style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-danger)' }}>看板数据暂时没加载出来：{loadError}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => load(days, projectId, storyType, platform)}
            style={{ padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)', fontWeight: 600, border: '1px solid var(--color-accent)', color: 'var(--color-accent)', background: 'transparent' }}>重新加载</button>
        </div>
      )}

      {/* 核心 KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {kpis.map((it, i) => (
          <div key={i} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{it.label}</div>
            <div style={{ fontSize: 'var(--font-size-xxl)', fontWeight: 800, color: it.tone || 'var(--color-text-primary)', marginTop: 4, lineHeight: 1.15 }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 3 }}>{it.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {([['quality', '📊 质量画像'], ['daily', '📈 每日变化'], ['rework', '🔁 返工与效率']] as Array<[TabKey, string]>).map(([key, label]) => (
          <button key={key} style={pill(tab === key)} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ───────── 质量画像 ───────── */}
      {tab === 'quality' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
            {/* 质量总览三个仪表环 */}
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 10 }}><span style={colorBar('#3b76c3')} />质量总览</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <GaugeRing value={k.avgQualityScore} label="平均质量分" sub="满分 100" />
                <GaugeRing value={pct(k.wordComplianceRate)} label="字数达标率" sub={wc.short > 0 ? `${wc.short} 章偏短` : '按目标区间'} />
                <GaugeRing value={pct(k.firstPassRate)} label="一次成功率" sub={`近${days}天`} />
              </div>
            </div>

            {/* 七维问题雷达（维度可点下钻） */}
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 6 }}><span style={colorBar('#e74c3c')} />七大写作维度·问题分布</h3>
              {dimRadar.length === 0 ? <Empty text="当前没有待改问题（AI 生成正文会自动质检，或手动提交质检后这里画出短板维度）" /> : (
                <>
                  <RadarChart axes={dimRadar} color="#e74c3c" size={300} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {dims.map(d => {
                      const active = openDim === d.dim;
                      return (
                        <button key={d.dim} onClick={() => setOpenDim(active ? null : d.dim)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-sm)', fontFamily: 'inherit', textAlign: 'left', width: '100%', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, border: active ? '1px solid var(--color-accent)' : '1px solid transparent', background: active ? 'rgba(59,118,195,0.10)' : 'transparent', color: 'var(--color-text-primary)' }}>
                          <span>{d.name}{active ? ' ▲' : ' ▼'}</span>
                          <span style={{ color: 'var(--color-text-soft)' }}>{d.count} 个 · {d.chapterCount} 章 · 最重{d.maxSeverityLabel} · 点击查看</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 标签契合雷达 + 最需加强章节 */}
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 6 }}><span style={colorBar('#a855f7')} />与所选标签的契合度</h3>
              {!tagFit.available ? <Empty text="AI 生成正文自动质检后，这里展示平台、基调、风格、流派四个契合分（满分100），越饱满越贴合" /> : (
                <>
                  <RadarChart axes={tagRadar} max={100} color="#a855f7" size={280} levels={5} />
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginTop: 4 }}>
                    {tagFit.best && <div>· 最贴合：<b style={{ color: 'var(--color-success)' }}>{tagFit.best.name}（{tagFit.best.score}）</b></div>}
                    {tagFit.worst && tagFit.worst.dim !== tagFit.best?.dim && <div>· 最需加强：<b style={{ color: 'var(--color-warning)' }}>{tagFit.worst.name}（{tagFit.worst.score}）</b></div>}
                  </div>
                  {Array.isArray(tagFit.chapterWorst) && tagFit.chapterWorst.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>最需加强的章节（点进去改）</div>
                      {tagFit.chapterWorst.map((c: any, i: number) => (
                        <button key={i} onClick={() => gotoProjectPage(c.projectId, c.projectTitle, `writing-quality?chapterId=${c.chapterId || ''}`)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', fontFamily: 'inherit', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-primary)' }}>
                          <span>第{c.chapterIndex ?? '?'}章 {c.chapterTitle || ''}</span>
                          <span style={{ color: c.avg >= 85 ? 'var(--color-success)' : c.avg >= 70 ? 'var(--color-warning)' : 'var(--color-danger)', fontWeight: 700 }}>{c.avg} 分 ›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 七维下钻通栏：具体问题类型 → 章节 → 原文片段 → 去处理 */}
          {activeDim && (
            <div style={{ ...card, borderColor: 'var(--color-accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <h3 style={h3}><span style={colorBar('#e74c3c')} />{activeDim.name}：具体问题（{activeDim.count} 个 / 涉及 {activeDim.chapterCount} 章）</h3>
                <div style={{ flex: 1 }} />
                <button style={{ ...linkBtn, border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }} onClick={() => setOpenDim(null)}>收起</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeDim.types.map((t: any) => (
                  <div key={t.type} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)', fontWeight: 700, marginBottom: 8 }}>
                      <span style={{ color: sevColor(t.maxSeverity) }}>●</span>{t.label}
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>×{t.count} · 最重{t.maxSeverityLabel}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {t.items.map((it: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>《{it.projectTitle || '未命名'}》第{it.chapterIndex ?? '?'}章 {it.chapterTitle || ''}</div>
                            <div>{it.title}</div>
                            {it.evidence && <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 640 }}>“{it.evidence}”</div>}
                          </div>
                          <button style={linkBtn} onClick={() => gotoProjectPage(it.projectId, it.projectTitle, `writing-quality?chapterId=${it.chapterId || ''}`)}>去处理 →</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#2ecc71')} />章节字数达标</h3>
              {wc.writtenChapters === 0 ? <Empty text="还没有写出正文的章节" /> : (
                <>
                  <Donut
                    segments={[
                      { label: '达标', value: wc.ok, color: '#2ecc71' },
                      { label: '偏短', value: wc.short, color: '#f39c12' },
                      { label: '偏长', value: wc.long, color: '#e67e22' },
                    ]}
                    centerTop={`${pct(wc.rate) ?? '—'}%`} centerBottom="达标率"
                  />
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.7 }}>
                    {wc.writtenChapters} 章有正文，平均 {formatWords(wc.avgWords)}{wc.short ? `；偏短章平均还差 ${wc.avgDeficit} 字` : ''}
                  </div>
                </>
              )}
            </div>

            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#f39c12')} />上下文 / 大纲矛盾</h3>
              {consistency.total === 0 ? <Empty text="当前没有未解决的矛盾" /> : (
                <>
                  <HBars data={consistency.types.map((t: any) => ({ key: t.key, count: t.count }))} color="#f39c12" empty="无" />
                  <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', alignItems: 'center' }}>
                    {consistency.severity.map((s: any) => <span key={s.value}>{s.key} {s.count}</span>)}
                    {projectId && (
                      <>
                        <div style={{ flex: 1 }} />
                        <button style={linkBtn} onClick={() => gotoProjectPage(projectId, currentProject?.title, 'conflicts')}>去矛盾页 →</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#60a5fa')} />作品构成</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 6 }}>目标平台</div>
                  {dist.platform.length ? <Donut size={150} thickness={18} segments={dist.platform.map((d: any, i: number) => ({ label: d.key, value: d.count, color: PALETTE[i % PALETTE.length] }))} /> : <Empty text="暂无作品" />}
                </div>
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 6 }}>长短篇</div>
                  {dist.storyType.length ? <Donut size={150} thickness={18} segments={dist.storyType.map((d: any, i: number) => ({ label: d.key, value: d.count, color: PALETTE[(i + 2) % PALETTE.length] }))} /> : <Empty text="暂无作品" />}
                </div>
              </div>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#e67e22')} />具体问题排行（最新质检，越靠前越该优先改）</h3>
            <HBars data={issueTypes.map((x: any) => ({ key: x.key, count: x.count }))} color="#e67e22" empty="暂无质检问题（AI 生成正文后会自动质检并在此汇总）" maxItems={14} />
          </div>

          {/* 当前值 vs 平台·长短篇爆款基准（确定性现算，差距直接给人话） */}
          {benchmark.available && (
            <div style={{ ...card, borderColor: 'rgba(59,118,195,0.4)' }}>
              <h3 style={{ ...h3, marginBottom: 10 }}><span style={colorBar('#3b76c3')} />对照平台基准：现在的正文离该平台标准差在哪</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
                {benchmark.groups.map((g: any, gi: number) => (
                  <div key={gi} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{g.platformLabel} · {g.storyType === 'long_novel' ? '长篇' : '短篇'}（{g.chapterCount} 章）</div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 8 }}>读者：{g.audience.core}；耐心线：{g.audience.patience}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {g.metrics.map((m: any, mi: number) => (
                        <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, flexWrap: 'wrap' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: benchStatusColor(m.status) }} />
                          <span style={{ minWidth: 96, color: 'var(--color-text-secondary)' }}>{m.label}</span>
                          <b style={{ color: benchStatusColor(m.status) }}>{m.value}</b>
                          <span style={{ color: 'var(--color-text-muted)' }}>标准 {m.target}</span>
                          {m.advice ? <span style={{ color: 'var(--color-warning)', flex: 1, textAlign: 'right' }}>{m.advice}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 逐章质量矩阵：每章逐项达标，点行进该章 */}
          {matrix.available && (
            <div style={{ ...card, overflowX: 'auto' }}>
              <h3 style={{ ...h3, marginBottom: 10 }}><span style={colorBar('#2ecc71')} />逐章质量明细（绿达标 / 橙临界 / 红不达标，点行去改）</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 880 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                  {['章节', '字数', '对话占比', '平均段长', '开篇钩', '章尾钩', '返工', '追读风险', '质检分'].map(x => <th key={x} style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{x}</th>)}
                </tr></thead>
                <tbody>
                  {matrix.rows.map((r: any) => (
                    <tr key={r.chapterId} onClick={() => gotoProjectPage(r.projectId, r.projectTitle, 'writing')} style={{ borderBottom: '1px solid rgba(127,127,127,0.08)', cursor: 'pointer' }}>
                      <Td strong>第{r.chapterIndex}章 {r.title}</Td>
                      <Td tone={r.wordStatus === 'ok' ? 'var(--color-success)' : 'var(--color-warning)'}>{r.words}{r.wordStatus !== 'ok' ? <>（应{r.wordMin}-{r.wordMax}）</> : null}</Td>
                      <Td tone={benchStatusColor(r.checks.dialogueRatio)}>{Math.round(r.dialogueRatio * 100)}%</Td>
                      <Td tone={benchStatusColor(r.checks.avgParaChars)}>{r.avgParaChars}字</Td>
                      <Td tone={r.openingHook ? 'var(--color-success)' : 'var(--color-danger)'}>{r.openingHook ? '有' : '无'}</Td>
                      <Td tone={r.endingHook ? 'var(--color-success)' : 'var(--color-danger)'}>{r.endingHook ? '有' : '无'}</Td>
                      <Td tone={r.repairCount >= 3 ? 'var(--color-danger)' : r.repairCount > 0 ? 'var(--color-warning)' : undefined}>{r.repairCount}</Td>
                      <Td tone={r.retentionRisk === 0 ? 'var(--color-success)' : r.retentionRisk === 1 ? 'var(--color-warning)' : 'var(--color-danger)'} title={(r.retentionReasons || []).join('；')}>{r.retentionRisk === 0 ? '安全' : r.retentionRisk === 1 ? '注意' : '高风险'}</Td>
                      <Td tone={r.qualityScore == null ? undefined : r.qualityScore >= 85 ? 'var(--color-success)' : r.qualityScore >= 70 ? 'var(--color-warning)' : 'var(--color-danger)'}>{r.qualityScore == null ? '待质检' : r.qualityScore}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────── 每日变化 ───────── */}
      {tab === 'daily' && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <h3 style={h3}><span style={colorBar('#60a5fa')} />每日变化</h3>
            <div style={{ flex: 1 }} />
            {([['issues', '问题新增 vs 解决'], ['llmCalls', 'AI 生成次数'], ['outputWords', '产出字数'], ['newChapters', '新建章节']] as Array<[TrendKey, string]>).map(([key, label]) => (
              <button key={key} style={pill(trendKey === key)} onClick={() => setTrendKey(key)}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 12, flexWrap: 'wrap' }}>
            {trendTotals.map(t => (
              <span key={t.key}>{t.label}合计 <b style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-lg)' }}>{num(t.total)}</b></span>
            ))}
          </div>
          {trend.length ? <TrendChart labels={trend.map(t => t.date)} rows={trend} series={TREND_CONF[trendKey].series} /> : <Empty text="所选时间暂无记录" />}
        </div>
      )}

      {/* ───────── 返工与效率 ───────── */}
      {tab === 'rework' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', justifyContent: 'space-around' }}>
            <GaugeRing value={pct(process.firstPassRate)} label="一次成功率" sub="越高越少返工" />
            <Mini label="正文平均成稿版数" value={bodyConv.chapterCount ? `${bodyConv.avgVersions} 版/章` : '—'} sub="首版+补字+对齐+基准，越接近1越好" tone={bodyConv.avgVersions > 2 ? 'var(--color-warning)' : undefined} />
            <Mini label="失败 / 截断 / 空白" value={`${num(process.failCount)} / ${num(process.truncatedCount)} / ${num(process.emptyCount)}`} tone={process.failCount ? 'var(--color-danger)' : undefined} />
            <Mini label="正文首版产出 / 目标" value={(() => { const b = process.steps.find((x: any) => x.isBody); return b ? `${b.avgOutputWords ?? '—'} / ${b.avgTargetWords ?? '—'}` : '—'; })()} />
            <Mini label="章节修订总数" value={num(revision.totalRevisions)} sub={`${revision.revisedChapters} 章改过 · 章均 ${revision.avgPerChapter}`} />
          </div>

          {/* 正文收敛效率：回答"少字要补几轮、为何反复重写" */}
          <div style={card}>
            <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#3b76c3')} />正文一次写到位的能力（首版 vs 补字/回炉）</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
              <Mini label="正文首版一次到位率" value={bodyConv.firstHitRate == null ? '—' : `${pct(bodyConv.firstHitRate)}%`} sub={bodyConv.firstCount ? `${bodyConv.firstHitCount}/${bodyConv.firstCount} 章首版就落在目标篇幅` : '近段暂无正文生成'} tone={bodyConv.firstHitRate == null ? undefined : bodyConv.firstHitRate >= 0.8 ? 'var(--color-success)' : 'var(--color-warning)'} />
              <Mini label="平均补字轮次" value={bodyConv.bodyCallCount ? `${bodyConv.avgLengthRetry} 轮/章` : '—'} sub={`${num(bodyConv.chaptersNeedLengthRetry)} 章需要补字`} tone={bodyConv.avgLengthRetry > 1 ? 'var(--color-warning)' : undefined} />
              <Mini label="平均对齐回炉" value={bodyConv.bodyCallCount ? `${bodyConv.avgAlignmentRepair} 次/章` : '—'} sub={`${num(bodyConv.chaptersNeedRepair)} 章被大纲/红线打回重写`} tone={bodyConv.avgAlignmentRepair > 1 ? 'var(--color-danger)' : undefined} />
              <Mini label="平均基准提升" value={bodyConv.bodyCallCount ? `${bodyConv.avgBenchmarkRefine} 轮/章` : '—'} sub={`${num(bodyConv.chaptersNeedBenchmarkRefine)} 章首版未达平台爆款线、被自动精修`} tone={bodyConv.avgBenchmarkRefine != null && bodyConv.avgBenchmarkRefine > 1 ? 'var(--color-warning)' : undefined} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#e94560')} />正文为什么反复回炉</h3>
              <HBars data={repairReasons.map((x: any) => ({ key: x.key, count: x.count }))} color="#e94560" empty="当前没有被打回的正文" />
            </div>
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#f39c12')} />章节修订次数分布</h3>
              <Donut segments={revision.distribution.filter((d: any) => d.count > 0).map((d: any, i: number) => ({ label: `${d.key} 次`, value: d.count, color: ['#2ecc71', '#f39c12', '#e74c3c'][i] || '#7f8c9b' }))} centerTop={revision.revisedChapters} centerBottom="章改过" />
            </div>
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#e74c3c')} />生成失败原因</h3>
              {process.errorKinds.length ? <Donut segments={process.errorKinds.map((d: any, i: number) => ({ label: d.key, value: d.count, color: PALETTE[i % PALETTE.length] }))} /> : <Empty text="近段时间没有失败" />}
            </div>
            <div style={card}>
              <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('#e94560')} />反复修改最多的章节</h3>
              <HBars data={revision.heavyChapters.map((c: any) => ({ key: `第${c.chapterIndex ?? '?'}章 ${c.title || ''}`, count: c.count, tone: '#e74c3c' }))} color="#e74c3c" empty="没有修订 3 次及以上的章节" />
            </div>
          </div>

          <div style={{ ...card, overflowX: 'auto' }}>
            <h3 style={{ ...h3, marginBottom: 12 }}><span style={colorBar('var(--color-success)')} />各环节生成情况（正文按“章”聚合，补字/重写不重复计数）</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 880 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                {['环节', '章数/次数', '一次成功率', '平均尝试', '内部补轮 补字/对齐/基准', '失败', '截断', '空白', '首版产出/目标'].map(x => <th key={x} style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{x}</th>)}
              </tr></thead>
              <tbody>
                {process.steps.length === 0 ? <tr><td colSpan={9} style={{ padding: '18px 8px', color: 'var(--color-text-muted)' }}>近{days}天暂无生成记录</td></tr>
                  : process.steps.map((m: any) => {
                    const rate = pct(m.firstPassRate);
                    return (
                      <tr key={m.scenario} style={{ borderBottom: '1px solid rgba(127,127,127,0.08)', backgroundColor: m.isBody ? 'rgba(59,118,195,0.08)' : 'transparent' }}>
                        <Td strong>{m.scenarioName}{m.isBody ? '（正文）' : ''}</Td>
                        <Td>{m.isBody ? `${m.calls} 章（前后 ${m.llmCalls} 版）` : `${m.calls} 次`}</Td>
                        <Td tone={rate == null ? undefined : rate >= 80 ? 'var(--color-success)' : 'var(--color-warning)'}>{rate == null ? '—' : `${rate}%`}</Td>
                        <Td>{m.isBody ? `${m.avgAttempts} 版/章` : `${m.avgAttempts} 次`}</Td>
                        <Td tone={m.isBody && m.avgAlignmentRepair > 1 ? 'var(--color-danger)' : undefined}>{m.isBody ? `${m.avgLengthRetry} / ${m.avgAlignmentRepair} / ${m.avgBenchmarkRefine}` : '—'}</Td>
                        <Td tone={m.failCount > 0 ? 'var(--color-danger)' : undefined}>{num(m.failCount)}</Td>
                        <Td>{num(m.truncatedCount)}</Td><Td>{num(m.emptyCount)}</Td>
                        <Td>{m.avgOutputWords == null ? '—' : `${m.avgOutputWords}${m.avgTargetWords ? ' / ' + m.avgTargetWords : ''}`}</Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.7, padding: '10px 2px' }}>{text}</div>
);
const Mini: React.FC<{ label: string; value: React.ReactNode; tone?: string; sub?: string }> = ({ label, value, tone, sub }) => (
  <div style={{ minWidth: 150 }}>
    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: tone || 'var(--color-text-primary)', marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 2 }}>{sub}</div>}
  </div>
);
const Td: React.FC<{ children: React.ReactNode; strong?: boolean; muted?: boolean; tone?: string; title?: string }> = ({ children, strong, muted, tone, title }) => (
  <td title={title} style={{ padding: '8px', fontWeight: strong ? 650 : 400, color: tone || (muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)'), whiteSpace: 'nowrap' }}>{children}</td>
);

export default WorkbenchPage;
