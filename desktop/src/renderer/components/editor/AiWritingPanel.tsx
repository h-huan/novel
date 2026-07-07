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
import { api, streamRequest } from '../../lib/api';
import AuthorNotePanel from './AuthorNotePanel';
import WorkflowBlockedNotice from '../workflow/WorkflowBlockedNotice';
import { useWorkflowGuardStore } from '../../stores/workflowGuardStore';

// ==================== Types ====================

export type WritingMode = 'manual' | 'semi_auto' | 'full_auto';

/** 章节类型：日常写作 或 高潮章节 */
export type ChapterScenario = 'daily' | 'climax';

type TabType = 'writing' | 'plugins' | 'qa' | 'notes';

type PlatformType = 'zhihu' | 'fanqie' | 'qidian' | 'douyin' | 'rules_horror';

interface AiWritingPanelProps {
  projectId: string;
  chapterId?: string;
  chapterContent?: string;
  volumeIndex?: number;
  chapterIndex?: number;
  onGenerateStart?: () => void;
  onGenerateComplete?: (content: string) => void;
  onError?: (error: string) => void;
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
  onGenerateStart,
  onGenerateComplete,
  onError,
}) => {
  // ========== 写作 Tab State ==========
  const [activeTab, setActiveTab] = useState<TabType>('writing');
  const [writingMode, setWritingMode] = useState<WritingMode>('semi_auto');
  const [generateMethod, setGenerateMethod] = useState<'tianlong' | 'direct'>('tianlong');
  const [chapterScenario, setChapterScenario] = useState<ChapterScenario>('daily');
  const [isGenerating, setIsGenerating] = useState(false);
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
    return 'writing';
  }, [chapterScenario]);

  // --- 外挂 Tab State ---
  const [pluginLoading, setPluginLoading] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState(5);
  const [batchStatus, setBatchStatus] = useState('');
  const [pluginResult, setPluginResult] = useState<{ type: string; content: string } | null>(null);

  // --- 质检 Tab State ---
  const [qaResult, setQaResult] = useState<any>(null);
  const [qaLoading, setQaLoading] = useState(false);

  // ========== 写作功能 ==========

  const [streamMode, setStreamMode] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamContent, setStreamContent] = useState('');

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

  const handleGenerate = useCallback(async () => {
    if (!projectId || isGenerating) return;
    const guard = await checkAction(projectId, 'generate_body');
    if (!guard.allowed) {
      setBlockedNotice({
        reason: guard.reason || '当前阶段不能生成正文',
        missingAssets: guard.missingAssets,
        recommendedNextAction: guard.recommendedNextAction,
      });
      return;
    }
    setBlockedNotice(null);
    setIsGenerating(true);
    setCurrentStep(0);
    setStreamContent('');
    setStreamProgress(0);
    onGenerateStart?.();

    if (streamMode) {
      // SSE 流式输出（真实天龙8步进度）— 使用 fetch 流解析（POST 模式）
      try {
        const body: Record<string, unknown> = { projectId, chapterId, chapterNumber: chapterIndex, prompt, scenario: getScenarioKey() };
        if (generateMethod === 'tianlong') {
          body.templateId = 'tianlong-8step';
        }
        streamRequest(
          '/chain/stream-generate',
          body,
          (data) => {
            if (data.type === 'step') {
              setCurrentStep(data.step as number);
              setStreamProgress((data.progress as number) || 0);
            } else if (data.type === 'complete') {
              setIsGenerating(false);
              setCurrentStep(-1);
              onGenerateComplete?.( (data.content as string) || '');
            } else if (data.type === 'error') {
              setIsGenerating(false);
              setCurrentStep(-1);
              onError?.( (data.error as string) || '生成失败');
            } else if (data.progress !== undefined) {
              setStreamProgress(data.progress as number);
              setStreamContent(prev => prev + (data.chunk as string || ''));
            }
          },
          (error) => {
            setIsGenerating(false);
            setCurrentStep(-1);
            onError?.(error.message);
          },
          () => {
            setIsGenerating(false);
            setCurrentStep(-1);
          },
        );
      } catch (err: any) {
        setIsGenerating(false);
        onError?.(err.message);
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
      const data = response.data as any;
      onGenerateComplete?.(data.content || JSON.stringify(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      onError?.(message);
    } finally {
      setIsGenerating(false);
      setCurrentStep(-1);
    }
  }, [projectId, chapterId, writingMode, prompt, isGenerating, streamMode, generateMethod, getScenarioKey, checkAction, onGenerateStart, onGenerateComplete, onError]);

  const handleContinue = useCallback(async () => {
    if (!projectId || !chapterId || isGenerating) return;
    const guard = await checkAction(projectId, 'continue_body');
    if (!guard.allowed) {
      setBlockedNotice({
        reason: guard.reason || '当前阶段不能续写正文',
        missingAssets: guard.missingAssets,
        recommendedNextAction: guard.recommendedNextAction,
      });
      return;
    }
    setBlockedNotice(null);
    setIsGenerating(true);

    try {
      const response = await api.post('/chain/continue', {
        projectId,
        chapterId,
        prompt: prompt || undefined,
        context: chapterContent,
        scenario: getScenarioKey(),
      });
      const data = response.data as any;
      onGenerateComplete?.(data.content || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : '续写失败';
      onError?.(message);
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, chapterId, prompt, chapterContent, isGenerating, getScenarioKey, checkAction, onGenerateComplete, onError]);

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
          {/* 生成方式 */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>生成方式</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['tianlong', 'direct'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setGenerateMethod(method)}
                  style={{
                    padding: '6px 12px', borderRadius: '6px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
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
              <span style={styles.sectionTitle}>章节类型</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {([
                { key: 'daily' as ChapterScenario, label: '📝 日常', desc: '使用日常写作模型' },
                { key: 'climax' as ChapterScenario, label: '🔥 高潮', desc: '使用高潮章节模型' },
              ]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setChapterScenario(s.key)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    cursor: 'pointer',
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
            <p style={{ fontSize: '11px', color: '#8a8aa0', margin: '4px 0 0 0', lineHeight: 1.5 }}>
              {chapterScenario === 'climax'
                ? '高潮章节将使用配置的高潮模型（更高温度、更强表现力）'
                : '除高潮场景外，所有写作均使用配置的日常模型'}
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
          <div style={styles.actions}>
            <button
              style={{
                ...styles.genBtn,
                opacity: isGenerating ? 0.5 : 1,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
              }}
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? '生成中...' : '🤖 AI生成'}
            </button>
            <button onClick={() => setStreamMode(p => !p)}
              style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', backgroundColor: streamMode ? 'rgba(46,204,113,0.1)' : 'rgba(255,255,255,0.04)', borderColor: streamMode ? '#2ecc71' : 'rgba(255,255,255,0.08)', color: streamMode ? '#2ecc71' : '#6c6c80' }}>
              {streamMode ? '⚡ 实时流' : '💾 一次性'}
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
            {/* 长篇每日生成 (long-write) */}
            <button
              style={{
                padding: '8px 14px', borderRadius: '6px', border: '1px solid rgba(155,89,182,0.3)',
                cursor: isGenerating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '12px',
                backgroundColor: 'rgba(155,89,182,0.08)', color: '#9b59b6', opacity: isGenerating ? 0.5 : 1,
              }}
              onClick={async () => {
                if (!projectId || isGenerating) return;
                const guard = await checkAction(projectId, 'generate_body');
                if (!guard.allowed) {
                  setBlockedNotice({
                    reason: guard.reason || '当前阶段不能生成正文',
                    missingAssets: guard.missingAssets,
                    recommendedNextAction: guard.recommendedNextAction,
                  });
                  return;
                }
                setBlockedNotice(null);
                setIsGenerating(true);
                onGenerateStart?.();
                try {
                  const res = await api.post('/chain/long-write', {
                    projectId, chapterId,
                    outline: prompt || chapterContent?.substring(0, 500) || '请生成章节正文',
                    previousChapterSummary: chapterContent?.substring(0, 300) || '',
                    volumeIndex, chapterIndex,
                    scenario: getScenarioKey(),
                  });
                  const data = res.data as any;
                  if (data.success) {
                    onGenerateComplete?.(data.content || '');
                  } else {
                    onError?.(data.error || '长篇生成失败');
                  }
                } catch (err: any) {
                  onError?.(err.message);
                } finally {
                  setIsGenerating(false);
                }
              }}
              disabled={isGenerating}
              title="长篇每日写作：生成正文 + 三连续检查 + 自动保存"
            >
              📖 长篇生成
            </button>
          </div>
        </div>
      )}

      {/* 批量生成 */}
      {activeTab === 'writing' && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', marginBottom: '6px' }}>📦 批量生成</div>
          <div style={{ fontSize: '11px', color: '#f8c471', lineHeight: 1.5, marginBottom: '8px' }}>
            批量正文生成已改为逐章确稿流程：每章生成后必须同步保存、自动提取待确稿状态并由作者确认，避免多章状态混乱。
          </div>
          {streamMode && streamProgress > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6c6c80', marginBottom: '2px' }}>
                <span>流式输出进度</span><span>{streamProgress}%</span>
              </div>
              <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${streamProgress}%`, height: '100%', backgroundColor: '#2ecc71', borderRadius: '2px', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6c6c80' }}>生成</span>
            <input type="number" min={1} max={30} value={batchCount} onChange={e => setBatchCount(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
              style={{ width: '50px', padding: '4px 6px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#eaeaea', fontSize: '12px', fontFamily: 'inherit', textAlign: 'center', outline: 'none' }} />
            <span style={{ fontSize: '11px', color: '#6c6c80' }}>章（最多30章）</span>
            <button onClick={() => {
              setBatchStatus('请使用单章“生成正文”。系统会同步保存初稿并生成待确稿状态。');
            }} disabled={isGenerating}
              style={{ padding: '5px 12px', backgroundColor: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '5px', color: '#f8c471', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
              转为逐章确稿
            </button>
          </div>
          {batchStatus && <div style={{ fontSize: '11px', color: batchStatus.startsWith('✅') ? '#2ecc71' : batchStatus.startsWith('❌') ? '#e74c3c' : '#f39c12', marginTop: '4px' }}>{batchStatus}</div>}
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
    border: '1px solid rgba(255,255,255,0.08)',
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
    border: '1px solid',
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
