import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

const payload = <T,>(res: any): T => res?.data ?? res;

interface Chapter {
  id: string;
  title: string;
  volumeIndex?: number;
  volume_index?: number;
  chapterIndex?: number;
  chapter_index?: number;
  wordCount?: number;
  word_count?: number;
  status?: string;
  content?: string;
  outlineId?: string;
  outline_id?: string;
}

interface ProjectInfo {
  title?: string;
  type?: string;
  targetWords?: number;
  target_words?: number;
  currentWords?: number;
  current_words?: number;
  platformStyle?: string;
  platform_style?: string;
  description?: string;
}

type TabKey = 'overview' | 'focus' | 'characters' | 'relations' | 'foreshadowing' | 'world' | 'timeline' | 'precheck' | 'postupdate';

const PHASE_TASKS = [
  { id: '7.0', title: '阶段展示与边界收口', status: '本轮实现' },
  { id: '7.1', title: '小说全貌总览 + 当前章节创作焦点', status: '本轮实现' },
  { id: '7.2', title: '人物状态与人物关系网', status: '待开发' },
  { id: '7.3', title: '伏笔雷达与伏笔生命周期', status: '待开发' },
  { id: '7.4', title: '世界观规则与时间线三线模型', status: '待开发' },
  { id: '7.5', title: '写作前检查与写作后更新闭环', status: '待开发' },
];

const EMPTY = '暂无数据，后续将由写作后更新或手动录入生成。';

