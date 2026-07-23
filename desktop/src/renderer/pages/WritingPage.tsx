/**
 * WritingPage - 写作页面（极简设计版）
 * 左侧章节列表 | 中央编辑器 | 右侧面板（tab切换，一次只显示一个）
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ChapterEditorShell from '../components/chapter/ChapterEditorShell';
import ChapterStatusBadge from '../components/chapter/ChapterStatusBadge';
import AiWritingPanel, { type GenerationNotice } from '../components/editor/AiWritingPanel';
import DiffPanel from '../components/editor/DiffPanel';
import { useChapterStore } from '../stores/chapterStore';
import { useProjectStore } from '../stores/projectStore';
import { api } from '../lib/api';
import { showNotification } from '../components/common/Notification';
import { useWritingWebSocket } from '../hooks/useWebSocket';
import WritingQualityContextBanner from '../components/quality/WritingQualityContextBanner';

const SIDEBAR_WIDTH = 180;
const PANEL_WIDTH = 420;

type RightPanel = 'ai' | 'diff' | 'workflow' | null;
type WorkflowFocus = 'short' | 'long';
type StateSyncIssue = { chapterId: string; content: string; message: string } | null;
type PendingStateSummary = { chapterId: string; count: number } | null;
type WritingPackage = {
  state?: { contextText?: string; pendingTotal?: number; stateGuard?: string };
  chapterPlan?: { context?: { chapterTitle?: string; chapterOutline?: string } };
  canonicalContext?: { characters?: string; world?: string; locations?: string };
};

const tianlongSteps = ['目标', '诱因', '行动', '阻碍', '误判', '反转', '代价', '钩子'];

function displayedChapterHeadingMismatch(content: string | undefined, expectedIndex: number | undefined): string | null {
  if (!content || !expectedIndex) return null;
  const match = content.match(/^\s{0,3}#{1,6}\s*第\s*([一二三四五六七八九十\d]+)\s*章/m);
  if (!match) return null;
  const chinese: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const declared = /^\d+$/.test(match[1]) ? Number(match[1]) : chinese[match[1]];
  return declared && declared !== expectedIndex ? `正文开头写的是“第${match[1]}章”，但它当前归属第${expectedIndex}章。该旧内容未被自动改写；请核对大纲和修改记录后再手动修订或恢复。` : null;
}

const shortWorkflowStages = [
  {
    title: '题材与平台',
    desc: '确认素材、项目配置的叙事视角、平台风格、核心异常事件和情绪卖点。',
    tools: ['素材提炼', '平台风格选择', '强钩子题材生成'],
    prompt: '请按短篇阶段一执行：严格读取当前项目已有配置和已确认素材，再按素材实际差异生成足够作者比较的题材候选，不得固定候选数量或擅自添加用户未配置的限制。每个题材包含标题、钩子、主角身份、发生地点、异常事件、核心冲突、情绪卖点、主要反转、适合平台和爆点判断。',
  },
  {
    title: '结构大纲',
    desc: '把题材拆成开篇钩子、递进反转、人物关系、伏笔回收和尾声余味。',
    tools: ['人物关系表', '递进反转表', '伏笔回收表'],
    prompt: '请按短篇阶段二执行：严格使用当前项目配置的叙事视角和目标字数，生成完整闭环故事卡与场景序列，包含核心冲突、主角欲望、人物关系、关键转折与揭示、结局闭环和伏笔回收；章节与场景数量由故事实际需要决定。',
  },
  {
    title: '天龙8步正文',
    desc: '每章必须自然包含目标、诱因、行动、阻碍、误判、反转、代价、钩子。',
    tools: ['章节正文生成', '主动性检查', '结尾钩子检查'],
    prompt: '请按短篇阶段三执行：读取当前章节写作包和项目配置，用天龙8步法自然写入正文。节奏、信息变化密度、是否使用小标题及结尾方式必须服从项目配置与本章功能，不得套用固定字数间隔。',
  },
];

const shortOptimizationTools = [
  { name: '开头强化', desc: '按项目叙事视角和平台配置生成开头候选，解决开篇弱、进入慢。' },
  { name: '反转强化', desc: '审查反转力度，替换廉价反转，保持人物动机合理。' },
  { name: '平台改写', desc: '按知乎盐选、番茄短篇、起点脑洞、抖音故事等重调节奏。' },
  { name: '标题简介', desc: '生成标题、简介、短视频口播开头，服务发布转化。' },
  { name: '终稿质检', desc: '从钩子、代入感、悬念、反转、伏笔、完读率审查全文。' },
];

const longWorkflowStages = [
  {
    title: '世界观与时代底盘',
    desc: '先锁定历史节点、科技边界、工业能力、地缘格局和不可破坏规则。',
    chips: ['世界观', '时间线', '地理/势力', '技术树'],
  },
  {
    title: '角色与组织网络',
    desc: '记录主角成长、关键配角职能、派系利益、组织演化和关系变化。',
    chips: ['角色弧光', '组织', '阵营', '人物状态'],
  },
  {
    title: '分卷大纲与章节计划',
    desc: '从总纲拆分分卷、单元、章节功能，明确每章爽点、冲突和伏笔。',
    chips: ['分卷主线', '章节功能', '伏笔计划', '爽点密度'],
  },
  {
    title: '按全书最新资料续写',
    desc: '每日写作前自动读取大纲、角色、世界观、组织、时间线、伏笔和前文摘要。',
    chips: ['已确认设定', '人物现状', '时间顺序', '前文摘要'],
  },
  {
    title: '作者确稿关口',
    desc: 'AI可自动生成初稿，但必须经过作者确认后才进入正式正文、状态归档和后续引用。',
    chips: ['手动修改', '确稿', '回写归档', '版本记录'],
  },
  {
    title: '周复盘与连贯性检查',
    desc: '按周检查进度、人物一致性、时间线、伏笔回收、读者反馈和下周计划。',
    chips: ['每周总结', '连贯性', '读者反馈', '下周计划'],
  },
];

const longPainPoints = [
  '历史穿越长篇容易被工业、军事、外交多线拉散，需要分卷主线和章节功能锁定。',
  '人物、组织、时间线和技术树会持续变化，必须以状态快照约束AI生成。',
  '手工写作最费时的是反复翻大纲、核对伏笔、确认角色立场，平台应自动调取上下文。',
  'AI不能直接替作者定稿，所有正文和状态回写都需要作者确稿，避免错误设定污染后文。',
];

const confirmedStateTargets = [
  {
    label: '世界观',
    route: 'world',
    color: '#3498db',
    desc: '时代规则、技术边界、地理格局、历史约束',
  },
  {
    label: '角色',
    route: 'characters',
    color: '#2ecc71',
    desc: '人物立场、能力变化、心理状态、关系变化',
  },
  {
    label: '组织',
    route: 'world',
    color: '#f39c12',
    desc: '派系结构、权力变化、组织目标、资源调配',
  },
  {
    label: '时间线/状态',
    route: 'state',
    color: '#9b59b6',
    desc: '章节事件、状态快照、时间顺序、一致性检查',
  },
  {
    label: '大纲',
    route: 'outline',
    color: '#e94560',
    desc: '分卷主线、章节功能、冲突推进、下章计划',
  },
  {
    label: '伏笔',
    route: 'foreshadowing',
    color: '#1abc9c',
    desc: '埋设、激活、回收、悬空风险、关联角色',
  },
];

const workflowButtonStyle = (color: string): React.CSSProperties => ({
  padding: '8px 10px',
  borderRadius: '7px',
  border: `1px solid ${color}35`,
  backgroundColor: `${color}12`,
  color,
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
});

const workflowActionStyle = (color: string): React.CSSProperties => ({
  padding: '8px 10px',
  borderRadius: '7px',
  border: `1px solid ${color}35`,
  backgroundColor: `${color}10`,
  color,
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
});

const confirmBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 6px',
  borderRadius: '999px',
  backgroundColor: 'rgba(46,204,113,0.12)',
  border: '1px solid rgba(46,204,113,0.22)',
  color: '#7de8a3',
  fontSize: '10px',
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const WritingPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chapterIdFromUrl = searchParams.get('chapter') || searchParams.get('chapterId');

  const { chapters, currentChapter, fetchChapters, selectChapter, lockChapter, directLockChapter, unlockChapter, rejectReview, setCurrentChapterContent } = useChapterStore();
  const currentProject = useProjectStore(state => state.currentProject);

  // WebSocket 实时通知
  const { connected: wsConnected, notifications: wsNotifications, clearNotifications: clearWsNotifications } = useWritingWebSocket(projectId);
  const [showWsNotification, setShowWsNotification] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [workflowFocus, setWorkflowFocus] = useState<WorkflowFocus>('long');
  const [genStatus, setGenStatus] = useState<string | null>(null);
  // This belongs to the writing page, not the dismissible AI drawer. Closing the
  // drawer therefore never hides, cancels, or strands an active generation.
  const [generationTask, setGenerationTask] = useState<GenerationNotice | null>(null);
  const [stateSyncIssue, setStateSyncIssue] = useState<StateSyncIssue>(null);
  const [pendingStateSummary, setPendingStateSummary] = useState<PendingStateSummary>(null);
  const [writingPackage, setWritingPackage] = useState<WritingPackage | null>(null);
  const [writingMode, setWritingMode] = useState<'manual' | 'semi_auto' | 'full_auto'>('full_auto');

  const volumes = chapters.reduce<Record<number, typeof chapters>>((acc, ch) => {
    if (!acc[ch.volumeIndex]) acc[ch.volumeIndex] = [];
    acc[ch.volumeIndex].push(ch);
    return acc;
  }, {});

  // F1/F2/F3 切换写作模式（在 Monaco 或输入框内不拦截）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      const isMonaco = target.closest('.monaco-editor') !== null;
      if (isInput || isMonaco) return;

      if (e.key === 'F1') { e.preventDefault(); setWritingMode('full_auto'); setGenStatus('🔄 全自动模式'); setTimeout(() => setGenStatus(null), 1500); }
      if (e.key === 'F2') { e.preventDefault(); setWritingMode('semi_auto'); setGenStatus('🔄 半自动模式'); setTimeout(() => setGenStatus(null), 1500); }
      if (e.key === 'F3') { e.preventDefault(); setWritingMode('manual'); setGenStatus('🔄 手动模式'); setTimeout(() => setGenStatus(null), 1500); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      try {
        const repaired = await api.post(`/projects/${projectId}/outlines/ensure-writable-chapters`, {});
        const created = Number(((repaired as any).data ?? repaired)?.created || 0);
        await fetchChapters(projectId, true);
        if (created > 0) {
          setGenStatus(`✅ 已根据详细大纲自动建立 ${created} 个可写章节`);
          setTimeout(() => setGenStatus(null), 3500);
        }
      } catch (error: any) {
        setGenStatus(`❌ 无法根据详细大纲建立可写章节：${error?.message || '请检查大纲完整性'}`);
      }
    })();
  }, [projectId, fetchChapters]);

  useEffect(() => {
    if (!projectId || chapters.length === 0) return;
    if (!currentChapter || !chapters.some(chapter => chapter.id === currentChapter.id)) {
      const initial = chapters.find(chapter => chapter.status !== 'locked') || chapters[0];
      void selectChapter(projectId, initial.id);
    }
  }, [projectId, chapters, currentChapter?.id, selectChapter]);

  useEffect(() => {
    if (chapterIdFromUrl && chapters.length > 0 && projectId) selectChapter(projectId, chapterIdFromUrl);
  }, [chapterIdFromUrl, chapters, selectChapter, projectId]);

  const togglePanel = useCallback((panel: RightPanel) => {
    setRightPanel(prev => prev === panel ? null : panel);
  }, []);

  const syncDraftAndPendingState = useCallback(async (content: string, targetChapterId: string) => {
    if (!projectId || !targetChapterId) {
      setGenerationTask({ tone: 'success', text: '正文已生成' });
      setGenStatus('✅ 生成完成');
      setTimeout(() => setGenStatus(null), 3000);
      return;
    }

    setGenerationTask({ tone: 'working', text: '正文已生成，正在保存初稿…' });
    setGenStatus('🔄 初稿保存中...');
    // 步骤1：保存章节内容（关键步骤，带重试）
    let saved = false;
    let saveResult: any = null;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        const response = await api.put(`/projects/${projectId}/chapters/${targetChapterId}`, { content });
        saveResult = (response as any).data ?? response;
        // Never replace the visible editor after the author has selected another
        // chapter while this background generation was running.
        if (currentChapter?.id === targetChapterId) setCurrentChapterContent(content);
        saved = true;
      } catch (e) {
        if (attempt === 2) {
          setGenerationTask({ tone: 'error', text: '正文生成完成，但保存失败；原内容未被覆盖。请检查服务后重试。' });
          setGenStatus('❌ 章节保存失败，请手动保存！');
          setTimeout(() => setGenStatus(null), 8000);
          return; // 保存失败则不继续后续步骤
        }
        // 等待1秒后重试
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // The chapter save already runs the canonical derived-data pipeline. Calling
    // the legacy state-extract and post-write-archive endpoints again races that
    // pipeline and can turn a successful save into a misleading failure notice.
    const derivedSync = saveResult?.derivedSync as any;
    const stateCandidates = saveResult?.stateSync?.stateCandidates;
    const fullSyncOk = derivedSync?.fullSyncSuccess === true;
    const warnings = [
      ...(Array.isArray(derivedSync?.warnings) ? derivedSync.warnings : []),
      ...(derivedSync?.warning ? [derivedSync.warning] : []),
    ].filter((item, index, all) => typeof item === 'string' && item.trim() && all.indexOf(item) === index) as string[];
    const incompleteSteps = Object.entries(derivedSync?.steps || {})
      .filter(([, step]: [string, any]) => step?.status && step.status !== 'completed')
      .map(([name, step]: [string, any]) => `${name}: ${step.detail || step.status}`);

    if (!fullSyncOk) {
      const reason = [...warnings, ...incompleteSteps].join('；') || '服务端未返回完整同步结果';
      setStateSyncIssue({ chapterId: targetChapterId, content, message: reason });
      setPendingStateSummary(null);
      setGenerationTask({ tone: 'error', text: `正文已保存，但规范同步未完成：${reason}` });
      setGenStatus('⚠️ 正文已保存，但规范同步未完成；请重试同步');
      return;
    }

    setStateSyncIssue(null);
    const candidateCount = Array.isArray(stateCandidates?.created) ? stateCandidates.created.length : 0;
    setPendingStateSummary({ chapterId: targetChapterId, count: candidateCount });
    setGenerationTask({ tone: 'success', text: '正文、摘要、RAG、伏笔、时间线与连续性状态已同步。' });
    setGenStatus('✅ 初稿已保存并完成规范同步');
    setTimeout(() => setGenStatus(null), 5500);
  }, [projectId, currentChapter?.id, setCurrentChapterContent]);

  const handleGenerateComplete = useCallback((content: string, targetChapterId: string) => {
    if (!content.trim()) {
      setGenerationTask({ tone: 'error', text: '生成未返回正文，当前内容未变更。' });
      setGenStatus('❌ 生成未返回正文，当前内容未变更');
      setTimeout(() => setGenStatus(null), 8000);
      return;
    }
    // Render the generated prose immediately. The async persistence path below is
    // still authoritative and reports any failure instead of silently losing it.
    if (currentChapter?.id === targetChapterId) setCurrentChapterContent(content);
    setGenerationTask({ tone: 'working', text: '正文已生成，正在保存与同步…' });
    setGenStatus('🔄 正文已生成，正在保存与同步…');
    void syncDraftAndPendingState(content, targetChapterId);
  }, [syncDraftAndPendingState, setCurrentChapterContent, currentChapter?.id]);

  const retryStateSync = useCallback(() => {
    if (!stateSyncIssue || stateSyncIssue.chapterId !== currentChapter?.id) return;
    void (async () => {
      setGenerationTask({ tone: 'working', text: '正在重试摘要、RAG、伏笔、时间线与连续性同步…' });
      try {
        const response = await api.post(`/projects/${projectId}/chapters/${stateSyncIssue.chapterId}/resync-derived-data`, {});
        const result = (response as any).data ?? response;
        const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : [];
        const completed = result?.fullSyncSuccess === true;
        if (!completed) {
          const detail = warnings.join('；') || '服务端未完成规范同步';
          setStateSyncIssue(issue => issue ? { ...issue, message: detail } : issue);
          setGenerationTask({ tone: 'error', text: `规范同步仍未完成：${detail}` });
          return;
        }
        setStateSyncIssue(null);
        setGenerationTask({ tone: 'success', text: '规范同步已完成。' });
        setGenStatus('✅ 规范同步已完成');
      } catch (error: any) {
        const detail = error?.message || '重试同步请求失败';
        setStateSyncIssue(issue => issue ? { ...issue, message: detail } : issue);
        setGenerationTask({ tone: 'error', text: `规范同步重试失败：${detail}` });
      }
    })();
  }, [stateSyncIssue, currentChapter?.id, projectId]);

  const applyWorkflowPrompt = useCallback((text: string) => {
    setRightPanel('ai');
    setGenStatus('✅ 已填入流程提示');
    setTimeout(() => setGenStatus(null), 2500);
    const event = new CustomEvent('novel-ai-workflow-prompt', { detail: text });
    window.dispatchEvent(event);
  }, []);

  const loadWritingContext = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await api.post('/chain/writing-context/raw', {
        projectId,
        chapterNumber: currentChapter?.chapterIndex,
        volumeNumber: currentChapter?.volumeIndex,
      });
      const data = (response as any).data || response;
      if (data?.success === false) throw new Error(data?.error || 'Writing package unavailable');
      setWritingPackage(data as WritingPackage);
      const pending = Number(data?.state?.pendingTotal || 0);
      setGenStatus(pending > 0 ? `⚠️ 已读取权威上下文；有 ${pending} 条待确认状态` : '✅ 已读取权威写作上下文');
      setTimeout(() => setGenStatus(null), 3000);
    } catch {
      setGenStatus('❌ 上下文构建失败');
      setTimeout(() => setGenStatus(null), 4000);
    }
  }, [projectId, currentChapter?.chapterIndex]);

  const archiveConfirmedDraft = useCallback(async () => {
    if (!currentChapter) return;
    try {
      await api.post('/chain/post-write-archive', {
        projectId,
        chapterId: currentChapter.id,
        chapterContent: currentChapter.content || '',
      });
      await api.post(`/projects/${projectId}/state/extract`, {
        chapterIds: [currentChapter.id],
        stateTypes: ['character', 'foreshadowing', 'plot'],
        force: true,
      });
      setGenStatus('✅ 已确稿并回写状态');
      setTimeout(() => setGenStatus(null), 3000);
    } catch {
      setGenStatus('❌ 确稿归档失败');
      setTimeout(() => setGenStatus(null), 4000);
    }
  }, [projectId, currentChapter]);

  const modeLabel = { manual: '手动', semi_auto: '半自动', full_auto: '全自动' }[writingMode];

  // 每章目标来自该章大纲；项目只规定 3200-4000 的有效范围。
  const [chapterWarnings, setChapterWarnings] = useState<string[]>([]);
  const warningFlagRef = useRef(false);

  useEffect(() => {
    // A project can enter this page before the first writable chapter is
    // selected. That is a loading/empty state, not an invalid outline.
    if (!currentChapter?.id) {
      warningFlagRef.current = false;
      setChapterWarnings([]);
      return;
    }
    const content = currentChapter?.content || '';
    const warnings: string[] = [];
    const chapterTarget = Number(currentChapter?.targetWords || 0);
    if (!Number.isInteger(chapterTarget) || chapterTarget < 3200 || chapterTarget > 4000) {
      warnings.push('本章缺少有效的动态字数目标（必须为3200-4000字），请先完善章节大纲');
      warningFlagRef.current = false;
    } else if (content.length > chapterTarget) {
      const message = `章节已超过本章依据剧情任务确定的${chapterTarget}字目标`;
      warnings.push(message);
      if (!warningFlagRef.current) showNotification('warning', message, 5000);
      warningFlagRef.current = true;
    } else warningFlagRef.current = false;

    setChapterWarnings(warnings);
  }, [currentChapter?.id, currentChapter?.content, currentChapter?.targetWords]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#16213e' }}>
      {/* WebSocket 实时通知栏 */}
      {wsNotifications.length > 0 && (
        <div style={{
          position: 'fixed', top: 8, right: 16, zIndex: 100,
          maxWidth: 360, borderRadius: 8, backgroundColor: 'rgba(26,26,46,0.95)',
          border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          fontSize: 11, overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: wsConnected ? '#2ecc71' : '#e74c3c', fontWeight: 600 }}>
              {wsConnected ? '🟢 实时连接' : '🔴 已断开'}
            </span>
            <button onClick={clearWsNotifications} style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
          <div style={{ maxHeight: 120, overflow: 'auto' }}>
            {wsNotifications.slice(0, 3).map((n, i) => (
              <div key={i} style={{ padding: '4px 10px', color: '#c0c0d0', borderBottom: i < wsNotifications.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                {n.type === 'chapter_progress' ? `📝 章节进度` :
                 n.type === 'chapter_status' ? `📋 状态变更` :
                 n.type === 'content_update' ? `✏️ 内容更新` :
                 n.type === 'conflict_detected' ? `⚠️ 冲突检测` :
                 `📡 ${n.type}`}
                {n.data?.message ? `: ${n.data.message}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 左侧章节列表 */}
      <div style={{
        width: sidebarOpen ? SIDEBAR_WIDTH : 0, minWidth: sidebarOpen ? SIDEBAR_WIDTH : 0,
        borderRight: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#1a1a2e',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.15s',
      }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>分卷 / 章节</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={() => navigate(`/project/${projectId}/outline`)} title="章节与分卷由大纲统一管理"
              style={{ padding: '2px 8px', backgroundColor: 'rgba(52,152,219,0.1)', border: 'none', borderRadius: '4px', color: '#60a5fa', fontSize: '11px', fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>编辑大纲</button>
            <button onClick={() => setSidebarOpen(false)} style={{ padding: '2px 4px', background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '12px' }}>◀</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
          {Object.entries(volumes).sort(([a],[b]) => Number(a)-Number(b)).map(([volIdx, volChapters]) => (
            <div key={volIdx} style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 2px' }}>
                <span style={{ fontSize: '11px', color: '#8a8aa0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📖 卷{volIdx}</span>
              </div>
              {volChapters.sort((a, b) => a.chapterIndex - b.chapterIndex).map(ch => (
                <div key={ch.id} style={{ position: 'relative' }}>
                    <button onClick={() => projectId && selectChapter(projectId, ch.id)}
                      title="章节标题与序号由大纲统一管理"
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px', marginBottom: '2px',
                        borderRadius: '6px', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        backgroundColor: currentChapter?.id === ch.id ? 'rgba(233,69,96,0.12)' : 'transparent',
                        color: currentChapter?.id === ch.id ? '#e94560' : '#c0c0d0',
                      }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        第{ch.chapterIndex}章 {ch.title}
                      </span>
                      <ChapterStatusBadge status={ch.status} size="small" showLockIcon={false} />
                    </button>
                </div>
              ))}
            </div>
          ))}
          {chapters.length === 0 && <p style={{ textAlign: 'center', color: '#5a5a70', fontSize: '12px', padding: '20px' }}>暂无大纲章节，请先在大纲中规划章节</p>}
        </div>
      </div>

      {/* 侧边栏收起按钮（当侧边栏隐藏时显示） */}
      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)}
          style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 10, padding: '6px 4px', backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.06)', borderLeft: 'none', borderRadius: '0 6px 6px 0', color: '#6c6c80', cursor: 'pointer', fontSize: '10px' }}>
          ▶
        </button>
      )}

      {/* 中央：编辑器 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* 顶部工具栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#1a1a2e',
        }}>
          {/* 左侧 */}
          <button onClick={() => setSidebarOpen(p => !p)} style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '12px', padding: '4px' }} title="切换章节列表">☰</button>
          <span style={{ fontSize: '12px', color: '#6c6c80' }}>|</span>
          <span style={{ fontSize: '11px', color: '#8a8aa0' }}>
            模式: <span style={{ color: '#e94560', fontWeight: 600 }}>{modeLabel}</span>
          </span>
          <span style={{ fontSize: '10px', color: '#4a4a60' }}>F1全自动 F2半自动 F3手动</span>

          {/* 章节/段落长度警告 */}
          {chapterWarnings.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
              {chapterWarnings.length > 0 && (
                <span style={{ fontSize: '10px', color: '#f39c12', backgroundColor: 'rgba(243,156,18,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                  ⚠ {chapterWarnings[0]}
                </span>
              )}
            </div>
          )}

          {/* 右侧操作区 */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button onClick={() => togglePanel('ai')}
              style={{ padding: '5px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', backgroundColor: rightPanel === 'ai' ? '#e94560' : 'rgba(255,255,255,0.06)', color: rightPanel === 'ai' ? '#fff' : '#c0c0d0' }}>
              🤖 AI写作
            </button>
            <button onClick={() => togglePanel('diff')}
              style={{ padding: '5px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', backgroundColor: rightPanel === 'diff' ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.06)', color: rightPanel === 'diff' ? '#2ecc71' : '#c0c0d0' }}>
              ✏️ 精修
            </button>
            <button onClick={() => togglePanel('workflow')}
              style={{ padding: '5px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', backgroundColor: rightPanel === 'workflow' ? 'rgba(52,152,219,0.15)' : 'rgba(255,255,255,0.06)', color: rightPanel === 'workflow' ? '#3498db' : '#c0c0d0' }}>
              📊 工作流
            </button>
          </div>
        </div>

        {/* 编辑器主体 */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ padding: '10px 14px 0' }}>
            <WritingQualityContextBanner />
            {displayedChapterHeadingMismatch(currentChapter?.content, currentChapter?.chapterIndex) && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, color: '#ffd891', background: 'rgba(130,83,24,0.25)', border: '1px solid rgba(243,156,18,0.55)', fontSize: 12 }}>
                {displayedChapterHeadingMismatch(currentChapter?.content, currentChapter?.chapterIndex)}
                <button onClick={() => navigate(`/project/${projectId}/versions?chapter=${currentChapter?.id}`)} style={{ marginLeft: 10, border: 0, background: 'transparent', color: '#ffe1a2', textDecoration: 'underline', cursor: 'pointer' }}>查看修改记录</button>
              </div>
            )}
          </div>
          <ChapterEditorShell
            chapter={currentChapter}
            projectId={projectId || ''}
            onLock={async id => { await lockChapter(projectId!, id); }}
            onDirectLock={async id => { await directLockChapter(projectId!, id); }}
            onUnlock={async id => { await unlockChapter(projectId!, id); }}
            onRejectReview={async id => { await rejectReview(projectId!, id); }}
            onGenerateNext={() => {
              if (!projectId || !currentChapter) return;
              const nextChapter = chapters
                .filter(chapter => chapter.status !== 'locked')
                .sort((a, b) => a.volumeIndex - b.volumeIndex || a.chapterIndex - b.chapterIndex)
                .find(chapter => chapter.volumeIndex > currentChapter.volumeIndex
                  || (chapter.volumeIndex === currentChapter.volumeIndex && chapter.chapterIndex > currentChapter.chapterIndex));
              if (!nextChapter) {
                setGenStatus('当前没有可生成的下一章，请先在大纲中建立后续章节');
                setTimeout(() => setGenStatus(null), 4500);
                return;
              }
              void selectChapter(projectId, nextChapter.id);
              setRightPanel('ai');
            }}
            onAiWrite={() => togglePanel('ai')}
          />
        </div>

        {/* 状态栏 */}
        {(generationTask || genStatus) && (
          <div style={{
            padding: '6px 14px', fontSize: '12px', textAlign: 'center',
            backgroundColor: generationTask?.tone === 'success' ? 'rgba(46,204,113,0.08)' : generationTask?.tone === 'error' ? 'rgba(231,76,96,0.12)' : 'rgba(52,152,219,0.08)',
            color: generationTask?.tone === 'success' ? '#2ecc71' : generationTask?.tone === 'error' ? '#ff9aa9' : '#75bfff',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>🤖 写作任务：{generationTask?.text || genStatus}</div>
        )}
        {stateSyncIssue && stateSyncIssue.chapterId === currentChapter?.id && (
          <div style={{
            padding: '8px 14px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            backgroundColor: 'rgba(243,156,18,0.08)',
            color: '#f6c36a',
            borderTop: '1px solid rgba(243,156,18,0.18)',
          }}>
            <span>状态同步未完成：{stateSyncIssue.message}</span>
            <button onClick={retryStateSync} style={{ ...workflowButtonStyle('#f39c12'), padding: '5px 8px' }}>重试状态同步</button>
            <button onClick={() => navigate(`/project/${projectId}/state`)} style={{ ...workflowButtonStyle('#3498db'), padding: '5px 8px' }}>查看待确认</button>
          </div>
        )}
        {!stateSyncIssue && pendingStateSummary && pendingStateSummary.chapterId === currentChapter?.id && pendingStateSummary.count > 0 && (
          <div style={{
            padding: '8px 14px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            backgroundColor: 'rgba(46,204,113,0.07)',
            color: '#8df0b2',
            borderTop: '1px solid rgba(46,204,113,0.16)',
          }}>
            <span>本章有 {pendingStateSummary.count} 条状态建议待作者确认，确认后才会进入后续章节上下文。</span>
            <button onClick={() => navigate(`/project/${projectId}/state`)} style={{ ...workflowButtonStyle('#2ecc71'), padding: '5px 8px' }}>去确认状态</button>
          </div>
        )}
      </div>

      {/* 右侧面板浮层 */}
      {rightPanel && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 1000, display: 'flex', justifyContent: 'flex-end',
        }}>
          {/* 背景遮罩 */}
          <div
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
            }}
            onClick={() => setRightPanel(null)}
          />
          {/* 面板本体 */}
          <div style={{
            position: 'relative', width: PANEL_WIDTH, minWidth: PANEL_WIDTH,
            backgroundColor: '#1a1a2e', borderLeft: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column', height: '100%',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
          }}>
            {/* 面板头部 */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea' }}>
                {rightPanel === 'ai' && '🤖 AI 写作'}
                {rightPanel === 'diff' && '✏️ 逐段精修'}
                {rightPanel === 'workflow' && '📊 写作工作流'}
              </span>
              <button onClick={() => setRightPanel(null)} style={{ background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}>✕</button>
            </div>
            {/* 面板内容 */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {rightPanel === 'ai' && (
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <AiWritingPanel projectId={projectId || ''} chapterId={currentChapter?.id} chapterContent={currentChapter?.content}
                    volumeIndex={currentChapter?.volumeIndex ?? 1} chapterIndex={currentChapter?.chapterIndex ?? 1}
                    chapters={chapters}
                    onChapterChange={(chapterId) => { if (projectId && chapterId) void selectChapter(projectId, chapterId); }}
                    onGenerateStart={() => { setGenerationTask({ tone: 'working', text: '正在开始生成…' }); setGenStatus('🔄 AI生成中...'); }}
                    onGenerateComplete={handleGenerateComplete}
                    generationNotice={generationTask}
                    onGenerationStatus={notice => setGenerationTask(notice)}
                    onError={err => { setGenerationTask({ tone: 'error', text: err }); setGenStatus(`❌ ${err}`); }}
                  />
                </div>
              )}
              {rightPanel === 'diff' && (
                <div style={{ flex: 1, overflow: 'hidden', padding: '12px' }}>
                  <DiffPanel projectId={projectId || ''} chapterId={currentChapter?.id} paragraphText={currentChapter?.content}
                    onComplete={finalText => { setGenStatus('✅ 修改已应用'); setRightPanel(null); setTimeout(() => setGenStatus(null), 3000); }}
                  />
                </div>
              )}
              {rightPanel === 'workflow' && (
                <div style={{ padding: '14px', overflow: 'auto', flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    {(['long', 'short'] as WorkflowFocus[]).map(focus => (
                      <button key={focus} onClick={() => setWorkflowFocus(focus)}
                        style={{
                          flex: 1, padding: '8px 10px', borderRadius: '7px', borderWidth: 1, borderStyle: 'solid',
                          borderColor: workflowFocus === focus ? '#e94560' : 'rgba(255,255,255,0.08)',
                          backgroundColor: workflowFocus === focus ? 'rgba(233,69,96,0.12)' : 'rgba(255,255,255,0.03)',
                          color: workflowFocus === focus ? '#e94560' : '#8a8aa0',
                          fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        {focus === 'long' ? '长篇连载' : '短篇流程'}
                      </button>
                    ))}
                  </div>

                  {workflowFocus === 'short' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(52,152,219,0.08)', border: '1px solid rgba(52,152,219,0.18)' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#cfe8ff', marginBottom: '4px' }}>短篇三阶段 + 阶段优化工具</div>
                        <div style={{ fontSize: '11px', color: '#8a8aa0', lineHeight: 1.6 }}>适合知乎盐选、番茄短篇、抖音故事、规则怪谈等第一人称高钩子短故事。</div>
                      </div>

                      {shortWorkflowStages.map((stage, idx) => (
                        <div key={stage.title} style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'rgba(233,69,96,0.14)', color: '#e94560', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700 }}>{idx + 1}</span>
                            <span style={{ color: '#eaeaea', fontWeight: 700, fontSize: '13px' }}>{stage.title}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#8a8aa0', lineHeight: 1.6, marginBottom: '8px' }}>{stage.desc}</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                            {stage.tools.map(tool => (
                              <span key={tool} style={{ padding: '3px 7px', borderRadius: '5px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#c0c0d0', fontSize: '10px' }}>{tool}</span>
                            ))}
                          </div>
                          <button onClick={() => applyWorkflowPrompt(stage.prompt)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid rgba(233,69,96,0.25)', backgroundColor: 'rgba(233,69,96,0.08)', color: '#e94560', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            填入AI提示
                          </button>
                        </div>
                      ))}

                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(46,204,113,0.06)', border: '1px solid rgba(46,204,113,0.16)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#8df0b2', marginBottom: '8px' }}>阶段优化工具</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                          {shortOptimizationTools.map(tool => (
                            <div key={tool.name} style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.14)' }}>
                              <div style={{ fontSize: '12px', color: '#eaeaea', fontWeight: 700 }}>{tool.name}</div>
                              <div style={{ fontSize: '10px', color: '#8a8aa0', lineHeight: 1.5, marginTop: '2px' }}>{tool.desc}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {workflowFocus === 'long' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(233,69,96,0.08)', border: '1px solid rgba(233,69,96,0.18)' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffd6dd', marginBottom: '4px' }}>长篇连载生产线</div>
                        <div style={{ fontSize: '11px', color: '#8a8aa0', lineHeight: 1.6 }}>AI可自动生成初稿和上下文，但作者必须手动确认后才归档，避免错误设定污染后续章节。</div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#eaeaea' }}>本章写完后的内容变化</div>
                          <span style={confirmBadgeStyle}>需作者确认</span>
                        </div>
                        <div style={{ color: '#8a8aa0', fontSize: '11px', lineHeight: 1.55, marginBottom: '10px' }}>
                          正文完成后，人物、情节、时间和伏笔变化会先列给作者确认；确认后才更新后续写作资料。
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          {confirmedStateTargets.map(target => (
                            <button
                              key={target.label}
                              onClick={() => navigate(`/project/${projectId}/${target.route}`)}
                              style={{ ...workflowButtonStyle(target.color), display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'stretch', textAlign: 'left' }}
                            >
                              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                <span>{target.label}</span>
                                <span style={confirmBadgeStyle}>需确认</span>
                              </span>
                              <span style={{ color: '#8a8aa0', fontSize: '10px', fontWeight: 500, lineHeight: 1.35 }}>{target.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {longWorkflowStages.map((stage, idx) => (
                        <div key={stage.title} style={{ display: 'flex', gap: '10px', padding: '11px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: idx === 4 ? 'rgba(46,204,113,0.14)' : 'rgba(233,69,96,0.12)', color: idx === 4 ? '#2ecc71' : '#e94560', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', flexShrink: 0 }}>{idx + 1}</div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#eaeaea', fontWeight: 700, fontSize: '13px' }}>{stage.title}</div>
                            <div style={{ color: '#8a8aa0', fontSize: '11px', lineHeight: 1.55, marginTop: '3px' }}>{stage.desc}</div>
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                              {stage.chips.map(chip => (
                                <span key={chip} style={{ padding: '3px 6px', borderRadius: '5px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#b8b8c8', fontSize: '10px' }}>{chip}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}

                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(52,152,219,0.06)', border: '1px solid rgba(52,152,219,0.16)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#9bd4ff', marginBottom: '8px' }}>每日写作操作</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                          <button onClick={loadWritingContext} style={workflowActionStyle('#3498db')}>动笔前 · 读取最新设定、大纲和前文</button>
                          <button onClick={() => setRightPanel('ai')} style={workflowActionStyle('#e94560')}>生成初稿 · 同步生成待确稿状态建议</button>
                          <button onClick={archiveConfirmedDraft} style={workflowActionStyle('#2ecc71')}>作者确稿 · 回写正文与统一状态</button>
                          <button onClick={() => navigate(`/project/${projectId}/weekly-summary`)} style={workflowActionStyle('#f39c12')}>周复盘 · 连贯性和下周计划</button>
                        </div>
                        {writingPackage && (
                          <div style={{ marginTop: '10px', padding: '9px', borderRadius: '6px', background: 'rgba(52,152,219,0.08)', color: '#b9dfff', fontSize: '11px', lineHeight: 1.55 }}>
                            <div style={{ fontWeight: 800, marginBottom: '4px' }}>已加载权威写作包</div>
                            <div>章节：{writingPackage.chapterPlan?.context?.chapterTitle || '未配置章节大纲'}</div>
                            <div>待确认状态：{writingPackage.state?.pendingTotal || 0}；待确认内容不会作为既定事实写入。</div>
                          </div>
                        )}
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.16)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#eaeaea', marginBottom: '8px' }}>《魂穿北洋，领众破局》类长篇痛点</div>
                        {longPainPoints.map(point => (
                          <div key={point} style={{ display: 'flex', gap: '7px', color: '#8a8aa0', fontSize: '11px', lineHeight: 1.55, marginBottom: '6px' }}>
                            <span style={{ color: '#e94560' }}>•</span>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#eaeaea', marginBottom: '8px' }}>本章天龙8步检查</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                          {tianlongSteps.map(step => (
                            <span key={step} style={{ padding: '6px 4px', textAlign: 'center', borderRadius: '5px', backgroundColor: 'rgba(233,69,96,0.08)', color: '#c0c0d0', fontSize: '10px' }}>{step}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WritingPage;

