/**
 * AiWritingPanel - AI写作控制面板
 *
 * 三标签设计：
 *   [写作] 主写作控制 - 模式切换、Prompt输入、天龙8步进度、生成/续写
 *   [外挂] 外挂功能 - 开头强化、反转分析、平台改写、标题生成
 *   [质检] 质检报告 - 质量检测、AI痕迹评估
 *
 * 后端对接: /api/v1/chain/*
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, streamRequest } from '../../lib/api';
import AuthorNotePanel from './AuthorNotePanel';
import WorkflowBlockedNotice from '../workflow/WorkflowBlockedNotice';
import { useWorkflowGuardStore } from '../../stores/workflowGuardStore';

// ==================== Types ====================

export type WritingMode = 'manual' | 'semi_auto' | 'full_auto';
export type GenerationNotice = { tone: 'working' | 'success' | 'error'; text: string };

/** 章节类型：日常写作 或 高潮章节 */
export type ChapterScenario = 'daily' | 'climax';

type TabType = 'writing' | 'plugins' | 'qa' | 'notes';

type PlatformType = 'zhihu' | 'fanqie' | 'qidian' | 'douyin' | 'rules_horror';

type ChapterTarget = {
  id: string;
  volumeIndex: number;
  chapterIndex: number;
  title: string;
  status?: string;
};

// Closing and reopening the drawer unmounts this component. A generation must
// remain owned by its project/chapter until the request has actually settled.
const activeChapterGenerations = new Set<string>();

function chapterGenerationKey(projectId?: string, chapterId?: string) {
  return projectId && chapterId ? `${projectId}:${chapterId}` : null;
}

function isChapterGenerationActive(projectId?: string, chapterId?: string) {
  const key = chapterGenerationKey(projectId, chapterId);
  return Boolean(key && activeChapterGenerations.has(key));
}

interface AiWritingPanelProps {
  projectId: string;
  chapterId?: string;
  chapterContent?: string;
  volumeIndex?: number;
  chapterIndex?: number;
  chapters?: ChapterTarget[];
  onChapterChange?: (chapterId: string) => void;
  onGenerateStart?: () => void;
  onGenerateComplete?: (content: string, generatedChapterId: string) => void;
  onError?: (error: string) => void;
  generationNotice?: GenerationNotice | null;
  onGenerationStatus?: (notice: GenerationNotice) => void;
}

// ==================== Constants ====================

const TIANLONG_STEPS = [
  { key: 'goal', label: '目标', short: '目标' },
  { key: 'trigger', label: '诱因', short: '诱因' },
  { key: 'action', label: '行动', short: '行动' },
  { key: 'obstacle', label: '阻碍', short: '阻碍' },
  { key: 'misjudge', label: '误判', short: '误判' },
  { key: 'reversal', label: '反转', short: '反转' },
  { key: 'cost', label: '代价', short: '代价' },
  { key: 'hook', label: '钩子', short: '钩子' },
  { key: 'synthesis', label: '正文合成', short: '合成' },
  { key: 'qa', label: '篇幅核验', short: '核验' },
];

const GENERATE_METHOD_LABELS: Record<'tianlong' | 'direct', string> = {
  tianlong: '天龙8步 Chain',
  direct: '直接生成',
};

const GENERATE_METHOD_DESCRIPTIONS: Record<'tianlong' | 'direct', string> = {
  tianlong: '逐节点生成（目标→诱因→行动→...→合成）',
  direct: '单次 LLM 调用，快速生成正文',
};

const MODE_LABELS: Record<WritingMode, string> = {
  manual: '手动',
  semi_auto: '半自动',
  full_auto: '全自动',
};

const MODE_DESCRIPTIONS: Record<WritingMode, string> = {
  manual: '自主创作，AI不干预',
  semi_auto: 'AI建议，用户确认',
  full_auto: 'AI自动生成全文',
};

const PLATFORM_LABELS: Record<PlatformType, string> = {
  zhihu: '知乎盐选',
  fanqie: '番茄短篇',
  qidian: '起点脑洞',
  douyin: '抖音故事',
  rules_horror: '规则怪谈',
};

const ENHANCE_STYLE_LABELS: Record<string, string> = {
  suspense: '悬念强化',
  poetic: '诗意增强',
  direct: '直白有力',
  emotional: '情绪渲染',
};

// ==================== Component ====================

