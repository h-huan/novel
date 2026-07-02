/**
 * WritingPage - 写作页面（极简设计版）
 * 左侧章节列表 | 中央编辑器 | 右侧面板（tab切换，一次只显示一个）
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ChapterEditorShell from '../components/chapter/ChapterEditorShell';
import ChapterStatusBadge from '../components/chapter/ChapterStatusBadge';
import AiWritingPanel from '../components/editor/AiWritingPanel';
import DiffPanel from '../components/editor/DiffPanel';
import { useChapterStore } from '../stores/chapterStore';
import { api } from '../lib/api';
import { showNotification } from '../components/common/Notification';
import { useWritingWebSocket } from '../hooks/useWebSocket';

const SIDEBAR_WIDTH = 180;
const PANEL_WIDTH = 420;

type RightPanel = 'ai' | 'diff' | 'workflow' | null;
type WorkflowFocus = 'short' | 'long';
type StateSyncIssue = { chapterId: string; content: string; message: string } | null;
type PendingStateSummary = { chapterId: string; count: number } | null;

const tianlongSteps = ['目标', '诱因', '行动', '阻碍', '误判', '反转', '代价', '钩子'];

const shortWorkflowStages = [
  {
    title: '题材与平台',
    desc: '确认素材、第一人称身份、平台风格、核心异常事件和情绪卖点。',
    tools: ['素材提炼', '平台风格选择', '强钩子题材生成'],
    prompt: '请按短篇阶段一执行：先确认素材和平台风格，再生成3到5个第一人称短篇题材。每个题材包含标题、一句话钩子、主角身份、发生地点、异常事件、核心冲突、情绪卖点、主要反转、适合平台和爆点判断。',
  },
  {
    title: '结构大纲',
    desc: '把题材拆成开篇钩子、递进反转、人物关系、伏笔回收和尾声余味。',
    tools: ['人物关系表', '递进反转表', '伏笔回收表'],
    prompt: '请按短篇阶段二执行：基于当前题材生成完整第一人称故事大纲，包含故事核心设定、人物关系表、章节结构、递进反转表和伏笔回收表。每章必须有冲突、信息增量和结尾钩子。',
  },
  {
    title: '天龙8步正文',
    desc: '每章必须自然包含目标、诱因、行动、阻碍、误判、反转、代价、钩子。',
    tools: ['章节正文生成', '主动性检查', '结尾钩子检查'],
    prompt: '请按短篇阶段三执行：根据当前章节设定，用天龙8步法写正文。不要写小标题，直接进入事件，多写动作、对话和现场细节，每300字左右出现新的疑点、冲突或信息变化，结尾必须留下强钩子。',
  },
];

const shortOptimizationTools = [
  { name: '开头强化', desc: '生成多种第一人称强钩子开头，解决开篇弱、进入慢。' },
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
    title: 'RAG状态驱动生成',
    desc: '每日写作前自动读取大纲、角色、世界观、组织、时间线、伏笔和前文摘要。',
    chips: ['RAG上下文', '状态快照', '一致性约束', '前文摘要'],
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
  const chapterIdFromUrl = searchParams.get('chapter');

  const { chapters, currentChapter, fetchChapters, selectChapter, lockChapter, unlockChapter, createChapter, updateChapter, setCurrentChapterContent } = useChapterStore();

  // WebSocket 实时通知
  const { connected: wsConnected, notifications: wsNotifications, clearNotifications: clearWsNotifications } = useWritingWebSocket(projectId);
  const [showWsNotification, setShowWsNotification] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [workflowFocus, setWorkflowFocus] = useState<WorkflowFocus>('long');
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [stateSyncIssue, setStateSyncIssue] = useState<StateSyncIssue>(null);
  const [pendingStateSummary, setPendingStateSummary] = useState<PendingStateSummary>(null);
  const [writingMode, setWritingMode] = useState<'manual' | 'semi_auto' | 'full_auto'>('semi_auto');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormVol, setCreateFormVol] = useState(1);
  const [createTitle, setCreateTitle] = useState('');
  const [aiGeneratingTitle, setAiGeneratingTitle] = useState(false);

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
    if (projectId) fetchChapters(projectId);
  }, [projectId, fetchChapters]);

  useEffect(() => {
    if (chapterIdFromUrl && chapters.length > 0 && projectId) selectChapter(projectId, chapterIdFromUrl);
  }, [chapterIdFromUrl, chapters, selectChapter, projectId]);

  const togglePanel = useCallback((panel: RightPanel) => {
    setRightPanel(prev => prev === panel ? null : panel);
  }, []);

  const openCreateForm = (volIdx?: number) => {
    const vol = volIdx ?? 1;
    const volChs = chapters.filter(c => c.volumeIndex === vol);
    const maxIdx = volChs.length > 0 ? Math.max(...volChs.map(c => c.chapterIndex)) : 0;
    setCreateFormVol(vol);
    setCreateTitle(`第${maxIdx + 1}章`);
    setShowCreateForm(true);
  };

  const handleCreateChapter = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectId || !createTitle.trim()) return;
    const volChs = chapters.filter(c => c.volumeIndex === createFormVol);
    const maxIdx = volChs.length > 0 ? Math.max(...volChs.map(c => c.chapterIndex)) : 0;
    await createChapter({ projectId, outlineId: '', volumeIndex: createFormVol, chapterIndex: maxIdx + 1, title: createTitle.trim() });
    setShowCreateForm(false);
    setCreateTitle('');
  };

  const handleAiTitle = async () => {
    if (!projectId) return;
    setAiGeneratingTitle(true);
    try {
      const res = await api.post('/chain/generate-title', { projectId, count: 3 });
      const data = res.data as any;
      const title = data.titles?.[0] || data.title || `第${chapters.length + 1}章`;
      setCreateTitle(title);
    } catch {
      showNotification('error', 'AI标题生成失败');
    } finally {
      setAiGeneratingTitle(false);
    }
  };

  const handleAddVolume = async () => {
    if (!projectId) return;
    const maxVol = chapters.length > 0 ? Math.max(...chapters.map(c => c.volumeIndex)) : 0;
    openCreateForm(maxVol + 1);
  };

  const startEditTitle = (ch: typeof chapters[0]) => {
    setEditingTitleId(ch.id);
    setEditTitleText(ch.title);
  };

  const saveEditTitle = async () => {
    if (!editingTitleId || !editTitleText.trim()) {
      setEditingTitleId(null);
      return;
    }
    await updateChapter(editingTitleId, { title: editTitleText.trim() });
    setEditingTitleId(null);
  };

  const syncDraftAndPendingState = useCallback(async (content: string) => {
    if (!projectId || !currentChapter?.id) {
      setGenStatus('✅ 生成完成');
      setTimeout(() => setGenStatus(null), 3000);
      return;
    }

    setGenStatus('🔄 初稿保存中...');
    // 步骤1：保存章节内容（关键步骤，带重试）
    let saved = false;
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      try {
        await api.put(`/projects/${projectId}/chapters/${currentChapter.id}`, { content });
        setCurrentChapterContent(content);
        saved = true;
      } catch (e) {
        if (attempt === 2) {
          setGenStatus('❌ 章节保存失败，请手动保存！');
          setTimeout(() => setGenStatus(null), 8000);
          return; // 保存失败则不继续后续步骤
        }
        // 等待1秒后重试
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // 步骤2和3：并行执行，失败不影响主流程
    setGenStatus('🔄 状态同步中...');
    const syncResults = await Promise.allSettled([
      api.post('/projects/' + projectId + '/state/extract', {
        chapterIds: [currentChapter.id],
        stateTypes: ['character', 'foreshadowing', 'plot'],
        force: true,
      }),
      api.post('/chain/post-write-archive', {
        projectId,
        chapterId: currentChapter.id,
        chapterContent: content,
      }),
    ]);

    const extractResult = syncResults[0];
    const archiveResult = syncResults[1];
    const extractData = extractResult.status === 'fulfilled'
      ? (((extractResult as PromiseFulfilledResult<any>).value as any).data || (extractResult as PromiseFulfilledResult<any>).value || {})
      : {};
    const archiveData = archiveResult.status === 'fulfilled'
      ? (((archiveResult as PromiseFulfilledResult<any>).value as any).data || (archiveResult as PromiseFulfilledResult<any>).value || {})
      : {};
    const extractOk = extractResult.status === 'fulfilled' && (extractData as any)?.success !== false;
    const archiveOk = archiveResult.status === 'fulfilled' && (archiveData as any)?.success !== false;
    const extractedCount = extractOk ? ((extractData as any)?.extractedStates?.length || 0) : 0;
    const archiveCount = archiveOk ? ((archiveData as any)?.confirmations?.length || 0) : 0;

    if (!extractOk || !archiveOk) {
      const failedParts = [
        !extractOk ? '角色/伏笔/剧情抽取失败' : '',
        !archiveOk ? '章节归档分析失败' : '',
      ].filter(Boolean).join('，');
      console.warn('状态同步未完成', syncResults);
      setStateSyncIssue({ chapterId: currentChapter.id, content, message: failedParts || '状态同步失败' });
      setPendingStateSummary(null);
      setGenStatus('⚠️ 正文已保存，但' + (failedParts || '状态同步失败') + '，请重试');
      setTimeout(() => setGenStatus(null), 9000);
      return;
    }

    setStateSyncIssue(null);
    setPendingStateSummary({ chapterId: currentChapter.id, count: extractedCount + archiveCount });
    setGenStatus('✅ 初稿已保存，生成 ' + (extractedCount + archiveCount) + ' 条待确认状态建议');
    setTimeout(() => setGenStatus(null), 5500);
  }, [projectId, currentChapter?.id, setCurrentChapterContent]);

  const handleGenerateComplete = useCallback((content: string) => {
    void syncDraftAndPendingState(content);
  }, [syncDraftAndPendingState]);

  const retryStateSync = useCallback(() => {
    if (!stateSyncIssue || stateSyncIssue.chapterId !== currentChapter?.id) return;
    void syncDraftAndPendingState(stateSyncIssue.content);
  }, [stateSyncIssue, currentChapter?.id, syncDraftAndPendingState]);

  const applyWorkflowPrompt = useCallback((text: string) => {
    setRightPanel('ai');
    setGenStatus('✅ 已填入流程提示');
    setTimeout(() => setGenStatus(null), 2500);
    const event = new CustomEvent('novel-ai-workflow-prompt', { detail: text });
    window.dispatchEvent(event);
  }, []);

  const loadWritingContext = useCallback(async () => {
    try {
      await api.post('/chain/writing-context', { projectId, chapterNumber: currentChapter?.chapterIndex });
      setGenStatus('✅ 已构建RAG写作上下文');
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

  // M4: 章节拆分提示 + 段落长度检测
  const [chapterWarnings, setChapterWarnings] = useState<string[]>([]);
  const warningFlagRef = useRef({ over5000: false, longParagraph: false });

  useEffect(() => {
    const content = currentChapter?.content || '';
    const warnings: string[] = [];

    if (content.length > 5000) {
      warnings.push('章节超过5000字，建议拆分');
      if (!warningFlagRef.current.over5000) {
        showNotification('warning', '章节超过5000字，建议拆分', 5000);
        warningFlagRef.current.over5000 = true;
      }
    } else {
      warningFlagRef.current.over5000 = false;
    }

    const paragraphs = content.split('\n').filter(p => p.trim().length > 0);
    let foundLong = false;
    for (const p of paragraphs) {
      if (p.length > 300) {
        warnings.push('段落过长，建议拆分');
        if (!warningFlagRef.current.longParagraph) {
          showNotification('warning', `检测到${p.length}字的段落，建议拆分`, 5000);
          warningFlagRef.current.longParagraph = true;
        }
        foundLong = true;
        break;
      }
    }
    if (!foundLong) warningFlagRef.current.longParagraph = false;

    setChapterWarnings(warnings);
  }, [currentChapter?.content]);

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
            <button onClick={() => openCreateForm()} title="当前卷添加章节"
              style={{ padding: '2px 8px', backgroundColor: 'rgba(233,69,96,0.1)', border: 'none', borderRadius: '4px', color: '#e94560', fontSize: '14px', fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+章</button>
            <button onClick={handleAddVolume} title="添加新分卷"
              style={{ padding: '2px 8px', backgroundColor: 'rgba(46,204,113,0.1)', border: 'none', borderRadius: '4px', color: '#2ecc71', fontSize: '14px', fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+卷</button>
            <button onClick={() => setSidebarOpen(false)} style={{ padding: '2px 4px', background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer', fontSize: '12px' }}>◀</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '6px' }}>
          {Object.entries(volumes).sort(([a],[b]) => Number(a)-Number(b)).map(([volIdx, volChapters]) => (
            <div key={volIdx} style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px 2px' }}>
                <span style={{ fontSize: '11px', color: '#8a8aa0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>📖 卷{volIdx}</span>
                <button onClick={() => openCreateForm(Number(volIdx))} title="此卷添加章节"
                  style={{ padding: '0 6px', fontSize: '13px', background: 'none', border: 'none', color: '#6c6c80', cursor: 'pointer' }}>+</button>
              </div>
              {volChapters.sort((a, b) => a.chapterIndex - b.chapterIndex).map(ch => (
                <div key={ch.id} style={{ position: 'relative' }}>
                  {editingTitleId === ch.id ? (
                    <input
                      autoFocus
                      value={editTitleText}
                      onChange={e => setEditTitleText(e.target.value)}
                      onBlur={saveEditTitle}
                      onKeyDown={e => { if (e.key === 'Enter') saveEditTitle(); if (e.key === 'Escape') setEditingTitleId(null); }}
                      style={{
                        width: '100%', padding: '5px 8px', marginBottom: '2px', borderRadius: '4px',
                        border: '1px solid #e94560', backgroundColor: 'rgba(233,69,96,0.05)',
                        color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <button onDoubleClick={() => startEditTitle(ch)} onClick={() => projectId && selectChapter(projectId, ch.id)}
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
                  )}
                </div>
              ))}
            </div>
          ))}
          {chapters.length === 0 && !showCreateForm && <p style={{ textAlign: 'center', color: '#5a5a70', fontSize: '12px', padding: '20px' }}>暂无章节</p>}
          {/* 内联创建表单 */}
          {showCreateForm && (
            <form onSubmit={handleCreateChapter} style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '10px', color: '#6c6c80', marginBottom: '4px' }}>创建章节 · 卷{createFormVol}</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input autoFocus value={createTitle} onChange={e => setCreateTitle(e.target.value)}
                  placeholder="章节标题" style={{
                    flex: 1, padding: '6px 8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(233,69,96,0.2)',
                    borderRadius: '4px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', outline: 'none',
                  }} />
                <button type="button" onClick={handleAiTitle} disabled={aiGeneratingTitle}
                  title="AI生成标题" style={{
                    padding: '6px 8px', backgroundColor: 'rgba(233,69,96,0.08)', border: '1px solid rgba(233,69,96,0.2)',
                    borderRadius: '4px', color: '#e94560', fontSize: '11px', fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>{aiGeneratingTitle ? '⏳' : '🤖 AI'}</button>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" style={{
                  flex: 1, padding: '6px', backgroundColor: '#e94560', border: 'none', borderRadius: '4px',
                  color: '#fff', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                }}>创建</button>
                <button type="button" onClick={() => setShowCreateForm(false)} style={{
                  padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px', color: '#6c6c80', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
                }}>取消</button>
              </div>
            </form>
          )}
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
              {chapterWarnings.includes('章节超过5000字，建议拆分') && (
                <span style={{ fontSize: '10px', color: '#f39c12', backgroundColor: 'rgba(243,156,18,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                  ⚠ 章节建议拆分
                </span>
              )}
              {chapterWarnings.includes('段落过长，建议拆分') && (
                <span style={{ fontSize: '10px', color: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                  ⚠ 段落过长
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
          <ChapterEditorShell
            chapter={currentChapter}
            projectId={projectId || ''}
            onLock={async id => { await lockChapter(projectId!, id); }}
            onUnlock={async id => { await unlockChapter(projectId!, id); }}
            onGenerateNext={() => togglePanel('ai')}
            onAiWrite={() => togglePanel('ai')}
          />
        </div>

        {/* 状态栏 */}
        {genStatus && (
          <div style={{
            padding: '6px 14px', fontSize: '12px', textAlign: 'center',
            backgroundColor: genStatus.startsWith('✅') ? 'rgba(46,204,113,0.08)' : genStatus.startsWith('🔄') ? 'rgba(52,152,219,0.08)' : 'rgba(0,0,0,0.2)',
            color: genStatus.startsWith('✅') ? '#2ecc71' : genStatus.startsWith('🔄') ? '#3498db' : '#c0c0d0',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>{genStatus}</div>
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
                    onGenerateStart={() => setGenStatus('🔄 AI生成中...')}
                    onGenerateComplete={handleGenerateComplete}
                    onError={err => { setGenStatus(`❌ ${err}`); setTimeout(() => setGenStatus(null), 5000); }}
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
                          flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid',
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
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#eaeaea' }}>AI正文状态同步矩阵</div>
                          <span style={confirmBadgeStyle}>带确稿</span>
                        </div>
                        <div style={{ color: '#8a8aa0', fontSize: '11px', lineHeight: 1.55, marginBottom: '10px' }}>
                          AI生成正文后，只生成“待确稿状态建议”。作者确认后，才允许写入世界观、角色、组织、时间线、大纲和伏笔，并进入后续RAG上下文。
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
                                <span style={confirmBadgeStyle}>带确稿</span>
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
                          <button onClick={loadWritingContext} style={workflowActionStyle('#3498db')}>动笔前 · 只读取已确稿RAG和大纲</button>
                          <button onClick={() => setRightPanel('ai')} style={workflowActionStyle('#e94560')}>生成初稿 · 同步生成待确稿状态建议</button>
                          <button onClick={archiveConfirmedDraft} style={workflowActionStyle('#2ecc71')}>作者确稿 · 回写正文与统一状态</button>
                          <button onClick={() => navigate(`/project/${projectId}/weekly-summary`)} style={workflowActionStyle('#f39c12')}>周复盘 · 连贯性和下周计划</button>
                        </div>
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

