/**
 * DiscoveryWizardPage - 灵感发现向导
 *
 * 三步走：
 * 1. 选择长短篇、平台、风格标签
 * 2. AI生成5个不重复的故事题材供选择
 * 3. 选择题材后创建项目，自动生成大纲+角色+世界观+组织+地图
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getBaseUrl } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import { useDiscoveryStore } from '../stores/discoveryStore';
import { openProject } from '../lib/openProject';
import IdeaCard from '../components/discovery/IdeaCard';

// ============================================================
// 常量
// ============================================================

const STORY_TYPES = [
  { value: 'short_story', label: '短篇', desc: '8,000 - 26,000字', icon: '📄' },
  { value: 'long_novel', label: '长篇', desc: '20万 - 80万字', icon: '📚' },
] as const;

const PLATFORMS = [
  { value: 'zhihu', label: '知乎盐选', color: '#60a5fa' },
  { value: 'fanqie', label: '番茄小说', color: '#e94560' },
  { value: 'qidian', label: '起点中文网', color: '#f59e0b' },
  { value: 'douyin', label: '抖音故事', color: '#a855f7' },
  { value: 'jinjiang', label: '晋江文学城', color: '#ec4899' },
  { value: 'rules_horror', label: '规则怪谈', color: '#22c55e' },
  { value: 'generic', label: '通用', color: '#6c6c80' },
] as const;

const ANGLE_COLORS: Record<string, string> = {
  '历史缝隙': '#60a5fa',
  '新闻改编': '#e94560',
  '小人物大历史': '#22c55e',
  '穿越新解': '#a855f7',
  '职业传奇': '#f59e0b',
};

const ANGLE_LABELS: Record<string, string> = {
  '历史缝隙': '像马伯庸一样从历史缝隙挖故事',
  '新闻改编': '从新闻事件中提取戏剧性角度',
  '小人物大历史': '以小人物视角撬动大时代',
  '穿越新解': '用新视角解构旧题材',
  '职业传奇': '聚焦冷门职业的传奇故事',
};

const STEP_LABELS = ['配置', '发现', '创建'];

const CREATION_STEPS = [
  { label: '创建项目...', key: 'project' },
  { label: '生成世界观...', key: 'world' },
  { label: '生成大纲...', key: 'outline' },
  { label: '生成角色...', key: 'characters' },
  { label: '生成伏笔...', key: 'foreshadowing' },
  { label: '生成组织与地点...', key: 'orgs' },
  { label: '生成时间线...', key: 'timeline' },
  { label: '完成！', key: 'done' },
];

// ============================================================
// 动态样式函数（不能在 s 对象中定义函数）
// ============================================================

const getStepDotStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  fontWeight: 700,
  backgroundColor: done ? '#2ecc71' : active ? '#e94560' : 'rgba(255,255,255,0.06)',
  color: done || active ? '#fff' : '#6c6c80',
  transition: 'all 0.3s',
  cursor: 'default',
});

const getStepLineStyle = (done: boolean): React.CSSProperties => ({
  width: '60px',
  height: '2px',
  backgroundColor: done ? '#2ecc71' : 'rgba(255,255,255,0.08)',
  transition: 'all 0.3s',
});

const getTypeCardStyle = (selected: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '16px',
  borderRadius: '10px',
  cursor: 'pointer',
  border: `1px solid ${selected ? '#e94560' : 'rgba(255,255,255,0.08)'}`,
  backgroundColor: selected ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)',
  transition: 'all 0.2s',
  textAlign: 'center' as const,
});

const getPlatformBtnStyle = (selected: boolean, color: string): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  border: `1px solid ${selected ? color : 'rgba(255,255,255,0.08)'}`,
  backgroundColor: selected ? `${color}22` : 'rgba(255,255,255,0.04)',
  color: selected ? color : '#8a8aa0',
  transition: 'all 0.15s',
});

const getToneBtnStyle = (selected: boolean): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: '20px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '12px',
  fontWeight: 600,
  border: `1px solid ${selected ? '#e94560' : 'rgba(255,255,255,0.08)'}`,
  backgroundColor: selected ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
  color: selected ? '#e94560' : '#8a8aa0',
  transition: 'all 0.15s',
});

const getIdeaCardStyle = (expanded: boolean): React.CSSProperties => ({
  backgroundColor: 'rgba(255,255,255,0.02)',
  borderRadius: '12px',
  border: `1px solid ${expanded ? '#e94560' : 'rgba(255,255,255,0.06)'}`,
  overflow: 'hidden',
  transition: 'all 0.2s',
  cursor: 'pointer',
  minWidth: 0,
});

const getAngleBadgeStyle = (angle: string): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '4px',
  backgroundColor: (ANGLE_COLORS[angle] || '#6c6c80') + '22',
  color: ANGLE_COLORS[angle] || '#6c6c80',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
});

const getStyleTagStyle = (tag: string): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '10px',
  backgroundColor: tag === '热血' ? 'rgba(233,69,96,0.12)' :
                   tag === '刀人' ? 'rgba(46,204,113,0.12)' :
                   tag === '爽文' ? 'rgba(245,158,11,0.12)' :
                   tag === '悬疑' ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.06)',
  color: tag === '热血' ? '#e94560' :
         tag === '刀人' ? '#2ecc71' :
         tag === '爽文' ? '#f59e0b' :
         tag === '悬疑' ? '#60a5fa' : '#8a8aa0',
});

// ============================================================
// 样式
// ============================================================

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1a1a2e',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: '#16213e',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#eaeaea',
    margin: 0,
  },
  headerSub: {
    fontSize: '12px',
    color: '#6c6c80',
    margin: '4px 0 0',
  },

  // 步骤指示器
  stepsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
    padding: '20px 24px 0',
  },
  stepLabel: {
    display: 'flex',
    justifyContent: 'center',
    gap: '82px',
    padding: '6px 0 16px',
    fontSize: '11px',
    color: '#6c6c80',
    fontWeight: 500,
  },

  // 内容区域
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },

  // Step 1: 配置
  configSection: {
    maxWidth: '720px',
    margin: '0 auto',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#8a8aa0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px',
  },
  typeGrid: {
    display: 'flex',
    gap: '12px',
    marginBottom: '28px',
  },
  typeIcon: {
    fontSize: '28px',
    marginBottom: '8px',
  },
  typeLabel: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#eaeaea',
  },
  typeDesc: {
    fontSize: '11px',
    color: '#6c6c80',
    marginTop: '4px',
  },

  platformGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '28px',
  },

  toneGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '32px',
  },

  startBtn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#e94560',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s',
    opacity: 1,
  },

  // Step 2: 发现
  generatingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    gap: '16px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '3px solid rgba(233,69,96,0.2)',
    borderTopColor: '#e94560',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  genText: {
    fontSize: '14px',
    color: '#c0c0d0',
  },
  progressBarOuter: {
    width: '280px',
    height: '4px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    background: 'linear-gradient(90deg, #e94560, #f5a623)',
    borderRadius: '2px',
    animation: 'progressAnim 5s ease-in-out infinite',
  },
  genDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#e94560',
    display: 'inline-block',
    animation: 'dotPulse 1.4s ease-in-out infinite',
  },

  ideasGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '12px',
  },
  ideaHeader: {
    padding: '16px',
  },
  ideaTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
  },
  ideaTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#eaeaea',
    flex: 1,
    lineHeight: 1.4,
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  ideaHook: {
    fontSize: '13px',
    color: '#a0a0b0',
    lineHeight: 1.5,
    margin: 0,
    fontStyle: 'italic',
  },
  styleTagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '10px',
  },

  ideaDetail: {
    padding: '0 16px 16px',
  },
  detailBlock: {
    marginTop: '12px',
    padding: '10px',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: '8px',
  },
  detailLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#6c6c80',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  detailText: {
    fontSize: '12px',
    color: '#c0c0d0',
    lineHeight: 1.6,
    margin: 0,
  },
  charTag: {
    display: 'inline-block',
    padding: '2px 8px',
    margin: '2px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#8a8aa0',
  },
  ideaActions: {
    padding: '12px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    gap: '8px',
  },
  selectBtn: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#e94560',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  retryBtn: {
    padding: '10px 20px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#8a8aa0',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  // Step 3: 创建进度
  progressContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  progressCard: {
    width: '400px',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '24px',
  },
  progressTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#eaeaea',
    marginBottom: '20px',
    textAlign: 'center',
  },
};

// ============================================================
// 组件
// ============================================================

const DiscoveryWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectProject } = useProjectStore();
  const store = useDiscoveryStore();

  // 从 store 读取状态（持久化，切换页面不丢失）
  const {
    step, storyType, platform, selectedTones, targetWords, selectedCategory, selectedSubCategory,
    isGenerating, genProgress, ideas, generationDone, prevTitles, excludeDetails,
    isCreating, creationProgress, creationErrors, creationWarnings, createdProjectId, createdProjectTitle, creationStepStatus,
    hasActiveCreation, activeCreationProjectId,
  } = store;

  // 本地状态（不需要持久化的 UI 数据）
  const [categories, setCategories] = useState<Array<{ name: string; children: string[] }>>([]);
  const [toneTags, setToneTags] = useState<string[]>([]);
  const [writingStyles, setWritingStyles] = useState<string[]>([]);

  // 从字典API加载数据
  useEffect(() => {
    api.get('/dict/categories/all').then(r => {
      const cats = (r as any)?.categories || [];
      setCategories(cats.map((c: any) => ({
        name: c.category.label,
        children: c.subcategories.map((s: any) => s.label),
      })));
    }).catch(() => {});
    api.get('/dict/tone_tag').then(r => {
      const tags = (r as any)?.items || [];
      setToneTags(tags.map((t: any) => t.label));
    }).catch(() => {});
    api.get('/dict/writing_style').then(r => {
      const styles = (r as any)?.items || [];
      setWritingStyles(styles.map((s: any) => s.label));
    }).catch(() => {});
  }, []);

  // 自定义题材
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customHook, setCustomHook] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customProtagonist, setCustomProtagonist] = useState('');
  const [customConflict, setCustomConflict] = useState('');
  const [customUnique, setCustomUnique] = useState('');

  const applyCreationMessage = useCallback((
    projectId: string,
    msg: any,
    cleanup: () => void,
  ): boolean => {
    const stepMap: Record<string, keyof typeof creationStepStatus> = {
      project: 'project',
      outline: 'outline',
      characters: 'characters',
      world: 'world',
      orgs: 'orgs',
      foreshadowing: 'foreshadowing',
      timeline: 'timeline',
      done: 'done',
    };

    switch (msg.type) {
      case 'progress': {
        store.setCreationProgress(msg.percent || 0);
        const mapped = stepMap[msg.step];
        if (mapped) {
          const nextStatus = msg.status === 'done' || msg.status === 'failed' ? msg.status : 'running';
          store.setCreationStepStatus((prev) => ({ ...prev, [mapped]: nextStatus }));
        }
        if (msg.status === 'failed') {
          store.setCreationWarnings([...(useDiscoveryStore.getState().creationWarnings || []), msg.message || `${msg.step} 未成功写入`]);
        }
        return false;
      }
      case 'done': {
        store.setCreationProgress(100);
        store.setCreationStepStatus({
          project: 'done', outline: 'done', characters: 'done',
          world: 'done', orgs: 'done', foreshadowing: 'done', timeline: 'done', done: 'done',
        });
        if (msg.warnings && Array.isArray(msg.warnings) && msg.warnings.length > 0) {
          store.setCreationWarnings(msg.warnings);
        }
        store.setCreating(false);
        store.setHasActiveCreation(false);
        store.setActiveCreationProjectId(null);
        cleanup();
        setTimeout(() => {
          selectProject(projectId);
          const title = useDiscoveryStore.getState().createdProjectTitle || `灵感项目-${projectId.slice(0, 8)}`;
          openProject(projectId, title, navigate);
        }, 1200);
        return true;
      }
      case 'error': {
        const message = msg.message || '后台生成失败';
        store.setCreationErrors([message]);
        if (msg.warnings && Array.isArray(msg.warnings)) store.setCreationWarnings(msg.warnings);
        store.setCreationStepStatus((prev) => {
          const n = { ...prev, done: 'failed' as const };
          for (const k of Object.keys(n) as Array<keyof typeof n>) {
            if (n[k] === 'running') n[k] = 'failed';
          }
          return n;
        });
        store.setCreating(false);
        store.setHasActiveCreation(false);
        store.setActiveCreationProjectId(null);
        cleanup();
        return true;
      }
      default:
        return false;
    }
  }, [store, selectProject, navigate, creationStepStatus]);

  const toggleTone = (tag: string) => {
    store.toggleTone(tag);
  };

  // 配置 → 发现（支持重新生成时传排除列表）
  const handleStartDiscovery = useCallback(async (excludeTitles?: string[], excludeDetailsArg?: Array<{ title: string; hook?: string; description?: string }>) => {
    store.setStep(1);
    store.setGenerating(true);
    store.setIdeas([]);
    store.setGenerationDone(false);
    store.setGenProgress('AI正在从多个角度挖掘故事题材...');

    // 分步进度动画
    const msgs = [
      '🤖 AI 正在思考故事角度...',
      '🔍 挖掘独特切入点...',
      '✍️ 构思故事脉络...',
      '🎭 塑造主角与冲突...',
      '✨ 打磨题材细节...',
    ];
    let msgIdx = 0;
    const msgInterval = setInterval(() => {
      if (msgIdx < msgs.length) {
        store.setGenProgress(msgs[msgIdx]);
        msgIdx++;
      }
    }, 5000);

    try {
      const currentState = useDiscoveryStore.getState();
      const allToneTags = [
        ...currentState.selectedTones,
        ...(currentState.selectedSubCategory ? [currentState.selectedSubCategory] : []),
      ];

      const res = await api.post<any>('/chain/idea-discover', {
        storyType: currentState.storyType,
        platform: currentState.platform,
        toneTags: allToneTags.length > 0 ? allToneTags : undefined,
        count: 5,
        excludeTitles,
        excludeDetails: excludeDetailsArg,
        targetWords: currentState.targetWords || undefined,
        storyCategory: currentState.selectedSubCategory || currentState.selectedCategory || undefined,
      });

      clearInterval(msgInterval);

      if ((res as any)?.success && (res as any)?.ideas?.length > 0) {
        const newIdeas = (res as any).ideas;
        store.setIdeas(newIdeas);
        // 记录本次题材标题和完整信息，下次排除用
        const newTitles = newIdeas.map((i: any) => i.title).filter(Boolean);
        store.addPrevTitles(newTitles);
        // 存储完整排除详情（含钩子和描述），用于更精确的去重
        const newDetails: Array<{ title: string; hook?: string; description?: string }> = newIdeas
          .filter((i: any) => i.title)
          .map((i: any) => ({ title: i.title, hook: i.hook, description: i.description }));
        store.addExcludeDetails(newDetails);
        store.setGenProgress(`✨ 发现 ${newIdeas.length} 个故事题材（已排除 ${excludeTitles?.length || 0} 个旧题材）`);
      } else {
        store.setGenProgress('⚠️ 暂时没有找到合适的题材，换个配置试试？');
      }
    } catch (err: any) {
      clearInterval(msgInterval);
      store.setGenProgress(`❌ ${err.message || '生成失败，请重试'}`);
    } finally {
      store.setGenerating(false);
      store.setGenerationDone(true);
    }
  }, [store]);

  // 重新发现（排除已出现的题材，传完整详情用于更精确去重）
  const handleRegenerate = useCallback(() => {
    const currentState = useDiscoveryStore.getState();
    handleStartDiscovery(currentState.prevTitles, currentState.excludeDetails);
  }, [handleStartDiscovery]);

  // SSE EventSource 引用，用于组件卸载时清理
  const sseRef = useRef<EventSource | null>(null);

  // 组件卸载时关闭 SSE 连接（但保留 store 状态以便恢复）
  useEffect(() => {
    return () => {
      sseRef.current?.close();
    };
  }, []);

  // 页面恢复：根据 store 状态自动恢复正确的步骤
  useEffect(() => {
    // 如果有活跃的创建流程，自动纠正 step 并重新连接 SSE
    // 注意：hasActiveCreation/activeCreationProjectId 不再被持久化（见 discoveryStore），
    //       所以这里只会在同一会话内（未刷新）有效
    if (hasActiveCreation && activeCreationProjectId) {
      if (step !== 2) {
        store.setStep(2);
      }
      reconnectSSE(activeCreationProjectId);
      return;
    }
    // 如果有上次的创建残留状态（错误/已完成/警告），说明是上次操作留下的过期数据，清理掉
    // 这些瞬时状态已不再被 persist（见 discoveryStore），但旧版 localStorage 可能还有残留
    const hasStaleCreation = creationStepStatus.done === 'done' && !hasActiveCreation;
    if (hasStaleCreation) {
      store.resetDiscovery();
      store.setCreationErrors([]);
      store.setCreationWarnings([]);
      store.setCreationStepStatus({
        project: 'pending', outline: 'pending', characters: 'pending',
        world: 'pending', orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
      });
      store.setCreatedProjectId(null);
      store.setCreatedProjectTitle(null);
      store.setCreationProgress(0);
    }
    // 如果发现结果存在且已完成，但 step 不对（从 persist 恢复），自动恢复到发现步骤
    if (ideas.length > 0 && generationDone && step === 0) {
      store.setStep(1);
    }
  }, [hasActiveCreation, activeCreationProjectId, step, ideas.length, generationDone, creationErrors.length]);

  // 重新连接 SSE（页面切换回来时恢复进度）
  const reconnectSSE = useCallback((projectId: string) => {
    // 清理旧连接
    sseRef.current?.close();

    const baseUrl = getBaseUrl();
    const sseUrl = `${baseUrl}/chain/project-creation-progress/${projectId}`;
    console.log(`[SSE·恢复] 正在重连 ${sseUrl} ...`);
    const eventSource = new EventSource(sseUrl);
    sseRef.current = eventSource;

    let receivedDone = false;
    let reconnectCount = 0;
    const MAX_RECONNECT = 10;

    const cleanup = () => {
      eventSource.close();
      if (sseRef.current === eventSource) sseRef.current = null;
    };

    eventSource.onopen = () => {
      console.log(`[SSE·恢复] 连接已建立 project=${projectId}`);
      reconnectCount = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        receivedDone = applyCreationMessage(projectId, msg, cleanup) || receivedDone;
      } catch {
        // 非 JSON 行忽略
      }
    };

    eventSource.onerror = () => {
      if (receivedDone) {
        cleanup();
        return;
      }
      reconnectCount++;
      if (reconnectCount > MAX_RECONNECT) {
        console.error(`[SSE·恢复] 重连超过${MAX_RECONNECT}次，放弃`);
        store.setCreationErrors(['SSE 连接失败，无法接收进度']);
        store.setCreating(false);
        store.setHasActiveCreation(false);
        store.setActiveCreationProjectId(null);
        cleanup();
        return;
      }
      console.log(`[SSE·恢复] 连接中断，自动重连中... (${reconnectCount}/${MAX_RECONNECT})`);
    };
  }, [store, applyCreationMessage]);

  // 选中题材 → 一键创建项目（异步 + SSE 实时进度，状态存入 store 防丢失）
  const handleSelectIdea = useCallback(async (idea: any) => {
    store.setStep(2);
    store.setCreating(true);
    store.setCreationErrors([]);
    store.setCreationWarnings([]);
    store.setCreatedProjectId(null);
    store.setCreatedProjectTitle(idea.title || null);
    store.setCreationProgress(0);
    store.setCreationStepStatus({
      project: 'running', outline: 'pending', characters: 'pending',
      world: 'pending', orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
    });

    // 清理上一次的 SSE 连接（如果有）
    sseRef.current?.close();

    // SSE 整体超时（15分钟，后端已优化并行化+降超时，此为安全网）
    const SSE_TIMEOUT = 900_000;
    let sseTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let receivedDone = false;

    const cleanup = () => {
      sseRef.current?.close();
      sseRef.current = null;
      if (sseTimeoutId) { clearTimeout(sseTimeoutId); sseTimeoutId = null; }
    };

    try {
      const currentState = useDiscoveryStore.getState();
      // 第一步：调用异步 API 创建项目
      const res = await api.post<any>('/chain/create-project-async', {
        title: idea.title,
        storyType: currentState.storyType,
        platformStyle: currentState.platform,
        selectedIdea: idea,
      }, 30_000);

      const data = (res as any).data ?? res;
      if (!data?.success) {
        store.setCreationErrors([data?.error || '创建项目失败']);
        store.setCreationStepStatus((prev) => {
          const n = { ...prev };
          for (const k of Object.keys(n)) n[k as keyof typeof n] = 'failed';
          return n;
        });
        store.setCreating(false);
        store.setHasActiveCreation(false);
        store.setActiveCreationProjectId(null);
        return;
      }

      const projectId: string = data.projectId;
      store.setCreatedProjectId(projectId);
      store.setHasActiveCreation(true);
      store.setActiveCreationProjectId(projectId);
      store.setCreationStepStatus((prev) => ({ ...prev, project: 'done', world: 'running' }));

      // 第二步：建立 SSE 连接接收实时进度
      const baseUrl = getBaseUrl();
      const sseUrl = `${baseUrl}/chain/project-creation-progress/${projectId}`;
      console.log(`[SSE] 正在连接 ${sseUrl} ...`);
      const eventSource = new EventSource(sseUrl);
      sseRef.current = eventSource;

      let reconnectCount = 0;
      const MAX_RECONNECT = 10;

      sseTimeoutId = setTimeout(() => {
        if (!receivedDone) {
          store.setCreationErrors(['项目创建超时（15分钟），请稍后重试']);
          store.setCreationStepStatus((prev) => {
            const n = { ...prev, done: 'failed' as const };
            for (const k of Object.keys(n) as Array<keyof typeof n>) {
              if (n[k] === 'running' || n[k] === 'pending') n[k] = 'failed';
            }
            return n;
          });
          store.setCreating(false);
          store.setHasActiveCreation(false);
          store.setActiveCreationProjectId(null);
          cleanup();
        }
      }, SSE_TIMEOUT);

      eventSource.onopen = () => {
        console.log(`[SSE] 连接已建立 project=${projectId}`);
        reconnectCount = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          receivedDone = applyCreationMessage(projectId, msg, cleanup) || receivedDone;
        } catch {
          // 非 JSON 行忽略
        }
      };

      eventSource.onerror = () => {
        if (receivedDone) {
          cleanup();
          return;
        }
        reconnectCount++;
        if (reconnectCount > MAX_RECONNECT) {
          console.error(`[SSE] 重连超过${MAX_RECONNECT}次，放弃`);
          store.setCreationErrors(['SSE 连接失败，无法接收进度']);
          store.setCreationStepStatus((prev) => {
            const n = { ...prev, done: 'failed' as const };
            for (const k of Object.keys(n) as Array<keyof typeof n>) {
              if (n[k] === 'running' || n[k] === 'pending') n[k] = 'failed';
            }
            return n;
          });
          store.setCreating(false);
          store.setHasActiveCreation(false);
          store.setActiveCreationProjectId(null);
          cleanup();
          return;
        }
        console.log(`[SSE] 连接中断，2秒后重连... (${reconnectCount}/${MAX_RECONNECT})`);
        // 手动关闭旧连接并重建（不依赖浏览器内置的自动重连）
        cleanup();
        setTimeout(() => {
          // 如果已经收到 done/error 或者用户已经取消，不再重连
          const state = useDiscoveryStore.getState();
          if (!state.isCreating || !state.hasActiveCreation) return;
          const newEs = new EventSource(sseUrl);
          sseRef.current = newEs;
          // 复用相同的消息处理（提取为内部函数避免重复）
          newEs.onopen = () => { console.log(`[SSE·重连] 成功 project=${projectId}`); };
          newEs.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              receivedDone = applyCreationMessage(projectId, msg, () => {
                newEs.close();
                if (sseRef.current === newEs) sseRef.current = null;
                if (sseTimeoutId) { clearTimeout(sseTimeoutId); sseTimeoutId = null; }
              }) || receivedDone;
            } catch {}
          };
          newEs.onerror = () => { /* 嵌套的 error 由外层 reconnectCount 控制 */ };
        }, 2000);
      };
    } catch (err: any) {
      store.setCreationErrors([err.message || '创建失败']);
      store.setCreationStepStatus((prev) => {
        const n = { ...prev, project: 'failed' as const, done: 'failed' as const };
        for (const k of Object.keys(n)) {
          if (n[k as keyof typeof n] === 'running') n[k as keyof typeof n] = 'failed';
        }
        return n;
      });
      store.setCreating(false);
      store.setHasActiveCreation(false);
      store.setActiveCreationProjectId(null);
      cleanup();
    }
  }, [store, selectProject, navigate, applyCreationMessage]);

  // 重新开始
  const handleReset = () => {
    sseRef.current?.close();
    sseRef.current = null;
    store.setCreating(false);
    store.setHasActiveCreation(false);
    store.setActiveCreationProjectId(null);
    store.reset();
  };

  // ============================================================
  // 渲染
  // ============================================================

  const renderStepIndicator = () => (
    <>
      <div style={s.stepsBar}>
        {STEP_LABELS.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div style={getStepLineStyle(i <= step)} />}
            <div style={getStepDotStyle(step === i, step > i)}>
              {step > i ? '✓' : i + 1}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={s.stepLabel}>
        {STEP_LABELS.map((label, i) => (
          <span key={label} style={{ color: step >= i ? '#8a8aa0' : '#6c6c80' }}>
            {label}
          </span>
        ))}
      </div>
    </>
  );

  const renderStep1 = () => (
    <div style={s.configSection}>
      {/* 故事类型 */}
      <div style={s.sectionTitle}>故事类型</div>
      <div style={s.typeGrid}>
        {STORY_TYPES.map((t) => (
          <div
            key={t.value}
            style={getTypeCardStyle(storyType === t.value)}
            onClick={() => store.setStoryType(t.value)}
          >
            <div style={s.typeIcon}>{t.icon}</div>
            <div style={s.typeLabel}>{t.label}</div>
            <div style={s.typeDesc}>{t.desc}</div>
          </div>
        ))}
      </div>

      {/* 目标平台 */}
      <div style={s.sectionTitle}>目标平台</div>
      <div style={s.platformGrid}>
        {PLATFORMS.map((p) => (
          <button
            key={p.value}
            style={getPlatformBtnStyle(platform === p.value, p.color)}
            onClick={() => store.setPlatform(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 目标字数 */}
      <div style={s.sectionTitle}>目标字数</div>
      <div style={{ marginBottom: '28px' }}>
        <input
          value={targetWords}
          onChange={(e) => store.setTargetWords(e.target.value)}
          placeholder={storyType === 'short_story' ? '例如: 8000（短篇建议 5000-20000字）' : '例如: 300000（长篇建议 20万-80万字）'}
          type="number"
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: '#eaeaea', fontSize: '13px',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>

      {/* 故事分类（级联选择） */}
      <div style={s.sectionTitle}>故事分类</div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        <select
          value={selectedCategory}
          onChange={(e) => { store.setSelectedCategory(e.target.value); }}
          style={{
            flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
            color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
          }}
        >
          <option value="" style={{ backgroundColor: '#1a1a2e' }}>选择大类...</option>
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name} style={{ backgroundColor: '#1a1a2e' }}>{cat.name}</option>
          ))}
        </select>
        <select
          value={selectedSubCategory}
          onChange={(e) => store.setSelectedSubCategory(e.target.value)}
          style={{
            flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
            color: selectedSubCategory ? '#eaeaea' : '#6c6c80',
            fontSize: '13px', fontFamily: 'inherit', outline: 'none',
          }}
          disabled={!selectedCategory}
        >
          <option value="" style={{ backgroundColor: '#1a1a2e' }}>选择子类...</option>
          {categories.find((c) => c.name === selectedCategory)?.children.map((sub) => (
            <option key={sub} value={sub} style={{ backgroundColor: '#1a1a2e' }}>{sub}</option>
          ))}
        </select>
      </div>

      {/* 情绪标签 */}
      <div style={s.sectionTitle}>故事基调（可多选）</div>
      <div style={s.toneGrid}>
        {toneTags.map((tag) => (
          <button
            key={tag}
            style={getToneBtnStyle(selectedTones.includes(tag))}
            onClick={() => toggleTone(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 写作风格 */}
      {writingStyles.length > 0 && (
        <>
          <div style={s.sectionTitle}>写作风格（选中后创建项目时应用）</div>
          <div style={s.toneGrid}>
            {writingStyles.map((style) => (
              <button
                key={style}
                style={getToneBtnStyle(selectedTones.includes(style))}
                onClick={() => toggleTone(style)}
              >
                {style}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 开始按钮 */}
      <button
        style={s.startBtn}
        onClick={() => handleStartDiscovery()}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ff6b81'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#e94560'; }}
      >
        🚀 AI深度发现题材
      </button>

      {/* 自定义题材入口 */}
      <div style={{ marginTop: '16px', marginBottom: '8px' }}>
        <div
          style={{ fontSize: '13px', color: '#8a8aa0', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          onClick={() => setShowCustom(!showCustom)}
        >
          {showCustom ? '▼' : '▶'} 或者，自己输入题材 →
        </div>
      </div>
      {showCustom && (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#eaeaea', marginBottom: '12px' }}>✍️ 自定义题材</div>

          {/* 题材标题（必填） */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>题材标题 *</div>
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="例如：魂穿北洋，领众破局"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 钩子 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>故事钩子</div>
            <input
              value={customHook}
              onChange={(e) => setCustomHook(e.target.value)}
              placeholder="一句话吸引读者，例如：一睁眼，我成了北洋军阀的弃子"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 故事描述 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>故事描述</div>
            <textarea
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="详细描述你的故事创意..."
              rows={3}
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
            />
          </div>

          {/* 主角设定 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>主角设定</div>
            <input
              value={customProtagonist}
              onChange={(e) => setCustomProtagonist(e.target.value)}
              placeholder="例如：现代历史系研究生，魂穿北洋"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 核心冲突 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>核心冲突</div>
            <input
              value={customConflict}
              onChange={(e) => setCustomConflict(e.target.value)}
              placeholder="例如：要在军阀混战中活下来，还要改变历史走向"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 独特卖点 */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', color: '#8a8aa0', marginBottom: '4px' }}>独特卖点</div>
            <input
              value={customUnique}
              onChange={(e) => setCustomUnique(e.target.value)}
              placeholder="例如：历史考据+系统金手指+群像叙事"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 提交按钮 */}
          <button
            disabled={!customTitle.trim()}
            style={{
              width: '100%', padding: '10px', backgroundColor: customTitle.trim() ? '#2ecc71' : 'rgba(255,255,255,0.04)',
              border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
              cursor: customTitle.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s', opacity: customTitle.trim() ? 1 : 0.5,
            }}
            onClick={() => {
              if (!customTitle.trim()) return;
              handleSelectIdea({
                title: customTitle.trim(),
                hook: customHook || undefined,
                description: customDesc || undefined,
                protagonist: customProtagonist || undefined,
                coreConflict: customConflict || undefined,
                uniquePoint: customUnique || undefined,
                angle: '自定义',
              });
            }}
            onMouseEnter={(e) => { if (customTitle.trim()) e.currentTarget.style.backgroundColor = '#27ae60'; }}
            onMouseLeave={(e) => { if (customTitle.trim()) e.currentTarget.style.backgroundColor = '#2ecc71'; }}
          >
            ✨ 使用自定义题材创建项目
          </button>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => {
    if (isGenerating) {
      return (
        <div style={s.generatingContainer}>
          <div style={s.spinner} />
          <div style={s.progressBarOuter}>
            <div style={s.progressBarInner} />
          </div>
          <div style={{ ...s.genText, marginTop: '8px' }}>{genProgress}</div>
          <div style={{ ...s.genText, fontSize: '12px', opacity: 0.5, marginTop: '4px' }}>
            预计30秒内完成
            <span style={s.genDot}>&nbsp;</span>
          </div>
        </div>
      );
    }

    if (ideas.length === 0) {
      return (
        <div style={s.generatingContainer}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤔</div>
          <div style={s.genText}>{genProgress || '暂无题材数据'}</div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'center' }}>
            <button style={s.retryBtn} onClick={() => handleStartDiscovery()}>
              重新发现
            </button>
            <button
              onClick={() => store.setStep(0)}
              style={{
                ...s.retryBtn,
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#8a8aa0',
              }}
            >
              ← 返回修改配置
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                ...s.retryBtn,
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#6c6c80',
              }}
            >
              返回首页
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#6c6c80' }}>
            AI从不同角度生成了以下 {ideas.length} 个题材，点击卡片可查看详情
            {prevTitles.length > ideas.length && (
              <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                （已累计排除 {prevTitles.length - ideas.length} 个旧题材）
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{
                padding: '6px 14px',
                backgroundColor: isGenerating ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#c0c0d0',
                fontSize: '12px',
                fontFamily: 'inherit',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
              disabled={isGenerating}
              onClick={handleRegenerate}
              onMouseEnter={(e) => {
                if (!isGenerating) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                if (!isGenerating) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
              }}
            >
              🔄 重新发现
            </button>
          </div>
        </div>

        <div style={s.ideasGrid}>
          {ideas.map((idea, idx) => (
            <IdeaCard key={`idea-${idx}`} idea={idea} onClick={handleSelectIdea} />
          ))}
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const isDone = creationStepStatus.done === 'done' && creationErrors.length === 0;
    const isWaiting = isCreating && !isDone;

    const stepContent = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* 总体进度条 */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', color: '#8a8aa0' }}>总进度</span>
            <span style={{ fontSize: '11px', color: '#e94560', fontWeight: 600 }}>{creationProgress}%</span>
          </div>
          <div style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${creationProgress}%`, backgroundColor: isDone ? '#2ecc71' : '#e94560', borderRadius: '2px', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {CREATION_STEPS.map((cs) => {
          const status = creationStepStatus[cs.key as keyof typeof creationStepStatus] || 'pending';
          const isRunning = status === 'running';
          const isStepDone = status === 'done';
          const isFailed = status === 'failed';
          return (
            <div key={cs.key} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px', borderRadius: '8px',
              backgroundColor: isFailed ? 'rgba(231,76,60,0.08)' : isRunning ? 'rgba(233,69,96,0.06)' : isStepDone ? 'rgba(46,204,113,0.04)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isFailed ? 'rgba(231,76,60,0.2)' : isRunning ? 'rgba(233,69,96,0.15)' : isStepDone ? 'rgba(46,204,113,0.1)' : 'rgba(255,255,255,0.04)'}`,
              transition: 'all 0.3s',
            }}>
              {/* 状态图标 */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700, flexShrink: 0,
                backgroundColor: isFailed ? 'rgba(231,76,60,0.16)' : isStepDone ? 'rgba(46,204,113,0.15)' : isRunning ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                color: isFailed ? '#e74c3c' : isStepDone ? '#2ecc71' : isRunning ? '#e94560' : '#6c6c80',
              }}>
                {isStepDone ? '✓' : isFailed ? '!' : isRunning ? (
                  <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                ) : '○'}
              </div>

              {/* 步骤名 + 进度条 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: isRunning ? '#eaeaea' : isStepDone ? '#c0c0d0' : '#6c6c80', fontWeight: isRunning ? 600 : 400 }}>
                    {cs.label}
                  </span>
                  <span style={{ fontSize: '10px', color: isFailed ? '#e74c3c' : isStepDone ? '#2ecc71' : isRunning ? '#e94560' : '#6c6c80' }}>
                    {isFailed ? '未写入' : isStepDone ? '完成' : isRunning ? '进行中...' : '等待中'}
                  </span>
                </div>
                <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: isStepDone ? '100%' : isFailed ? '100%' : isRunning ? '60%' : '0%',
                    backgroundColor: isStepDone ? '#2ecc71' : isFailed ? '#e74c3c' : '#e94560',
                    transition: isRunning ? 'width 3s ease-in-out' : 'width 0.3s ease',
                    ...(isRunning ? { animation: 'progressAnim 3s ease-in-out infinite' } : {}),
                  }} />
                </div>
              </div>
            </div>
          );
        })}

        {isWaiting && (
          <div style={{ textAlign: 'center', padding: '12px 0 0' }}>
            <span style={{ color: '#6c6c80', fontSize: '11px' }}>AI 正在调用大模型，通常需要 2-5 分钟...</span>
          </div>
        )}
      </div>
    );

    return (
      <div style={s.progressContainer}>
        <div style={s.progressCard}>
          <div style={s.progressTitle}>
            {!isCreating && creationErrors.length > 0
              ? '⚠️ 创建遇到问题'
              : isDone
                ? '🎉 创作空间已就绪！'
                : '🚀 正在创建你的故事世界...'}
          </div>

          {stepContent}

          {/* 非关键警告（黄色） */}
          {creationWarnings.length > 0 && (
            <div style={{ marginTop: '16px', padding: '10px', backgroundColor: 'rgba(243,156,18,0.1)', borderRadius: '8px', fontSize: '12px', color: '#f39c12', maxHeight: '120px', overflowY: 'auto' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚠️ 部分内容生成遇到问题（不影响项目创建）：</div>
              {creationWarnings.slice(0, 5).map((w, i) => <div key={i} style={{ marginBottom: '2px' }}>• {w}</div>)}
              {creationWarnings.length > 5 && <div style={{ color: '#8a8aa0', fontSize: '11px' }}>...还有 {creationWarnings.length - 5} 条警告</div>}
            </div>
          )}

          {creationErrors.length > 0 && (
            <div style={{ marginTop: '16px', padding: '10px', backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: '8px', fontSize: '12px', color: '#e74c3c' }}>
              {creationErrors.map((err, i) => <div key={i}>❌ {err}</div>)}
            </div>
          )}

          {/* 操作按钮区：根据成功/失败状态显示不同按钮 */}
          {!isCreating && (
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {creationErrors.length > 0 ? (
                <>
                  {/* 失败状态：提供重试、返回、回家三个选项 */}
                  {createdProjectId && (
                    <button style={{
                      width: '100%', padding: '12px', backgroundColor: '#e94560',
                      border: 'none', borderRadius: '8px', color: '#fff',
                      fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                      onClick={() => openProject(createdProjectId, createdProjectTitle || `灵感项目-${createdProjectId.slice(0, 8)}`, navigate)}>
                      仍要进入项目看板 →
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{
                      flex: 1, padding: '10px', backgroundColor: 'rgba(233,69,96,0.15)',
                      border: '1px solid rgba(233,69,96,0.3)', borderRadius: '8px',
                      color: '#e94560', fontSize: '13px', fontWeight: 600,
                      fontFamily: 'inherit', cursor: 'pointer',
                    }}
                      onClick={() => {
                        // 重试：清除错误，重新触发创建（用当前 store 里保留的选中题材信息）
                        store.setCreationErrors([]);
                        store.setCreationWarnings([]);
                        store.setCreating(false);
                        store.setCreatedProjectId(null);
                        store.setHasActiveCreation(false);
                        store.setActiveCreationProjectId(null);
                        store.setStep(1); // 返回 Step 2 重新选题材
                      }}>
                      🔄 重新选择题材
                    </button>
                    <button style={{
                      flex: 1, padding: '10px', backgroundColor: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
                      color: '#8a8aa0', fontSize: '13px', fontWeight: 600,
                      fontFamily: 'inherit', cursor: 'pointer',
                    }}
                      onClick={() => navigate('/')}>
                      🏠 返回首页
                    </button>
                  </div>
                </>
              ) : isDone ? (
                <>
                  {/* 成功状态 */}
                <button style={{
                  width: '100%', padding: '12px', backgroundColor: '#e94560',
                  border: 'none', borderRadius: '8px', color: '#fff',
                  fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                }}
                  onClick={() => { if (createdProjectId) openProject(createdProjectId, createdProjectTitle || `灵感项目-${createdProjectId.slice(0, 8)}`, navigate); }}>
                  进入项目看板 →
                </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={s.container}>
      {/* 顶栏 */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={s.headerTitle}>💡 灵感发现</h1>
            <p style={s.headerSub}>从多个角度挖掘故事题材，三分钟搭建完整创作框架</p>
          </div>
          {step > 0 && (
            <button
              style={{
                padding: '6px 14px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#8a8aa0',
                fontSize: '12px',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
              onClick={handleReset}
            >
              ← 重新开始
            </button>
          )}
        </div>
        {renderStepIndicator()}
      </div>

      {/* 内容 */}
      <div style={s.content}>
        {step === 0 && renderStep1()}
        {step === 1 && renderStep2()}
        {step === 2 && renderStep3()}
      </div>

      {/* style for animations */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes progressAnim {
          0% { width: 5%; }
          50% { width: 70%; }
          100% { width: 95%; }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default DiscoveryWizardPage;