const AiWritingPanel: React.FC<AiWritingPanelProps> = ({
  projectId,
  chapterId,
  chapterContent,
  volumeIndex = 1,
  chapterIndex = 1,
  chapters = [],
  onChapterChange,
  onGenerateStart,
  onGenerateComplete,
  onError,
  generationNotice: externalGenerationNotice,
  onGenerationStatus,
}) => {
  const navigate = useNavigate();

  // ========== 写作 Tab State ==========
  const [activeTab, setActiveTab] = useState<TabType>('writing');
  const [writingMode, setWritingMode] = useState<WritingMode>('full_auto');
  const [generateMethod, setGenerateMethod] = useState<'tianlong' | 'direct'>('tianlong');
  const [chapterScenario, setChapterScenario] = useState<ChapterScenario | null>(null);
  const [isGenerating, setIsGenerating] = useState(() => isChapterGenerationActive(projectId, chapterId));
  const [currentStep, setCurrentStep] = useState(-1);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [blockedNotice, setBlockedNotice] = useState<{
    reason: string;
    missingAssets: string[];
    recommendedNextAction?: string;
  } | null>(null);
  const checkAction = useWorkflowGuardStore((state) => state.checkAction);

  // 获取当前场景对应的后端 scenario key
  const getScenarioKey = useCallback(() => {
    return chapterScenario === 'climax' ? 'writing_climax' : 'writing_daily';
  }, [chapterScenario]);

  // --- 外挂 Tab State ---
  const [pluginLoading, setPluginLoading] = useState<string | null>(null);
  const [pluginResult, setPluginResult] = useState<{ type: string; content: string } | null>(null);

  // --- 质检 Tab State ---
  const [qaResult, setQaResult] = useState<any>(null);
  const [qaLoading, setQaLoading] = useState(false);

  // ========== 写作功能 ==========

  // Generation always uses the progress-reporting endpoint. This is not an author-facing choice.
  const streamMode = true;
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamContent, setStreamContent] = useState('');
  const [generationNotice, setGenerationNotice] = useState<GenerationNotice | null>(externalGenerationNotice || null);
  const publishGenerationNotice = useCallback((notice: GenerationNotice) => {
    setGenerationNotice(notice);
    onGenerationStatus?.(notice);
  }, [onGenerationStatus]);

  useEffect(() => {
    if (externalGenerationNotice) setGenerationNotice(externalGenerationNotice);
  }, [externalGenerationNotice]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (typeof customEvent.detail === 'string') {
        setActiveTab('writing');
        setPrompt(customEvent.detail);
      }
    };
    window.addEventListener('novel-ai-workflow-prompt', handler);
    return () => window.removeEventListener('novel-ai-workflow-prompt', handler);
  }, []);

  useEffect(() => {
    if (!projectId || !chapterId) {
      setChapterScenario(null);
      return;
    }
    void (async () => {
      try {
        const chapterResponse = await api.get(`/projects/${projectId}/chapters/${chapterId}`);
        const chapter = (chapterResponse as any).data ?? chapterResponse;
        if (!chapter?.outlineId) return setChapterScenario(null);
        const outlineResponse = await api.get(`/projects/${projectId}/outlines/${chapter.outlineId}`);
        const outline = (outlineResponse as any).data ?? outlineResponse;
        const signals = [outline?.chapterFunction, outline?.goalArc, outline?.content, JSON.stringify(outline?.scenes || {})].join(' ');
        setChapterScenario(/climax|climactic|showdown|reversal|reveal|高潮|决战|反转|爆发|揭示|收束/i.test(signals) ? 'climax' : 'daily');
      } catch {
        setChapterScenario(null);
      }
    })();
  }, [projectId, chapterId]);

  useEffect(() => {
    // Restore the real request state whenever this drawer is mounted again.
    setIsGenerating(isChapterGenerationActive(projectId, chapterId));
  }, [projectId, chapterId]);

  const handleGenerate = useCallback(async () => {
    if (!projectId || !chapterId || isGenerating || isChapterGenerationActive(projectId, chapterId)) {
      if (isChapterGenerationActive(projectId, chapterId)) setIsGenerating(true);
      return;
    }
    const generationKey = chapterGenerationKey(projectId, chapterId);
    if (!generationKey || activeChapterGenerations.has(generationKey)) {
      setIsGenerating(true);
      return;
    }
    activeChapterGenerations.add(generationKey);
    const finishGeneration = () => {
      activeChapterGenerations.delete(generationKey);
      setIsGenerating(false);
      setCurrentStep(-1);
    };
    setIsGenerating(true);
    publishGenerationNotice({ tone: 'working', text: '正在校验本章大纲与写作条件…' });
    const guard = await checkAction(projectId, 'generate_body');
    if (!guard.allowed) {
      finishGeneration();
      publishGenerationNotice({ tone: 'error', text: guard.reason || '当前条件不允许生成正文' });
      setBlockedNotice({
        reason: guard.reason || '当前阶段不能生成正文',
        missingAssets: guard.missingAssets,
        recommendedNextAction: guard.recommendedNextAction,
      });
      return;
    }
    setBlockedNotice(null);
    setCurrentStep(0);
    setStreamContent('');
    setStreamProgress(0);
    publishGenerationNotice({ tone: 'working', text: '已开始生成，正在等待服务端进度…' });
    onGenerateStart?.();

    if (streamMode) {
      // SSE 流式输出（真实天龙8步进度）— 使用 fetch 流解析（POST 模式）
      try {
        const body: Record<string, unknown> = { projectId, chapterId, chapterNumber: chapterIndex, mode: writingMode, prompt, scenario: getScenarioKey() };
        // Keep every visible chapter-generation action on the single verified
        // path, including its terminal event and hard acceptance gates.
        body.templateId = 'tianlong-8step';
        let receivedTerminalEvent = false;
        void streamRequest(
          '/chain/stream-generate',
          body,
          (data) => {
            if (data.type === 'start') {
              publishGenerationNotice({ tone: 'working', text: String(data.message || '正在生成正文…') });
            } else if (data.type === 'heartbeat') {
              setStreamProgress(Number(data.progress || 0));
              publishGenerationNotice({ tone: 'working', text: String(data.message || '生成仍在执行，连接正常…') });
            } else if (data.type === 'step') {
              // Server node_0 is context assembly; author-facing stages begin at
              // node_1 (目标), and continue through synthesis and verification.
              const authorStage = Math.max(0, Math.min(TIANLONG_STEPS.length - 1, Number(data.step || 1) - 1));
              setCurrentStep(authorStage);
              setStreamProgress((data.progress as number) || 0);
              publishGenerationNotice({ tone: 'working', text: `${String(data.label || '正在生成')}（${Number(data.progress || 0)}%）` });
            } else if (data.type === 'quality') {
              const report = (data.report || {}) as Record<string, unknown>;
              const evidence = Array.isArray(report.evidence) ? report.evidence.filter(Boolean).slice(0, 2).join('；') : '';
              publishGenerationNotice({
                tone: 'success',
                text: `正文质检通过：大纲、人物、世界观、时间线与叙事连贯性已验收${evidence ? `。证据：${evidence}` : ''}`,
              });
            } else if (data.type === 'complete') {
              receivedTerminalEvent = true;
              finishGeneration();
              const content = String(data.content || '').trim();
              if (!content) {
                publishGenerationNotice({ tone: 'error', text: '生成结束但未返回可写入的正文，原正文未变更。' });
                onError?.('生成结束但未返回可写入的正文');
                return;
              }
              const report = (data.qualityReport || {}) as Record<string, unknown>;
              const evidence = Array.isArray(report.evidence) ? report.evidence.filter(Boolean).slice(0, 2).join('；') : '';
              publishGenerationNotice({
                tone: 'success',
                text: `正文质检通过（大纲、人物、世界观、时间线、叙事连贯性），正在保存并同步创作资料…${evidence ? ` 证据：${evidence}` : ''}`,
              });
              onGenerateComplete?.(content, chapterId);
            } else if (data.type === 'error') {
              receivedTerminalEvent = true;
              finishGeneration();
              const message = String(data.error || '生成失败');
              publishGenerationNotice({ tone: 'error', text: `生成失败：${message}` });
              onError?.(message);
            } else if (data.progress !== undefined) {
              setStreamProgress(data.progress as number);
              setStreamContent(prev => prev + (data.chunk as string || ''));
            }
          },
          (error) => {
            receivedTerminalEvent = true;
            finishGeneration();
            publishGenerationNotice({ tone: 'error', text: `生成连接失败：${error.message}` });
            onError?.(error.message);
          },
          () => {
            if (!receivedTerminalEvent) {
              const message = '生成连接已结束，但未收到完成结果。原正文未变更。';
              publishGenerationNotice({ tone: 'error', text: message });
              onError?.(message);
            }
            finishGeneration();
          },
        );
      } catch (err: any) {
        finishGeneration();
        const message = err?.message || '生成请求无法启动';
        publishGenerationNotice({ tone: 'error', text: `生成失败：${message}` });
        onError?.(message);
      }
      return;
    }

    try {
      // 调用 Chain API（天龙8步），等待完整结果
      setCurrentStep(0);
      const response = await api.post('/chain/generate', {
        projectId,
        chapterId: chapterId || undefined,
        chapterNumber: chapterIndex || undefined,
        mode: writingMode,
        prompt: prompt || undefined,
        scenario: getScenarioKey(),
      });

      setCurrentStep(-1);
      const data = ((response as any).data ?? response) as any;
      if (data?.success === false || !String(data?.content || '').trim()) {
        throw new Error(data?.error || '生成未返回可写入的正文');
      }
      publishGenerationNotice({ tone: 'success', text: '正文已生成，正在保存并同步创作资料…' });
      onGenerateComplete?.(String(data.content), chapterId);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      publishGenerationNotice({ tone: 'error', text: `生成失败：${message}` });
      onError?.(message);
    } finally {
      finishGeneration();
    }
  }, [projectId, chapterId, writingMode, prompt, isGenerating, generateMethod, getScenarioKey, checkAction, onGenerateStart, onGenerateComplete, onError, publishGenerationNotice]);

  const handleContinue = useCallback(async () => {
    if (!projectId || !chapterId || isGenerating || isChapterGenerationActive(projectId, chapterId)) {
      if (isChapterGenerationActive(projectId, chapterId)) setIsGenerating(true);
      return;
    }
    const generationKey = chapterGenerationKey(projectId, chapterId);
    if (!generationKey || activeChapterGenerations.has(generationKey)) {
      setIsGenerating(true);
      return;
    }
    activeChapterGenerations.add(generationKey);
    const finishGeneration = () => {
      activeChapterGenerations.delete(generationKey);
      setIsGenerating(false);
    };
    setIsGenerating(true);
    publishGenerationNotice({ tone: 'working', text: '正在校验续写条件…' });
    const guard = await checkAction(projectId, 'continue_body');
    if (!guard.allowed) {
      finishGeneration();
      setBlockedNotice({
        reason: guard.reason || '当前阶段不能续写正文',
        missingAssets: guard.missingAssets,
        recommendedNextAction: guard.recommendedNextAction,
      });
      return;
    }
    setBlockedNotice(null);
    publishGenerationNotice({ tone: 'working', text: '正在续写正文…' });

    try {
      const response = await api.post('/chain/continue', {
        projectId,
        chapterId,
        prompt: prompt || undefined,
        context: chapterContent,
        scenario: getScenarioKey(),
      });
      const data = ((response as any).data ?? response) as any;
      if (data?.success === false || !String(data?.content || '').trim()) {
        throw new Error(data?.error || '续写未返回可写入的正文');
      }
      publishGenerationNotice({ tone: 'success', text: '续写已生成，正在保存并同步创作资料…' });
      onGenerateComplete?.(String(data.content), chapterId);
    } catch (err) {
      const message = err instanceof Error ? err.message : '续写失败';
      publishGenerationNotice({ tone: 'error', text: `续写失败：${message}` });
      onError?.(message);
    } finally {
      finishGeneration();
    }
  }, [projectId, chapterId, prompt, chapterContent, isGenerating, getScenarioKey, checkAction, onGenerateComplete, onError, publishGenerationNotice]);

  // ========== 外挂功能 ==========

  const callPlugin = useCallback(async (type: string, endpoint: string, body: any) => {
    setPluginLoading(type);
    setPluginResult(null);
    try {
      const response = await api.post(endpoint, body);
      const data = response.data as any;
      if (data.success) {
        setPluginResult({ type, content: JSON.stringify(data, null, 2) });
      } else {
        setPluginResult({ type, content: `失败: ${data.error || '未知错误'}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '调用失败';
      setPluginResult({ type, content: `错误: ${message}` });
    } finally {
      setPluginLoading(null);
    }
  }, []);

  const handleEnhanceOpening = useCallback((style: string) => {
    if (!chapterContent) {
      onError?.('请先选择章节或输入内容');
      return;
    }
    // 取前2000字作为开头
    const text = chapterContent.substring(0, 2000);
    callPlugin('enhance-opening', '/chain/enhance-opening', {
      projectId,
      chapterId: chapterId || '',
      text,
      style,
    });
  }, [projectId, chapterId, chapterContent, callPlugin, onError]);

  const handleAnalyzeReversal = useCallback(() => {
    if (!chapterContent) {
      onError?.('请先选择章节');
      return;
    }
    callPlugin('enhance-reversal', '/chain/enhance-reversal', {
      projectId,
      chapterId: chapterId || '',
      content: chapterContent,
    });
  }, [projectId, chapterId, chapterContent, callPlugin, onError]);

  const handleAdaptPlatform = useCallback((platform: PlatformType) => {
    if (!chapterContent) {
      onError?.('请先选择章节');
      return;
    }
    callPlugin('adapt-platform', '/chain/adapt-platform', {
      projectId,
      chapterId: chapterId || '',
      content: chapterContent.substring(0, 3000),
      targetPlatform: platform,
    });
  }, [projectId, chapterId, chapterContent, callPlugin, onError]);

  const handleGenerateTitle = useCallback(() => {
    if (!chapterContent) {
      onError?.('请先选择章节');
      return;
    }
    callPlugin('generate-title', '/chain/generate-title', {
      projectId,
      content: chapterContent.substring(0, 2000),
      count: 5,
    });
  }, [projectId, chapterContent, callPlugin, onError]);
  // ========= 终稿质检 =========
  const handleFinalQA = useCallback(() => {
    if (!chapterContent) {
      onError?.('请先选择章节');
      return;
    }
    callPlugin('final-qa', '/chain/templates/execute/attach-final-qa', {
      projectId,
      chapterId: chapterId || '',
      content: chapterContent,
    });
  }, [projectId, chapterId, chapterContent, callPlugin, onError]);


  // ========== 质检功能 ==========

  const handleQualityCheck = useCallback(async () => {
    if (!chapterContent || !chapterId) {
      onError?.('请先选择并打开一个章节');
      return;
    }
    setQaLoading(true);
    setQaResult(null);

    try {
      const response = await api.post('/chain/quality-check', {
        projectId,
        chapterId,
        content: chapterContent,
      });
      const data = response.data as any;
      if (data.success) {
        setQaResult(data);
      } else {
        setQaResult({ error: data.error || '质检失败' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '质检请求失败';
      setQaResult({ error: message });
    } finally {
      setQaLoading(false);
    }
  }, [projectId, chapterId, chapterContent, onError]);

  // ========== 渲染 ==========

  return (
    <div style={styles.container}>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        {([
          { key: 'writing' as TabType, label: '写作' },
          { key: 'plugins' as TabType, label: '外挂' },
          { key: 'qa' as TabType, label: '质检' },
          { key: 'notes' as TabType, label: '笔记' },
        ]).map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.tab,
              color: activeTab === tab.key ? '#e94560' : '#8a8aa0',
              borderBottom: activeTab === tab.key ? '2px solid #e94560' : '2px solid transparent',
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ========== 写作 Tab ========== */}
      {activeTab === 'writing' && (
        <div style={styles.tabContent}>
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>生成目标</span>
            </div>
            <select
              value={chapterId || ''}
              onChange={(event) => onChapterChange?.(event.target.value)}
              disabled={isGenerating || chapters.length === 0}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: '#17172a', color: '#eaeaea', fontFamily: 'inherit', fontSize: '12px' }}
            >
              {chapters.length === 0 && <option value="">请先在章节列表选择章节</option>}
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  第{chapter.volumeIndex}卷·第{chapter.chapterIndex}章 {chapter.title}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '11px', color: '#8a8aa0', margin: '4px 0 0', lineHeight: 1.5 }}>
              每次只生成当前选定章节，并严格使用该章节绑定的大纲、已确认设定与前文状态；不会自动生成后续章节。
            </p>
          </div>
          {/* 生成方式 */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>生成方式</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['tianlong'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setGenerateMethod(method)}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', borderWidth: 1, borderStyle: 'solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
                    backgroundColor: generateMethod === method ? (method === 'tianlong' ? 'rgba(233,69,96,0.12)' : 'rgba(46,204,113,0.12)') : 'transparent',
                    borderColor: generateMethod === method ? (method === 'tianlong' ? '#e94560' : '#2ecc71') : 'rgba(255,255,255,0.08)',
                    color: generateMethod === method ? (method === 'tianlong' ? '#e94560' : '#2ecc71') : '#8a8aa0',
                  }}
                >
                  {method === 'tianlong' ? '🐉 天龙8步 Chain' : '⚡ 直接生成'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#8a8aa0', margin: '4px 0 0 0', lineHeight: 1.6 }}>{GENERATE_METHOD_DESCRIPTIONS[generateMethod]}</p>
          </div>

          {/* 写作模式 */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>写作模式</span>
              <button
                style={styles.modeBtn}
                onClick={() => setShowModeSelector(!showModeSelector)}
              >
                {MODE_LABELS[writingMode]} ▾
              </button>
            </div>
            <p style={styles.modeDesc}>{MODE_DESCRIPTIONS[writingMode]}</p>
            {showModeSelector && (
              <div style={styles.modeList}>
                {(Object.keys(MODE_LABELS) as WritingMode[]).map((mode) => (
                  <button
                    key={mode}
                    style={{
                      ...styles.modeOption,
                      backgroundColor: mode === writingMode ? 'rgba(233, 69, 96, 0.15)' : 'transparent',
                      borderColor: mode === writingMode ? '#e94560' : 'rgba(255,255,255,0.08)',
                    }}
                    onClick={() => {
                      setWritingMode(mode);
                      setShowModeSelector(false);
                    }}
                  >
                    <span style={styles.modeOptionLabel}>{MODE_LABELS[mode]}</span>
                    <span style={styles.modeOptionDesc}>{MODE_DESCRIPTIONS[mode]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 章节类型（决定使用哪个模型） */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>章节类型（大纲自动判断）</span>
            </div>
            <div style={{ display: 'none' }} aria-hidden="true">
              {([
                { key: 'daily' as ChapterScenario, label: '📝 日常', desc: '使用日常写作模型' },
                { key: 'climax' as ChapterScenario, label: '🔥 高潮', desc: '使用高潮章节模型' },
              ]).map((s) => (
                <button
                  key={s.key}
                  disabled
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    borderWidth: 1,
                    borderStyle: 'solid',
                    cursor: 'default',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    backgroundColor: chapterScenario === s.key
                      ? (s.key === 'climax' ? 'rgba(233,69,96,0.12)' : 'rgba(46,204,113,0.1)')
                      : 'transparent',
                    borderColor: chapterScenario === s.key
                      ? (s.key === 'climax' ? '#e94560' : '#2ecc71')
                      : 'rgba(255,255,255,0.08)',
                    color: chapterScenario === s.key
                      ? (s.key === 'climax' ? '#e94560' : '#2ecc71')
                      : '#8a8aa0',
                  }}
                  title={s.desc}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${chapterScenario === 'climax' ? 'rgba(233,69,96,0.35)' : chapterScenario === 'daily' ? 'rgba(46,204,113,0.32)' : 'rgba(255,255,255,0.12)'}`, backgroundColor: chapterScenario === 'climax' ? 'rgba(233,69,96,0.12)' : chapterScenario === 'daily' ? 'rgba(46,204,113,0.1)' : 'rgba(255,255,255,0.03)', color: chapterScenario === 'climax' ? '#e94560' : chapterScenario === 'daily' ? '#2ecc71' : '#8a8aa0', fontSize: '12px', fontWeight: 700 }}>
              {chapterScenario === null ? '等待选择章节并读取详细大纲' : chapterScenario === 'climax' ? '🔥 高潮章节（自动识别）' : '📝 日常章节（自动识别）'}
            </div>
            <p style={{ fontSize: '11px', color: '#8a8aa0', margin: '4px 0 0 0', lineHeight: 1.5 }}>
              {chapterScenario === 'climax'
                ? '依据本章大纲的功能、冲突与场景自动识别，使用配置的高潮模型。'
                : '依据本章详细大纲自动识别，使用配置的日常模型。'}
            </p>
          </div>

          {/* Prompt输入 */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>写作提示(可选)</span>
            </div>
            <textarea
              style={styles.promptInput}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入你对本章的创作要求、风格指引或关键情节..."
              rows={3}
            />
          </div>

          {/* 天龙8步进度 */}
          {isGenerating && currentStep >= 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>天龙8步 - 生成进度</span>
              </div>
              <div style={styles.stepsContainer}>
                {TIANLONG_STEPS.map((step, idx) => (
                  <div
                    key={step.key}
                    style={{
                      ...styles.stepItem,
                      opacity: idx <= currentStep ? 1 : 0.35,
                      backgroundColor:
                        idx === currentStep
                          ? 'rgba(233, 69, 96, 0.12)'
                          : idx < currentStep
                            ? 'rgba(46, 204, 113, 0.1)'
                            : 'transparent',
                    }}
                  >
                    <span
                      style={{
                        ...styles.stepIcon,
                        color: idx === currentStep ? '#e94560' : idx < currentStep ? '#2ecc71' : '#6c6c80',
                      }}
                    >
                      {idx < currentStep ? '✓' : idx === currentStep ? '●' : '○'}
                    </span>
                    <span style={styles.stepLabel}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          {blockedNotice && (
            <div style={{ marginBottom: 12 }}>
              <WorkflowBlockedNotice
                reason={blockedNotice.reason}
                missingAssets={blockedNotice.missingAssets}
                recommendedNextAction={blockedNotice.recommendedNextAction}
                onDismiss={() => setBlockedNotice(null)}
              />
            </div>
          )}
          {generationNotice && (
            <div
              role="status"
              style={{
                marginBottom: 10,
                padding: '9px 10px',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.5,
                color: generationNotice.tone === 'error' ? '#ff9aa9' : generationNotice.tone === 'success' ? '#8fe3a2' : '#f4cf72',
                backgroundColor: generationNotice.tone === 'error' ? 'rgba(231, 76, 96, .12)' : generationNotice.tone === 'success' ? 'rgba(46, 204, 113, .10)' : 'rgba(243, 156, 18, .10)',
                border: `1px solid ${generationNotice.tone === 'error' ? 'rgba(231, 76, 96, .45)' : generationNotice.tone === 'success' ? 'rgba(46, 204, 113, .40)' : 'rgba(243, 156, 18, .38)'}`,
              }}
            >
              {generationNotice.text}
            </div>
          )}
          <div style={styles.actions}>
            <button
              style={{
                ...styles.genBtn,
                opacity: isGenerating ? 0.5 : 1,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
              }}
              onClick={handleGenerate}
              disabled={isGenerating || !chapterId}
            >
              {isGenerating ? '生成中...' : '🤖 AI生成'}
            </button>
            {chapterId && (
              <button
                style={{
                  ...styles.contBtn,
                  opacity: isGenerating ? 0.5 : 1,
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                }}
                onClick={handleContinue}
                disabled={isGenerating}
              >
                📝 AI续写
              </button>
            )}
          </div>
        </div>
      )}


      {/* ========== 外挂 Tab ========== */}
      {activeTab === 'plugins' && (
        <div style={styles.tabContent}>
          {/* 开头强化 */}
          <div style={styles.pluginCard}>
            <div style={styles.pluginTitle}>🎯 开头强化</div>
            <p style={styles.pluginDesc}>增强选中章节的开头吸引力</p>
            <div style={styles.pluginActions}>
              {(Object.entries(ENHANCE_STYLE_LABELS) as [string, string][]).map(([key, label]) => (
                <button
                  key={key}
                  style={styles.pluginBtn}
                  onClick={() => handleEnhanceOpening(key)}
                  disabled={pluginLoading === 'enhance-opening'}
                >
                  {pluginLoading === 'enhance-opening' ? '处理中...' : label}
                </button>
              ))}
            </div>
          </div>

          {/* 反转分析 */}
          <div style={styles.pluginCard}>
            <div style={styles.pluginTitle}>🔄 反转分析</div>
            <p style={styles.pluginDesc}>分析当前章节的反转力度和增强方案</p>
            <button
              style={styles.pluginBtn}
              onClick={handleAnalyzeReversal}
              disabled={pluginLoading === 'enhance-reversal'}
            >
              {pluginLoading === 'enhance-reversal' ? '分析中...' : '🔄 分析反转'}
            </button>
          </div>

          {/* 平台改写 */}
          <div style={styles.pluginCard}>
            <div style={styles.pluginTitle}>📱 平台改写</div>
            <p style={styles.pluginDesc}>转换风格以适配不同发布平台</p>
            <div style={styles.pluginActions}>
              {(Object.entries(PLATFORM_LABELS) as [PlatformType, string][]).map(([key, label]) => (
                <button
                  key={key}
                  style={styles.pluginBtn}
                  onClick={() => handleAdaptPlatform(key)}
                  disabled={pluginLoading === 'adapt-platform'}
                >
                  {pluginLoading === 'adapt-platform' ? '转换中...' : label}
                </button>
              ))}
            </div>
          </div>

          {/* 标题生成 */}
          <div style={styles.pluginCard}>
            <div style={styles.pluginTitle}>🏷️ 标题/简介生成</div>
            <p style={styles.pluginDesc}>基于章节内容生成吸引人的标题</p>
            <button
              style={styles.pluginBtn}
              onClick={handleGenerateTitle}
              disabled={pluginLoading === 'generate-title'}
            >
              {pluginLoading === 'generate-title' ? '生成中...' : '🏷️ 生成标题'}
            </button>
          </div>

          {/* 终稿质检 */}
          <div style={styles.pluginCard}>
            <div style={styles.pluginTitle}>🔍 终稿质检</div>
            <p style={styles.pluginDesc}>8维度审查全文（开头钩子、代入感、悬念密度、反转力度、人物动机、伏笔回收、平台适配、完读率）</p>
            <button
              style={styles.pluginBtn}
              onClick={handleFinalQA}
              disabled={pluginLoading === 'final-qa'}
            >
              {pluginLoading === 'final-qa' ? '检测中...' : '🔍 终稿质检'}
            </button>
          </div>

          {/* 外挂结果展示 */}
          {pluginResult && (
            <div style={styles.pluginResult}>
              <div style={styles.pluginResultHeader}>
                <span style={styles.pluginResultTitle}>结果</span>
                <button
                  style={styles.pluginResultClose}
                  onClick={() => setPluginResult(null)}
                >
                  ✕
                </button>
              </div>
              <pre style={styles.pluginResultContent}>{pluginResult.content}</pre>
            </div>
          )}
        </div>
      )}

      {/* ========== 质检 Tab ========== */}
      {activeTab === 'qa' && (
        <div style={styles.tabContent}>
          {/* 质检主按钮 */}
          <button
            style={{
              ...styles.qaBtn,
              opacity: qaLoading ? 0.6 : 1,
              cursor: qaLoading ? 'not-allowed' : 'pointer',
            }}
            onClick={handleQualityCheck}
            disabled={qaLoading}
          >
            {qaLoading ? '🔍 检测中...' : '🔍 开始质量检测'}
          </button>

          {/* 写作质量诊断入口 */}
          <button
            style={{
              ...styles.qaBtn,
              background: '#3b82f6',
              marginTop: '8px',
            }}
            onClick={() => navigate(`/project/${projectId}/writing-quality`)}
          >
            📊 写作质量诊断中心
          </button>

          {/* 质检结果 */}
          {qaResult && !qaResult.error && (
            <div style={styles.qaResultContainer}>
              {/* 总体得分 */}
              <div style={styles.qaScoreSection}>
                <div style={styles.qaScoreCircle}>
                  <span style={styles.qaScoreNumber}>{qaResult.overallScore || '--'}</span>
                  <span style={styles.qaScoreLabel}>综合分</span>
                </div>
                <div style={styles.qaPassBadge}>
                  {qaResult.passed ? '✅ 通过' : '❌ 未通过'}
                </div>
                {qaResult.aiTraceIndex !== undefined && (
                  <div style={styles.qaAiTrace}>
                    <span style={styles.qaAiTraceLabel}>AI痕迹: </span>
                    <span
                      style={{
                        color: (qaResult.aiTraceIndex || 0) > 40 ? '#e74c3c' : (qaResult.aiTraceIndex || 0) > 25 ? '#f39c12' : '#2ecc71',
                        fontWeight: 700,
                      }}
                    >
                      {(qaResult.aiTraceIndex || 0).toFixed(1)}%
                    </span>
                    <span style={styles.qaAiTraceHint}>
                      {(qaResult.aiTraceIndex || 0) > 40 ? ' (需降AI处理)' : (qaResult.aiTraceIndex || 0) > 25 ? ' (需注意)' : ' (良好)'}
                    </span>
                  </div>
                )}
              </div>

              {/* 各维度评分 */}
              {qaResult.dimensions && qaResult.dimensions.length > 0 && (
                <div style={styles.qaDimensions}>
                  <div style={styles.sectionHeader}>
                    <span style={styles.sectionTitle}>十大维度评分</span>
                  </div>
                  {qaResult.dimensions.map((dim: any, idx: number) => (
                    <div key={idx} style={styles.qaDimensionItem}>
                      <div style={styles.qaDimensionHeader}>
                        <span style={styles.qaDimensionName}>{dim.name}</span>
                        <span
                          style={{
                            ...styles.qaDimensionScore,
                            color: dim.score >= 7 ? '#2ecc71' : dim.score >= 5 ? '#f39c12' : '#e74c3c',
                          }}
                        >
                          {dim.score}/10
                        </span>
                      </div>
                      {dim.suggestion && (
                        <p style={styles.qaDimensionSuggestion}>{dim.suggestion}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 优点/弱点 */}
              <div style={styles.qaLists}>
                {qaResult.strengths && qaResult.strengths.length > 0 && (
                  <div style={styles.qaListSection}>
                    <span style={styles.qaListTitle}>✅ 优点</span>
                    <ul style={styles.qaList}>
                      {qaResult.strengths.map((s: string, i: number) => (
                        <li key={i} style={styles.qaListItem}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {qaResult.weaknesses && qaResult.weaknesses.length > 0 && (
                  <div style={styles.qaListSection}>
                    <span style={styles.qaListTitle}>⚠️ 待改进</span>
                    <ul style={styles.qaList}>
                      {qaResult.weaknesses.map((w: string, i: number) => (
                        <li key={i} style={styles.qaListItem}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {qaResult.summary && (
                <p style={styles.qaSummary}>{qaResult.summary}</p>
              )}
            </div>
          )}

          {/* 错误展示 */}
          {qaResult && qaResult.error && (
            <div style={styles.qaError}>
              <span>❌ {qaResult.error}</span>
            </div>
          )}
        </div>
      )}

      {/* ========== 笔记 Tab ========== */}
      {activeTab === 'notes' && (
        <AuthorNotePanel chapterId={chapterId} />
      )}
    </div>
  );
};

// ==================== Styles ====================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: '13px',
    height: '100%',
    overflow: 'hidden',
  },

  // Tab Bar
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '0 12px',
    gap: '4px',
  },
  tab: {
    padding: '10px 14px',
    fontSize: '12px',
    fontWeight: 600,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  tabContent: {
    flex: 1,
    overflow: 'auto',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Writing tab styles
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8a8aa0',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  modeBtn: {
    padding: '4px 10px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: '4px',
    color: '#eaeaea',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  modeDesc: {
    margin: 0,
    fontSize: '11px',
    color: '#6c6c80',
    lineHeight: 1.4,
  },
  modeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  modeOption: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 12px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: '6px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  },
  modeOptionLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#eaeaea',
  },
  modeOptionDesc: {
    fontSize: '11px',
    color: '#6c6c80',
  },
  promptInput: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#eaeaea',
    fontSize: '12px',
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    outline: 'none',
    lineHeight: 1.5,
    boxSizing: 'border-box' as const,
  },
  stepsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    transition: 'all 0.2s',
  },
  stepIcon: {
    fontSize: '10px',
    width: '14px',
    textAlign: 'center' as const,
  },
  stepLabel: {
    color: '#c0c0d0',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  genBtn: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: '#e94560',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  contBtn: {
    flex: 1,
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px',
    color: '#eaeaea',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  // Plugin tab styles
  pluginCard: {
    padding: '10px 12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  pluginTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  pluginDesc: {
    margin: 0,
    fontSize: '11px',
    color: '#6c6c80',
  },
  pluginActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  pluginBtn: {
    padding: '5px 10px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '5px',
    color: '#c0c0d0',
    fontSize: '11px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  pluginResult: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  pluginResultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  pluginResultTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8a8aa0',
    textTransform: 'uppercase' as const,
  },
  pluginResultClose: {
    background: 'none',
    border: 'none',
    color: '#6c6c80',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
  },
  pluginResultContent: {
    margin: 0,
    padding: '10px 12px',
    fontSize: '11px',
    color: '#c0c0d0',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '200px',
    overflow: 'auto',
    lineHeight: 1.5,
  },

  // QA tab styles
  qaBtn: {
    width: '100%',
    padding: '12px',
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
    border: '1px solid rgba(46, 204, 113, 0.2)',
    borderRadius: '8px',
    color: '#2ecc71',
    fontSize: '14px',
    fontWeight: 600,
    fontFamily: 'inherit',
    textAlign: 'center' as const,
  },
  qaResultContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  qaScoreSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
  },
  qaScoreCircle: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    border: '3px solid #e94560',
  },
  qaScoreNumber: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#eaeaea',
    lineHeight: 1,
  },
  qaScoreLabel: {
    fontSize: '10px',
    color: '#8a8aa0',
    marginTop: '2px',
  },
  qaPassBadge: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  qaAiTrace: {
    fontSize: '12px',
    color: '#c0c0d0',
  },
  qaAiTraceLabel: {
    color: '#8a8aa0',
  },
  qaAiTraceHint: {
    fontSize: '10px',
    color: '#6c6c80',
  },
  qaDimensions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  qaDimensionItem: {
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
  },
  qaDimensionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qaDimensionName: {
    fontSize: '12px',
    color: '#c0c0d0',
  },
  qaDimensionScore: {
    fontSize: '13px',
    fontWeight: 700,
  },
  qaDimensionSuggestion: {
    margin: '4px 0 0 0',
    fontSize: '11px',
    color: '#6c6c80',
    lineHeight: 1.4,
  },
  qaLists: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  qaListSection: {
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
  },
  qaListTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#c0c0d0',
  },
  qaList: {
    margin: '6px 0 0 0',
    paddingLeft: '16px',
  },
  qaListItem: {
    fontSize: '11px',
    color: '#8a8aa0',
    lineHeight: 1.6,
  },
  qaSummary: {
    fontSize: '12px',
    color: '#c0c0d0',
    lineHeight: 1.5,
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '6px',
    fontStyle: 'italic' as const,
  },
  qaError: {
    padding: '12px',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#e74c3c',
  },
};

export default AiWritingPanel;