const ContinuityCockpitPage: React.FC = () => {
  const { id: projectId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [outlines, setOutlines] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [foreshadowings, setForeshadowings] = useState<any[]>([]);
  const [timelines, setTimelines] = useState<any[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [stateItems, setStateItems] = useState<any[]>([]);
  const [qualityReports, setQualityReports] = useState<any[]>([]);
  const [focusChapterId, setFocusChapterId] = useState('');
  const [manualGoal, setManualGoal] = useState('');
  const [manualForbidden, setManualForbidden] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');

  const viewKey = `phase7:continuity:${projectId}`;

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [projectRes, chaptersRes, outlinesRes, charactersRes, foreshadowRes, timelinesRes, stateRes, reportsRes] = await Promise.allSettled([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/chapters`),
        api.get(`/projects/${projectId}/outlines/tree`),
        api.get(`/projects/${projectId}/characters`),
        api.get(`/projects/${projectId}/foreshadowings`),
        api.get(`/projects/${projectId}/timelines`),
        api.get(`/projects/${projectId}/state/items?status=all&limit=300`),
        api.get(`/projects/${projectId}/writing-quality/reports?limit=200`),
      ]);
      const projectData = projectRes.status === 'fulfilled' ? payload<any>(projectRes.value) : null;
      const chapterData = chaptersRes.status === 'fulfilled' ? payload<Chapter[]>(chaptersRes.value) || [] : [];
      const timelineData = timelinesRes.status === 'fulfilled' ? payload<any[]>(timelinesRes.value) || [] : [];
      setProject(projectData?.data || projectData || null);
      setChapters(Array.isArray(chapterData) ? chapterData : []);
      setOutlines(outlinesRes.status === 'fulfilled' ? payload<any[]>(outlinesRes.value) || [] : []);
      setCharacters(charactersRes.status === 'fulfilled' ? payload<any[]>(charactersRes.value) || [] : []);
      setForeshadowings(foreshadowRes.status === 'fulfilled' ? payload<any[]>(foreshadowRes.value) || [] : []);
      setTimelines(timelineData);
      setStateItems(stateRes.status === 'fulfilled' ? payload<any[]>(stateRes.value) || [] : []);
      setQualityReports(reportsRes.status === 'fulfilled' ? payload<any[]>(reportsRes.value) || [] : []);

      const eventResults = await Promise.allSettled(timelineData.slice(0, 5).map(t => api.get(`/projects/${projectId}/timelines/${t.id}/events`)));
      setTimelineEvents(eventResults.flatMap(result => result.status === 'fulfilled' ? payload<any[]>(result.value) || [] : []));
    } catch (err: any) {
      setError(err.message || '连续性驾驶舱加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!chapters.length || focusChapterId) return;
    const saved = readView(viewKey).focusChapterId;
    const sorted = [...chapters].sort(chapterSort);
    const candidate = saved && chapters.some(ch => ch.id === saved)
      ? saved
      : [...sorted].reverse().find(ch => ch.status !== 'locked')?.id || sorted[0]?.id || '';
    setFocusChapterId(candidate);
  }, [chapters, focusChapterId, viewKey]);

  useEffect(() => {
    const saved = readView(viewKey);
    setManualGoal(saved.manualGoal || '');
    setManualForbidden(saved.manualForbidden || '');
    setManualNotes(saved.manualNotes || '');
    setManualPrompt(saved.manualPrompt || '');
  }, [viewKey]);

  useEffect(() => {
    if (!projectId || !focusChapterId) return;
    writeView(viewKey, { focusChapterId, manualGoal, manualForbidden, manualNotes, manualPrompt });
  }, [focusChapterId, manualGoal, manualForbidden, manualNotes, manualPrompt, projectId, viewKey]);

  const sortedChapters = useMemo(() => [...chapters].sort(chapterSort), [chapters]);
  const focusChapter = useMemo(() => chapters.find(ch => ch.id === focusChapterId) || sortedChapters[0] || null, [chapters, focusChapterId, sortedChapters]);
  const focusIndex = useMemo(() => focusChapter ? sortedChapters.findIndex(ch => ch.id === focusChapter.id) : -1, [focusChapter, sortedChapters]);
  const outlineFlat = useMemo(() => flattenOutlines(outlines), [outlines]);
  const focusOutline = useMemo(() => findFocusOutline(focusChapter, outlineFlat), [focusChapter, outlineFlat]);
  const recentChapters = useMemo(() => sortedChapters.slice(Math.max(0, focusIndex - 4), Math.max(0, focusIndex) + 1), [focusIndex, sortedChapters]);
  const relatedForeshadowings = useMemo(() => findRelatedForeshadowings(foreshadowings, focusChapter, focusIndex + 1), [foreshadowings, focusChapter, focusIndex]);
  const relatedTimelineEvents = useMemo(() => findRelatedTimelineEvents(timelineEvents, focusChapter), [timelineEvents, focusChapter]);
  const relatedCharacters = useMemo(() => findRelatedCharacters(characters, focusChapter, focusOutline), [characters, focusChapter, focusOutline]);
  const pendingItems = useMemo(() => stateItems.filter(item => ['pending', 'draft', 'needs_review'].includes(item.status)), [stateItems]);
  const timelineRisks = qualityReports.reduce((sum, report) => sum + Number(report.timelineRiskCount || 0), 0)
    + qualityReports.filter(r => String(r.payload || '').includes('timeline_conflict') || String(r.payload || '').includes('causality_gap')).length;
  const foreshadowingRisks = foreshadowings.filter(f => {
    const status = f.status || '';
    return status === 'pending' || status === 'buried' && Number(f.plannedRecoveryChapterIndex ?? f.planned_recovery_chapter_index ?? 9999) <= (focusIndex + 2);
  }).length;

  const stats = {
    totalChapters: chapters.length,
    writtenChapters: chapters.filter(ch => (ch.wordCount ?? ch.word_count ?? 0) > 0 || ch.status === 'completed' || ch.status === 'locked').length,
    writtenWords: chapters.reduce((sum, ch) => sum + Number(ch.wordCount ?? ch.word_count ?? 0), 0),
    targetWords: Number(project?.targetWords ?? project?.target_words ?? 0),
    pendingConfirmations: pendingItems.length,
    foreshadowingRisks,
    timelineRisks,
    characterStateRisks: stateItems.filter(item => item.targetType === 'character' || item.target_type === 'character').length,
    worldRuleRisks: qualityReports.filter(r => String(r.summary || '').includes('世界观') || String(r.payload || '').includes('world')).length,
  };

  const generatedPrompt = useMemo(() => buildPreWritingPrompt({
    project,
    focusChapter,
    focusOutline,
    relatedCharacters,
    relatedForeshadowings,
    relatedTimelineEvents,
    manualGoal,
    manualForbidden,
    manualNotes,
  }), [project, focusChapter, focusOutline, relatedCharacters, relatedForeshadowings, relatedTimelineEvents, manualGoal, manualForbidden, manualNotes]);

  const visiblePrompt = manualPrompt || generatedPrompt;

  if (loading) return <div style={styles.loading}>加载小说连续性驾驶舱...</div>;
  if (!projectId) return <div style={styles.loading}>请先选择项目。</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>Phase 7：小说连续性驾驶舱</div>
          <h1 style={styles.title}>小说连续性驾驶舱</h1>
          <p style={styles.subtitle}>围绕当前创作章节查看全貌、风险与写作前注意事项。7.2-7.5 只展示入口，不假装完成。</p>
        </div>
        <button type="button" style={styles.secondaryButton} onClick={() => navigate(`/project/${projectId}/dashboard`)}>返回首页</button>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.focusBar}>
        <label style={styles.label}>当前创作章节</label>
        <select value={focusChapterId} onChange={event => setFocusChapterId(event.target.value)} style={styles.select}>
          {sortedChapters.map(ch => (
            <option key={ch.id} value={ch.id}>
              第{volumeIndex(ch)}卷 第{chapterIndex(ch)}章 {ch.title} [{ch.status || 'draft'}]
            </option>
          ))}
        </select>
        <span style={styles.savedHint}>已保存到本地视图状态，刷新后恢复。</span>
      </section>

      <section style={styles.phasePanel}>
        <div style={styles.panelTitle}>Phase 7 分期边界</div>
        <div style={styles.phaseGrid}>
          {PHASE_TASKS.map(task => (
            <div key={task.id} style={{ ...styles.phaseItem, borderColor: task.status === '本轮实现' ? 'rgba(34,197,94,.35)' : 'rgba(148,163,184,.22)' }}>
              <strong>{task.id}</strong>
              <span>{task.title}</span>
              <em>{task.status}</em>
            </div>
          ))}
        </div>
      </section>

      <nav style={styles.tabs}>
        {[
          ['overview', '总览'],
          ['focus', '当前章焦点'],
          ['characters', '人物'],
          ['relations', '关系网'],
          ['foreshadowing', '伏笔'],
          ['world', '世界观'],
          ['timeline', '时间线'],
          ['precheck', '写作前检查'],
          ['postupdate', '写作后更新'],
        ].map(([key, label]) => (
          <button key={key} type="button" style={activeTab === key ? styles.tabActive : styles.tab} onClick={() => setActiveTab(key as TabKey)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && renderOverview({ stats, focusChapter, recentChapters, stateItems: pendingItems, relatedForeshadowings, relatedTimelineEvents })}
      {activeTab === 'focus' && renderFocus({
        focusChapter,
        focusOutline,
        relatedCharacters,
        relatedForeshadowings,
        relatedTimelineEvents,
        manualGoal,
        setManualGoal,
        manualForbidden,
        setManualForbidden,
        manualNotes,
        setManualNotes,
        manualPrompt,
        setManualPrompt,
        visiblePrompt,
      })}
      {activeTab !== 'overview' && activeTab !== 'focus' && renderFutureTab(activeTab)}
    </div>
  );
};

function renderOverview(input: {
  stats: any;
  focusChapter: Chapter | null;
  recentChapters: Chapter[];
  stateItems: any[];
  relatedForeshadowings: any[];
  relatedTimelineEvents: any[];
}) {
  const cards = [
    ['当前卷/当前章', input.focusChapter ? `第${volumeIndex(input.focusChapter)}卷 / 第${chapterIndex(input.focusChapter)}章` : '待补全'],
    ['已写章节/总章节', `${input.stats.writtenChapters}/${input.stats.totalChapters}`],
    ['已写字数/目标字数', `${input.stats.writtenWords}/${input.stats.targetWords || '待接入'}`],
    ['待确认设定', String(input.stats.pendingConfirmations)],
    ['伏笔风险', String(input.stats.foreshadowingRisks)],
    ['时间线风险', input.stats.timelineRisks ? String(input.stats.timelineRisks) : '待接入'],
    ['人物状态风险', input.stats.characterStateRisks ? String(input.stats.characterStateRisks) : '待接入'],
    ['世界观规则风险', input.stats.worldRuleRisks ? String(input.stats.worldRuleRisks) : '待接入'],
  ];
  return (
    <div>
      <section style={styles.cardGrid}>
        {cards.map(([label, value]) => (
          <div key={label} style={styles.statCard}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <section style={styles.twoColumns}>
        <Panel title="当前创作全貌">
          <Line label="当前主线阶段" value={input.focusChapter ? '围绕当前章节继续推进，主线阶段待由大纲补全。' : EMPTY} />
          <Line label="当前章节标题" value={input.focusChapter?.title || '待选择章节'} />
          <Line label="最近章节" value={input.recentChapters.length ? input.recentChapters.map(ch => ch.title).join(' / ') : EMPTY} />
          <Line label="最近状态变化" value={input.stateItems.length ? input.stateItems.slice(0, 5).map(item => item.title || item.summary).join(' / ') : EMPTY} />
        </Panel>
        <Panel title="下一个创作动作">
          <Line label="即将处理的伏笔" value={input.relatedForeshadowings.length ? input.relatedForeshadowings.slice(0, 4).map(f => f.content || f.title).join(' / ') : EMPTY} />
          <Line label="时间线风险" value={input.relatedTimelineEvents.length ? input.relatedTimelineEvents.slice(0, 4).map(e => e.title).join(' / ') : EMPTY} />
          <Line label="待作者确认项" value={input.stateItems.length ? `${input.stateItems.length} 项待确认` : EMPTY} />
          <Line label="建议" value="先确认当前章节目标、禁止写错事项，再进入正文生成或手写。" />
        </Panel>
      </section>
    </div>
  );
}

function renderFocus(input: any) {
  const ch = input.focusChapter as Chapter | null;
  const goal = input.manualGoal || extractGoal(input.focusOutline);
  const forbiddenBase = [
    ch?.status === 'locked' ? 'locked 章节不可自动修改。' : '',
    '已确认设定不可被当前页面直接覆盖。',
    'AI 生成内容必须进入待确认，不直接写入正式设定库。',
    !goal ? '当前章节目标待从大纲补全。' : '',
  ].filter(Boolean);
  return (
    <div>
      <section style={styles.twoColumns}>
        <Panel title="顶部全貌摘要区">
          <Line label="章节标题" value={ch?.title || '待选择章节'} />
          <Line label="卷序号/章序号" value={ch ? `${volumeIndex(ch)} / ${chapterIndex(ch)}` : '待补全'} />
          <Line label="状态/字数" value={ch ? `${ch.status || 'draft'} / ${wordCount(ch)}字 / ${ch.status === 'locked' ? 'locked' : '可编辑'}` : '待补全'} />
        </Panel>
        <Panel title="当前章节创作辅助区">
          <Line label="本章写作目标" value={goal || '待从大纲补全'} />
          <Line label="出场人物" value={input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => c.name).join(' / ') : '暂无本章角色数据，Phase 7.2 将接入角色状态系统。'} />
          <Line label="本章备注" value={input.manualNotes || '暂无人工备注。'} />
        </Panel>
      </section>

      <section style={styles.detailGrid}>
        <Panel title="结构化详情区">
          <Line label="人物状态注意事项" value={input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => `${c.name}：${c.identity || '身份待补全'}`).join('；') : '暂无本章角色状态快照，Phase 7.2 将接入角色状态系统。'} />
          <Line label="关系注意事项" value="暂无本章关系数据，Phase 7.2 将接入人物关系网。" />
          <Line label="伏笔注意事项" value={input.relatedForeshadowings.length ? input.relatedForeshadowings.map((f: any) => f.content || f.title).join('；') : '暂无本章伏笔任务，Phase 7.3 将接入伏笔雷达。'} />
          <Line label="世界观注意事项" value="暂无本章世界观规则，Phase 7.4 将接入世界观规则系统。" />
          <Line label="时间线注意事项" value={input.relatedTimelineEvents.length ? input.relatedTimelineEvents.map((e: any) => e.title).join('；') : '暂无本章时间线事件，Phase 7.4 将接入时间线三线模型。'} />
          <Line label="禁止写错事项" value={[...forbiddenBase, input.manualForbidden].filter(Boolean).join('；')} />
        </Panel>
        <Panel title="人工微调区">
          <label style={styles.label}>当前章写作目标</label>
          <textarea value={input.manualGoal} onChange={(e) => input.setManualGoal(e.target.value)} style={styles.textarea} placeholder="人工补充，仅保存到本地视图状态。" />
          <label style={styles.label}>禁止写错事项</label>
          <textarea value={input.manualForbidden} onChange={(e) => input.setManualForbidden(e.target.value)} style={styles.textarea} placeholder="每行一条。不会覆盖正式设定库。" />
          <label style={styles.label}>本章备注</label>
          <textarea value={input.manualNotes} onChange={(e) => input.setManualNotes(e.target.value)} style={styles.textarea} />
          <div style={styles.notice}>人工修改内容尚未写入正式设定库；已确认设定不会被此页面直接覆盖。</div>
        </Panel>
      </section>

      <Panel title="本章写作前提示词">
        <textarea value={input.visiblePrompt} onChange={(e) => input.setManualPrompt(e.target.value)} style={{ ...styles.textarea, minHeight: 240 }} />
        <div style={styles.notice}>可复制文本用于写作前检查。缺失信息会标记为“待补全”，不会编造人物关系、伏笔或世界观规则。</div>
      </Panel>
    </div>
  );
}

function renderFutureTab(tab: TabKey) {
  const phaseMap: Record<string, string> = {
    characters: 'Phase 7.2 将接入角色状态系统。',
    relations: 'Phase 7.2 将接入人物关系网。',
    foreshadowing: 'Phase 7.3 将接入伏笔雷达与生命周期。',
    world: 'Phase 7.4 将接入世界观规则系统。',
    timeline: 'Phase 7.4 将接入时间线三线模型。',
    precheck: 'Phase 7.5 将接入写作前检查。',
    postupdate: 'Phase 7.5 将接入写作后更新闭环。',
  };
  return (
    <Panel title="分期入口">
      <p style={styles.empty}>{phaseMap[tab] || '后续阶段实现。'}</p>
      <p style={styles.empty}>当前只展示入口和空态，不生成占位关系、占位伏笔或不存在的规则。</p>
    </Panel>
  );
}

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section style={styles.panel}>
    <h2 style={styles.panelTitle}>{title}</h2>
    {children}
  </section>
);

const Line: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={styles.line}>
    <span>{label}</span>
    <strong>{value || EMPTY}</strong>
  </div>
);

function readView(key: string) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}

function writeView(key: string, value: Record<string, unknown>) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function chapterSort(a: Chapter, b: Chapter) {
  return volumeIndex(a) - volumeIndex(b) || chapterIndex(a) - chapterIndex(b);
}

function volumeIndex(ch: Chapter) { return Number(ch.volumeIndex ?? ch.volume_index ?? 1); }
function chapterIndex(ch: Chapter) { return Number(ch.chapterIndex ?? ch.chapter_index ?? 1); }
function wordCount(ch: Chapter) { return Number(ch.wordCount ?? ch.word_count ?? 0); }

function flattenOutlines(items: any[]): any[] {
  return items.flatMap(item => [item, ...flattenOutlines(item.children || [])]);
}

function findFocusOutline(chapter: Chapter | null, outlines: any[]) {
  if (!chapter) return null;
  return outlines.find(item => item.id === (chapter.outlineId || chapter.outline_id))
    || outlines.find(item => Number(item.order ?? 0) + 1 === chapterIndex(chapter) && item.level === 'chapter')
    || null;
}

function extractGoal(outline: any) {
  if (!outline) return '';
  const detail = outline.detail || safeJson(outline.detail_json);
  return detail.chapterGoal || detail.chapter_goal || detail.chapterFunction || outline.content?.split('\n')[0] || '';
}

function findRelatedCharacters(characters: any[], chapter: Chapter | null, outline: any) {
  if (!chapter) return [];
  const text = `${chapter.title || ''}\n${chapter.content || ''}\n${outline?.content || ''}`;
  return characters.filter(c => c.name && text.includes(c.name)).slice(0, 8);
}

function findRelatedForeshadowings(items: any[], chapter: Chapter | null, index: number) {
  if (!chapter) return [];
  return items.filter(item => {
    const buried = Number(item.buriedChapterIndex ?? item.buried_chapter_index ?? -1);
    const recover = Number(item.plannedRecoveryChapterIndex ?? item.planned_recovery_chapter_index ?? -1);
    return buried === index || recover === index || recover > 0 && recover <= index + 2;
  }).slice(0, 8);
}

function findRelatedTimelineEvents(events: any[], chapter: Chapter | null) {
  if (!chapter) return [];
  return events.filter(event => {
    const ids = event.relatedChapterIds || event.related_chapter_ids || [];
    return Array.isArray(ids) ? ids.includes(chapter.id) : String(ids).includes(chapter.id);
  }).slice(0, 8);
}

function buildPreWritingPrompt(input: any) {
  const ch = input.focusChapter as Chapter | null;
  return [
    `当前章节信息：${ch ? `第${volumeIndex(ch)}卷第${chapterIndex(ch)}章《${ch.title}》，状态 ${ch.status || 'draft'}，字数 ${wordCount(ch)}` : '待补全'}`,
    `前情提要：${input.focusOutline?.content?.slice(0, 240) || '待补全'}`,
    `本章目标：${input.manualGoal || extractGoal(input.focusOutline) || '待补全'}`,
    `出场人物：${input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => c.name).join('、') : '待补全'}`,
    `人物状态注意事项：${input.relatedCharacters.length ? input.relatedCharacters.map((c: any) => `${c.name}-${c.identity || '身份待补全'}`).join('；') : '待补全'}`,
    '关系注意事项：待补全，Phase 7.2 将接入人物关系网。',
    `伏笔注意事项：${input.relatedForeshadowings.length ? input.relatedForeshadowings.map((f: any) => f.content || f.title).join('；') : '待补全'}`,
    '世界观注意事项：待补全，Phase 7.4 将接入世界观规则系统。',
    `时间线注意事项：${input.relatedTimelineEvents.length ? input.relatedTimelineEvents.map((e: any) => e.title).join('；') : '待补全'}`,
    '冲突设计：待补全。',
    '爽点 / 压迫点：待补全。',
    '结尾钩子：待补全。',
    `禁止写错事项：${input.manualForbidden || 'locked 章节不可自动修改；已确认设定不可被当前页面直接覆盖；AI 生成内容必须进入待确认。'}`,
    `作者备注：${input.manualNotes || '无'}`,
  ].join('\n');
}

function safeJson(raw: string) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 1320, margin: '0 auto', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif' },
  loading: { padding: 40, color: '#94a3b8', textAlign: 'center' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18 },
  kicker: { fontSize: 12, color: '#60a5fa', fontWeight: 700, marginBottom: 4 },
  title: { margin: 0, fontSize: 26 },
  subtitle: { margin: '6px 0 0', color: '#94a3b8', fontSize: 13 },
  secondaryButton: { background: '#0f172a', color: '#dbeafe', border: '1px solid #334155', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' },
  focusBar: { display: 'flex', gap: 12, alignItems: 'center', padding: 14, border: '1px solid #334155', background: '#111827', borderRadius: 8, marginBottom: 14, flexWrap: 'wrap' },
  label: { fontSize: 12, color: '#94a3b8', fontWeight: 700 },
  select: { background: '#020617', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', minWidth: 320 },
  savedHint: { color: '#64748b', fontSize: 12 },
  phasePanel: { border: '1px solid #334155', borderRadius: 8, padding: 14, marginBottom: 14, background: '#0f172a' },
  phaseGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 },
  phaseItem: { border: '1px solid', borderRadius: 6, padding: 10, display: 'grid', gap: 4, fontSize: 12 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid #334155', paddingBottom: 8 },
  tab: { background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  tabActive: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb', borderRadius: 6, padding: '7px 10px', cursor: 'pointer' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 },
  statCard: { background: '#111827', border: '1px solid #334155', borderRadius: 8, padding: 14, display: 'grid', gap: 8 },
  twoColumns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 },
  detailGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, .8fr)', gap: 14, marginBottom: 14 },
  panel: { background: '#111827', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 14 },
  panelTitle: { margin: '0 0 12px', fontSize: 15, color: '#f8fafc' },
  line: { display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(148,163,184,.12)', fontSize: 13 },
  empty: { color: '#94a3b8', fontSize: 13, lineHeight: 1.7 },
  textarea: { width: '100%', minHeight: 72, resize: 'vertical', background: '#020617', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 6, padding: 10, margin: '6px 0 12px', fontFamily: 'inherit' },
  notice: { fontSize: 12, color: '#93c5fd', background: 'rgba(37,99,235,.10)', border: '1px solid rgba(59,130,246,.24)', borderRadius: 6, padding: 10 },
  error: { color: '#fecaca', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.32)', borderRadius: 8, padding: 12, marginBottom: 12 },
};

export default ContinuityCockpitPage;
