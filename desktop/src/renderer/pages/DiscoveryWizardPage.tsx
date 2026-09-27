/**
 * DiscoveryWizardPage - 灵感发现向导
 *
 * 三步走：
 * 1. 选择长短篇、平台、风格标签
 * 2. AI生成5个不重复的故事题材供选择
 * 3. 选择题材后创建项目，自动生成大纲+角色+世界观+组织+地图
 */

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getBaseUrl } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import type { Project } from '@novel/shared';
import { useDiscoveryStore } from '../stores/discoveryStore';
import { openProject } from '../lib/openProject';
import { updateCreationStepStatus } from '../lib/creation-progress';
import IdeaCard from '../components/discovery/IdeaCard';
import MultiSelectDropdown from '../components/common/MultiSelectDropdown';
import CategoryReferencePicker from '../components/common/CategoryReferencePicker';
import {
  CHAPTER_WORD_RANGE,
  STORY_TARGET_WORD_RANGES,
  canFitTargetWordsToChapters,
  storyTargetWordsRequirement,
  categoryOptionsForPlatform,
  categoryReferenceOptionsForProject,
  platformCategoryDimensionBinding,
  platformCategoryWritingProfile,
  platformCategoryTreeVerification,
  platformCreationFieldNames,
  platformSubmissionDimensions,
  resolveSubmissionCategory,
  platformDisplayName,
  categoryWordScaleStanding,
  categoryWordScaleBlocked,
  categoryWordScaleMessage,
  type SupportedStoryType,
} from '@novel/shared';
import {
  PLATFORM_OPTIONS, CUSTOM_PLATFORM_VALUE, platformStandardProblem,
  categoryOptionId, parseCategory, categoryDisplayValue, type CategoryOption,
  audienceChannelOptions, missingExecutionStandards, unionOptions,
  type ExecutionStandardsValue,
} from '../lib/executionStandards';

// ============================================================
// 常量
// ============================================================

const STORY_TYPES = [
  { value: 'short_story', label: '短篇', desc: '聚焦主线，完整闭环', icon: '📄' },
  { value: 'long_novel', label: '长篇', desc: '多线发展，持续创作', icon: '📚' },
] as const;

// 同一页面卸载后旧 HTTP 请求仍可能返回；序号跨组件实例保留，只有最新请求能更新发现结果。
let latestDiscoveryRequestId = 0;

const chapterRangeFor = (_storyType: SupportedStoryType) => CHAPTER_WORD_RANGE;

const getTargetWordsRequirement = (storyType: 'short_story' | 'long_novel'): string => (
  storyTargetWordsRequirement(storyType, chapterRangeFor(storyType))
);

const isFeasibleTargetWords = (value: number, storyType: 'short_story' | 'long_novel'): boolean => {
  return canFitTargetWordsToChapters(value, storyType, chapterRangeFor(storyType));
};

const parseIdeaTargetWords = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[,，\s]/g, '').replace(/字$/, '');
  const match = text.match(/^(\d+(?:\.\d+)?)(万|千)?$/);
  if (!match) return null;
  const multiplier = match[2] === '万' ? 10000 : match[2] === '千' ? 1000 : 1;
  const parsed = Number(match[1]) * multiplier;
  return Number.isInteger(parsed) ? parsed : null;
};

const discoveryStandards = (state: ReturnType<typeof useDiscoveryStore.getState>): ExecutionStandardsValue => ({
  targetPlatform: state.targetPlatform,
  customPlatformNote: state.customPlatformNote,
  targetWords: state.targetWords,
  projectType: state.storyType,
  category: [state.selectedCategory, state.selectedSubCategory].filter(Boolean).join('/'),
  // 这里曾把新书的基调/文风/视角强制置空，后果是界面设定无法进入发现与创作。
  storyTone: state.selectedTones,
  writingStyle: state.selectedWritingStyles,
  webNovelGenre: state.selectedGenres,
  submissionTags: state.selectedSubmissionTags,
  plotTags: state.selectedPlotTags,
  genreFitNote: state.genreFitNote,
  pov: state.narrativePov,
  targetAudience: state.targetAudience,
  categoryWordScaleDeviation: state.categoryWordScaleDeviation,
});

/** 发现阶段留空的创作维度由题材卡明确给出；创建只取这张卡的定稿值，不回填另一个隐藏默认。 */
export const standardsForIdea = (state: ReturnType<typeof useDiscoveryStore.getState>, idea: any): ExecutionStandardsValue => ({
  ...discoveryStandards(state),
  targetPlatform: state.targetPlatform,
  category: [state.selectedCategory, state.selectedSubCategory].filter(Boolean).join('/') || String(idea?.storyCategory || ''),
  storyTone: state.selectedTones.length ? state.selectedTones : (Array.isArray(idea?.storyTone) ? idea.storyTone : []),
  writingStyle: state.selectedWritingStyles.length ? state.selectedWritingStyles : (Array.isArray(idea?.writingStyle) ? idea.writingStyle : []),
  webNovelGenre: state.selectedGenres.length ? state.selectedGenres : (Array.isArray(idea?.webNovelGenre) ? idea.webNovelGenre : []),
  submissionTags: state.selectedSubmissionTags.length ? state.selectedSubmissionTags : (Array.isArray(idea?.submissionTags) ? idea.submissionTags : []),
  plotTags: state.selectedPlotTags.length ? state.selectedPlotTags : (Array.isArray(idea?.plotTags) ? idea.plotTags : []),
  pov: state.narrativePov || String(idea?.pov || ''),
});

export const discoverySignature = (state: ReturnType<typeof useDiscoveryStore.getState>): string => JSON.stringify({
  ...discoveryStandards(state),
  storyType: state.storyType,
});

/** 只接收与发起时配置及当前配置同时一致的整批结果。 */
export const discoveryResponseMatchesSelection = (
  requestedSignature: string,
  state: ReturnType<typeof useDiscoveryStore.getState>,
  ideas: Array<{ storyType?: string; targetPlatform?: string }>,
): boolean => requestedSignature === discoverySignature(state)
  && ideas.length > 0
  && ideas.every((idea) => idea.storyType === state.storyType && idea.targetPlatform === state.targetPlatform);

const discoveryGenreProblem = (state: ReturnType<typeof useDiscoveryStore.getState>): string => {
  const category = resolveSubmissionCategory(
    state.targetPlatform,
    [state.selectedCategory, state.selectedSubCategory].filter(Boolean).join('/'),
    state.storyType, state.targetAudience,
  );
  if (category.status !== 'resolved') return '';
  const gap = platformCategoryDimensionBinding(
    state.targetPlatform, category.value, 'genre', state.selectedSubmissionTags.join('、'), state.storyType,
  ).gap;
  return gap && state.genreFitNote.trim().length < 10 ? `${gap}；请填写至少 10 字的契合依据` : '';
};

// 平台清单只从 executionStandards 取（唯一来源）；本文件只保留每个平台的强调色。
// 颜色是展示细节；平台 id、显示名与「是否已执行标准」的判据都不允许在这里复制第二份。
const PLATFORM_COLORS: Record<string, string> = {
  zhihu: 'var(--color-info-light)',
  fanqie: 'var(--color-accent)',
  qidian: 'var(--color-warning)',
  douyin: 'var(--color-purple)',
  jinjiang: 'var(--color-pink)',
  qimao: 'var(--color-warning)',
  xiaohongshu: 'var(--color-pink)',
  rules_horror: 'var(--color-success)',
  custom: 'var(--color-text-muted)',
};

const ANGLE_COLORS: Record<string, string> = {
  '历史缝隙': 'var(--color-info-light)',
  '新闻改编': 'var(--color-accent)',
  '小人物大历史': 'var(--color-success)',
  '穿越新解': 'var(--color-purple)',
  '职业传奇': 'var(--color-warning)',
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
  { label: '生成主线与结局骨架...', key: 'skeleton' },
  { label: '生成世界观...', key: 'world' },
  { label: '生成大纲...', key: 'outline' },
  { label: '生成角色资料...', key: 'characters' },
  { label: '生成组织与地点...', key: 'orgs' },
  { label: '生成伏笔...', key: 'foreshadowing' },
  { label: '生成时间线...', key: 'timeline' },
  { label: '完成！', key: 'done' },
];

/** 只凭持久化的确认题材定位已创建项目，避免重载后同一张卡重复创建。 */
export function findProjectForIdea(projects: Project[], idea: any): Project | undefined {
  return projects.find((project) => {
    if (project.creationSource !== 'idea_discovery' || !project.confirmedIdea) return false;
    try {
      const confirmed = JSON.parse(project.confirmedIdea);
      return confirmed.title === idea.title && confirmed.hook === idea.hook
        && confirmed.storyType === idea.storyType && confirmed.targetPlatform === idea.targetPlatform;
    } catch { return false; }
  });
}

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
  fontSize: 'var(--font-size-xs)',
  fontWeight: 700,
  backgroundColor: done ? 'var(--color-success)' : active ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
  color: done || active ? 'var(--color-white)' : 'var(--color-text-muted)',
  transition: 'all 0.3s',
  cursor: 'default',
});

const getStepLineStyle = (done: boolean): React.CSSProperties => ({
  width: '60px',
  height: '2px',
  backgroundColor: done ? 'var(--color-success)' : 'rgba(255,255,255,0.08)',
  transition: 'all 0.3s',
});

const getTypeCardStyle = (selected: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '16px',
  borderRadius: '10px',
  cursor: 'pointer',
  border: `1px solid ${selected ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
  backgroundColor: selected ? 'rgba(233,69,96,0.1)' : 'rgba(255,255,255,0.02)',
  transition: 'all 0.2s',
  textAlign: 'center' as const,
});

const getPlatformBtnStyle = (selected: boolean, color: string): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  border: `1px solid ${selected ? color : 'rgba(255,255,255,0.08)'}`,
  backgroundColor: selected ? `${color}22` : 'rgba(255,255,255,0.04)',
  color: selected ? color : 'var(--color-text-dim)',
  transition: 'all 0.15s',
});

const getIdeaCardStyle = (expanded: boolean): React.CSSProperties => ({
  backgroundColor: 'rgba(255,255,255,0.02)',
  borderRadius: '12px',
  border: `1px solid ${expanded ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)'}`,
  overflow: 'hidden',
  transition: 'all 0.2s',
  cursor: 'pointer',
  minWidth: 0,
});

const getAngleBadgeStyle = (angle: string): React.CSSProperties => ({
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '4px',
  backgroundColor: (ANGLE_COLORS[angle] || 'var(--color-text-muted)') + '22',
  color: ANGLE_COLORS[angle] || 'var(--color-text-muted)',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
});

const getStyleTagStyle = (tag: string): React.CSSProperties => ({
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '10px',
  backgroundColor: tag === '热血' ? 'rgba(233,69,96,0.12)' :
                   tag === '刀人' ? 'rgba(46,204,113,0.12)' :
                   tag === '爽文' ? 'rgba(245,158,11,0.12)' :
                   tag === '悬疑' ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.06)',
  color: tag === '热血' ? 'var(--color-accent)' :
         tag === '刀人' ? 'var(--color-success)' :
         tag === '爽文' ? 'var(--color-warning)' :
         tag === '悬疑' ? 'var(--color-info-light)' : 'var(--color-text-dim)',
});

// ============================================================
// 样式
// ============================================================

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--color-bg-primary)',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'var(--color-bg-secondary)',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  headerSub: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted)',
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
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted)',
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
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    color: 'var(--color-text-dim)',
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
    color: 'var(--color-text-primary)',
  },
  typeDesc: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
  },

  platformGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '28px',
  },

  startBtn: {
    width: '100%',
    padding: '14px',
    backgroundColor: 'var(--color-accent)',
    border: 'none',
    borderRadius: '10px',
    color: 'var(--color-white)',
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
    borderTopColor: 'var(--color-accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  genText: {
    fontSize: '14px',
    color: 'var(--color-text-soft)',
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
    background: 'linear-gradient(90deg, var(--color-accent), var(--color-warning))',
    borderRadius: '2px',
    animation: 'progressAnim 5s ease-in-out infinite',
  },
  genDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-accent)',
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
    color: 'var(--color-text-primary)',
    flex: 1,
    lineHeight: 1.4,
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  },
  ideaHook: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-secondary)',
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
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  detailText: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-soft)',
    lineHeight: 1.6,
    margin: 0,
  },
  charTag: {
    display: 'inline-block',
    padding: '2px 8px',
    margin: '2px',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '4px',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-dim)',
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
    backgroundColor: 'var(--color-accent)',
    border: 'none',
    borderRadius: '8px',
    color: 'var(--color-white)',
    fontSize: 'var(--font-size-xs)',
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
    color: 'var(--color-text-dim)',
    fontSize: 'var(--font-size-xs)',
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
    color: 'var(--color-text-primary)',
    marginBottom: '20px',
    textAlign: 'center',
  },
};

// ============================================================
// 组件
// ============================================================

const DiscoveryWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectProject, fetchProjects, projects } = useProjectStore();
  const store = useDiscoveryStore();

  // 从 store 读取状态（持久化，切换页面不丢失）
  const {
    step, storyType, targetPlatform, selectedGenres, selectedSubmissionTags, selectedPlotTags, selectedTones, selectedWritingStyles, narrativePov,
    targetWords, selectedCategory, selectedSubCategory, genreFitNote,
    customPlatformNote,
    targetAudience, categoryWordScaleDeviation,
    isGenerating, genProgress, ideas, generatedSignature, generationDone, prevTitles, excludeDetails,
    isCreating, creationProgress, creationErrors, creationWarnings, createdProjectId, createdProjectTitle, creationStepStatus,
    hasActiveCreation, activeCreationProjectId,
  } = store;

  // 本地状态（不需要持久化的 UI 数据）
  // 这里曾有过第二份全局题材字典回退，后果是未核实平台显示另一平台不承认的投稿分类。
  // 分类候选与长短篇范围统一来自 shared；未核实项允许填写后台原名。
  const [configError, setConfigError] = useState('');
  const [creativeGenres, setCreativeGenres] = useState<string[]>([]);
  const [toneOptions, setToneOptions] = useState<string[]>([]);
  const [styleOptions, setStyleOptions] = useState<string[]>([]);
  const [plotOptions, setPlotOptions] = useState<string[]>([]);
  const [povOptions, setPovOptions] = useState<string[]>([]);
  useEffect(() => {
    api.get('/dict/web_novel_genre').then((response) => setCreativeGenres(((response as any)?.items || []).map((item: any) => item.label))).catch(() => {});
    // 这里曾让基调、文风、情节和视角只读前端种子，后果是字典管理的增删改不会改变灵感发现选项。
    api.get('/dict/tone_tag').then((r) => setToneOptions(((r as any)?.items || []).map((item: any) => item.label))).catch(() => {});
    api.get('/dict/writing_style').then((r) => setStyleOptions(((r as any)?.items || []).map((item: any) => item.label))).catch(() => {});
    api.get('/dict/plot_tag').then((r) => setPlotOptions(((r as any)?.items || []).map((item: any) => item.label))).catch(() => {});
    api.get('/dict/narrative_pov').then((r) => setPovOptions(((r as any)?.items || []).map((item: any) => item.label))).catch(() => {});
  }, []);
  const categoryVerification = platformCategoryTreeVerification(targetPlatform, storyType);
  const hasVerifiedCategoryOptions = categoryVerification?.verified === 'confirmed';
  // 目标读者 = 所选平台投稿分类树里真实存在的频道（番茄=男频/女频，起点等还有纯爱/百合/无CP…）；
  // 平台未建模分类树时为空：该平台没有频道概念，只显示「不限定」，不拿别家频道凑数。
  const audienceOptions = hasVerifiedCategoryOptions ? audienceChannelOptions(targetPlatform) : [];
  const ideaRequestInFlightRef = useRef(false);

  // 挂载/重新进入时按 store 现状恢复，而不是无条件清空。
  // 发现灵感走普通 HTTP 长请求，组件卸载（路由切走）不会中断它，完成后仍写回全局 store，
  // 所以切走再回来要保留进行中/已完成状态；只有真正全新进入（无进行中任务、无结果）才重置回配置步。
  useLayoutEffect(() => {
    const current = useDiscoveryStore.getState();
    if (current.isCreating || current.hasActiveCreation) {
      store.setStep(2); // 创建进行中：恢复创建步，后续 effect 重连 SSE/WS
    } else if (current.isGenerating) {
      store.setStep(1); // 发现进行中：后台请求仍在跑，回发现步等待
    } else if (current.generationDone && current.ideas.length > 0) {
      store.setStep(1); // 已有结果：回发现步展示
    } else {
      store.resetDiscovery();
      store.setStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (generationDone && ideas.length > 0) void fetchProjects();
  }, [generationDone, ideas.length, fetchProjects]);

  useEffect(() => {
    if (generationDone && generatedSignature && generatedSignature !== discoverySignature(useDiscoveryStore.getState())) {
      // 这里曾有过第二份“已发现题材仍有效”的隐含口径：配置改了却继续展示旧卡，短篇页面会出现长篇。
      store.resetDiscovery();
      store.setStep(0);
      setConfigError('创作设定已改变，请按当前选择重新发现题材。');
    }
  }, [generationDone, generatedSignature, storyType, targetPlatform, targetWords,
    selectedCategory, selectedSubCategory, selectedTones, selectedWritingStyles,
    selectedGenres, selectedSubmissionTags, selectedPlotTags, narrativePov,
    targetAudience, customPlatformNote, genreFitNote, categoryWordScaleDeviation, store]);

  // 平台是分类的上位执行标准：分类必须落在所选平台的投稿分类里，不是全局题材字典里的名字。
  // 有平台投稿分类树时用平台树；平台未建模分类树时才回退全局字典（回退是显式的，
  // 不把全局分类冒充成平台分类——那种冒充正是「按平台分类执行」落空的原因）。
  const platformGroups = categoryOptionsForPlatform(targetPlatform);
  // 选项身份带频道（`频道·分类名`）：番茄有 3 个投稿分类名在男女频各有一项，
  // 只按名字做身份的话下拉 key 会重复、频道映射会被后写覆盖，用户点的是哪一个就丢了。
  const categories: CategoryOption[] = hasVerifiedCategoryOptions
    ? platformGroups.map((group) => ({ id: group.id, channel: group.channel, globalCategory: group.globalCategory, name: group.name, children: group.children, flat: group.flat }))
    : [];
  // 历史存储里可能只有分类名（没有频道前缀）：按目标读者把能唯一确定的归到选项身份上用于回显，
  // 跨频道同名又没有频道依据时留空——不猜，归位提示会要求重选。
  const parsedCategory = parseCategory(selectedCategory, categories, targetAudience);
  // 分类还可能是历史「全局大类/子类」写法（如 都市·现实/都市）：在平台侧对应多个投稿分类，
  // 解析不出选项身份，但后端执行标准仍会把它归位到某一个平台投稿分类。
  // 这里与执行标准页共用 categoryDisplayValue（同一份判据）：已归位就回显归位结果，
  // 不让「系统按 男频·都市日常 执行」和「下拉是空的」同时出现。
  const categoryPreview = resolveSubmissionCategory(
    targetPlatform,
    [selectedCategory, selectedSubCategory].filter(Boolean).join('/'),
    storyType, targetAudience,
  );
  const displayCategory = categoryDisplayValue(
    parsedCategory,
    categoryPreview.status === 'resolved' ? categoryPreview.value : null,
  );
  const selectedCategoryRef = hasVerifiedCategoryOptions ? displayCategory.major : selectedCategory;
  const selectedSubRef = hasVerifiedCategoryOptions ? selectedSubCategory || displayCategory.minor : '';
  // 扁平平台（番茄等）平台侧投稿分类只有一层：选了大类就已经是投稿分类，
  // 不能再让用户选一次子类，也不能把落库值拼成「X/X」。
  const selectedCategoryIsFlat = categories.find((c) => categoryOptionId(c) === selectedCategoryRef)?.flat === true;
  const platformCategoryValue = selectedCategoryIsFlat
    ? selectedCategoryRef
    : [selectedCategoryRef, selectedSubRef].filter(Boolean).join('/');
  // channelHint 传目标读者：同一个分类名横跨男女频时靠它选中正确的频道，与后端执行标准同一判据。
  const categoryPlacement = resolveSubmissionCategory(targetPlatform, platformCategoryValue, storyType, targetAudience);
  const categoryWritingProfile = categoryPlacement.status === 'resolved'
    ? platformCategoryWritingProfile(targetPlatform, categoryPlacement.value.channel, categoryPlacement.value.platformGroup, storyType)
    : null;
  const fieldNames = platformCreationFieldNames(targetPlatform, storyType, Boolean(categoryWritingProfile));
  // 这里曾把全局 web_novel_genre 字典直接当作平台分类标签展示，用户选到的词与平台头部标签对不上。
  // 有实测分类时只展示这份分类证据中的官方标签；无实测时明确使用作者设定字典。
  const submissionOptions = categoryWritingProfile ? categoryWritingProfile.topTags.map((tag) => tag.name) : [];

  // 「分类」维体量判据的创建前预览 —— 与后端创建入口（chain.controller 第三道阻断）、生成入口、
  // 质量 Gate 共用 shared 的同一份 categoryWordScaleStanding，前端只把同一份结论译成界面文案。
  //
  // 为什么创建前就要给出来：判据未满足时后端会直接拒建项目（项目未创建，请调整目标总字数），
  // 作者看不到原因就会在「我已经填了字数」和「项目未创建」之间来回打转 —— 那是最贵的排查方式。
  //
  // 为什么只在本步填了字数时才评价：这里留空的语义是「交给所选题材动态规划」（规划值在选完题材后
  // 才产生，后端按那个值判），不是「标准未执行」。拿空值在这里报未设定，等于把一步正常用法报成错误。
  const previewTargetWords = (() => {
    const text = String(targetWords ?? '').trim();
    if (!text) return null;
    const value = Number(text);
    return Number.isFinite(value) && value > 0 ? value : null;
  })();
  const scaleStanding = categoryWordScaleStanding({
    targetPlatform,
    category: platformCategoryValue,
    targetAudience,
    // 成稿单元：向导里选的长短篇就是本书的成稿单元，用来确认平台那份实测口径适不适用。
    projectType: storyType,
    targetWords: previewTargetWords ?? undefined,
    categoryWordScaleDeviation,
  });
  const scaleBlocked = previewTargetWords !== null && categoryWordScaleBlocked(scaleStanding);
  // 执行判据仍用 shared 的 standing；发现页只给作者一个可操作的短提示，不展示采样路径与内部审计文本。
  const scaleNote = scaleStanding.unitMismatch
    ? '该分类暂无适用于本书类型的字数参考，不会套用其他类型的数据。'
    : previewTargetWords === null ? ''
      : scaleStanding.status === 'within' ? '目标字数在该分类参考范围内。'
        : scaleStanding.status === 'deviation_declared' ? '已记录偏离该分类参考范围的取舍依据。'
          : scaleBlocked ? '目标字数不在该分类参考范围内，请调整字数或填写取舍依据。' : '';
  // 取舍依据只在「确实填了字数、且落在区间外」时可用：区间内没有取舍可写，
  // 未填字数时写它也无从对照（后端按题材规划值判）。
  const scaleDeviationVisible = scaleBlocked;
  const deviationChars = categoryWordScaleDeviation.trim().length;

  // 换平台后，旧平台的大类/子类在新平台可能根本不存在，必须当场清空重选，
  // 不能留着一个对不上位的分类（那等于这项执行标准没有落地）。
  const prevPlatformRef = useRef(targetPlatform);
  useEffect(() => {
    if (prevPlatformRef.current === targetPlatform) return;
    prevPlatformRef.current = targetPlatform;
    const state = useDiscoveryStore.getState();
    if (state.selectedCategory || state.selectedSubCategory) state.setSelectedCategory('');
  }, [targetPlatform]);

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
    switch (msg.type) {
      case 'progress': {
        store.setCreationProgress(msg.percent || 0);
        store.setCreationStepStatus((prev) => updateCreationStepStatus(prev, msg));
        if (msg.status === 'failed') {
          store.setCreationWarnings([...(useDiscoveryStore.getState().creationWarnings || []), msg.message || `${msg.step} 未成功写入`]);
        }
        return false;
      }
      case 'done': {
        void fetchProjects();
        store.setCreationProgress(100);
        store.setCreationStepStatus({
          project: 'done', skeleton: 'done', outline: 'done', characters: 'done',
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
        void fetchProjects();
        const message = msg.message || '后台生成失败';
        store.setCreationErrors([message]);
        if (msg.warnings && Array.isArray(msg.warnings)) store.setCreationWarnings(msg.warnings);
        store.setCreationStepStatus((prev) => updateCreationStepStatus(prev, msg));
        store.setCreating(false);
        store.setHasActiveCreation(false);
        store.setActiveCreationProjectId(null);
        cleanup();
        return true;
      }
      default:
        return false;
    }
  }, [store, selectProject, navigate, fetchProjects]);

  // 配置 → 发现（支持重新生成时传排除列表）
  const handleStartDiscovery = useCallback(async (excludeTitles?: string[], excludeDetailsArg?: Array<{ title: string; hook?: string; description?: string }>) => {
    if (ideaRequestInFlightRef.current) {
      store.setStep(1);
      return;
    }
    ideaRequestInFlightRef.current = true;
    const configuredState = useDiscoveryStore.getState();
    const requestedSignature = discoverySignature(configuredState);
    const configuredTarget = configuredState.targetWords.trim();
    if (configuredTarget) {
      const value = Number(configuredTarget);
      if (!isFeasibleTargetWords(value, configuredState.storyType)) {
        setConfigError(getTargetWordsRequirement(configuredState.storyType));
        store.setStep(0);
        ideaRequestInFlightRef.current = false;
        return;
      }
    }
    // 平台是执行前提：没选、选了通用、选了自定义却没写说明，都等于这一维没有标准。
    // 判据与执行标准页、后端 missingConstitutionStandards 同源（platformStandardProblem），不在这里另写一套 if。
    const platformProblem = platformStandardProblem(configuredState);
    if (platformProblem !== null) {
      setConfigError(platformProblem === 'custom_note_missing'
        ? '你选了自定义平台，但没有写这个平台的执行标准：系统没有它的节奏/回报/读者基准，标准只能来自你的说明，留空等于这项标准不存在。'
        : platformProblem === 'unsupported'
          ? '规则怪谈是题材标签，不是发布平台；请选择真实目标平台。'
          : '请选择目标平台：平台决定章节字数、节奏与回报基准，会写入创作宪法并驱动框架与正文；跳过它等于没有这项执行标准。');
      store.setStep(0);
      ideaRequestInFlightRef.current = false;
      return;
    }
    // 这里曾强制短故事先选分类，后果是“其余维度留空自动组合”的约定失效。
    // 平台必选；分类留空时由服务端从所选平台的同一分类事实源选取并记录在题材卡。
    const startPlacement = resolveSubmissionCategory(configuredState.targetPlatform, [configuredState.selectedCategory, configuredState.selectedSubCategory].filter(Boolean).join('/'), configuredState.storyType, configuredState.targetAudience);
    if (configuredState.selectedCategory && startPlacement.status === 'unmapped') {
      setConfigError('分类「' + configuredState.selectedCategory + (configuredState.selectedSubCategory ? '/' + configuredState.selectedSubCategory : '') + '」不在' + platformDisplayName(configuredState.targetPlatform) + '的投稿分类里：' + startPlacement.reason + '。该平台可用大类：' + startPlacement.availableGroups.join('、') + '。分类是执行前提，系统不会替你自动改写——请改选该平台的投稿分类。');
      store.setStep(0);
      ideaRequestInFlightRef.current = false;
      return;
    }
    const genreProblem = discoveryGenreProblem(configuredState);
    if (genreProblem) {
      setConfigError(genreProblem);
      store.setStep(0);
      ideaRequestInFlightRef.current = false;
      return;
    }
    setConfigError('');
    const requestId = ++latestDiscoveryRequestId;
    let generationSucceeded = false;
    store.setStep(1);
    store.setGenerating(true);
    store.setIdeas([]);
    store.setGeneratedSignature(null);
    store.setGenerationDone(false);
    store.setGenProgress('AI正在批量生成、校验并去重故事题材...');

    // 分步进度动画：前 5 步轮转文案，之后切换为真实等待计时，避免用户以为卡死
    const msgs = [
      '🤖 AI 正在思考故事角度...',
      '🔍 挖掘独特切入点...',
      '✍️ 构思故事脉络...',
      '🎭 塑造主角与冲突...',
      '✨ 打磨题材细节...',
    ];
    let msgIdx = 0;
    const startTime = Date.now();
    const msgInterval = setInterval(() => {
      if (requestId !== latestDiscoveryRequestId) { clearInterval(msgInterval); return; }
      if (msgIdx < msgs.length) {
        store.setGenProgress(msgs[msgIdx]);
        msgIdx++;
      } else {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        store.setGenProgress(`⏳ 已等待 ${minutes > 0 ? `${minutes} 分 ` : ''}${secs} 秒，当前模型正在生成并校验 5 个题材，请勿重复点击...`);
      }
    }, 5000);

    try {
      // 分类不再混进「标签」：它有自己的通道（storyCategory），且传的是平台投稿分类写法
      // 「平台大类/平台子类」，后端按同一份平台分类树解析，不让模型从标签里猜题材方向。
      const categoryValue = [configuredState.selectedCategory, configuredState.selectedSubCategory].filter(Boolean).join('/');
      const res = await api.post<any>('/chain/idea-discover', {
        storyType: configuredState.storyType,
        platform: configuredState.targetPlatform,
        customPlatformNote: configuredState.customPlatformNote,
        storyTone: configuredState.selectedTones,
        writingStyle: configuredState.selectedWritingStyles,
        webNovelGenre: discoveryStandards(configuredState).webNovelGenre,
        submissionTags: configuredState.selectedSubmissionTags,
        plotTags: configuredState.selectedPlotTags,
        genreFitNote: configuredState.genreFitNote,
        pov: configuredState.narrativePov,
        count: 5,
        excludeTitles,
        excludeDetails: excludeDetailsArg,
        targetWords: configuredState.targetWords || undefined,
        storyCategory: categoryValue || undefined,
        targetAudience: configuredState.targetAudience || undefined,
      });

      clearInterval(msgInterval);

      if (requestId !== latestDiscoveryRequestId) return;

      if ((res as any)?.success && (res as any)?.ideas?.length > 0) {
        const newIdeas = (res as any).ideas;
        if (!discoveryResponseMatchesSelection(requestedSignature, useDiscoveryStore.getState(), newIdeas)) {
          store.setGenProgress('创作设定已改变，或返回题材与所选长短篇/平台不一致；旧结果已丢弃，请重新发现。');
          store.setStep(0);
          return;
        }
        generationSucceeded = true;
        store.setIdeas(newIdeas);
        store.setGeneratedSignature(requestedSignature);
        // 记录本次题材标题和完整信息，下次排除用
        const newTitles = newIdeas.map((i: any) => i.title).filter(Boolean);
        store.addPrevTitles(newTitles);
        // 存储完整排除详情（含钩子和描述），用于更精确的去重
        const newDetails: Array<{ title: string; hook?: string; description?: string }> = newIdeas
          .filter((i: any) => i.title)
          .map((i: any) => ({ title: i.title, hook: i.hook, description: i.description }));
        store.addExcludeDetails(newDetails);
        const qualityWarn = (res as any).qualityWarning ? `\n⚠️ ${(res as any).qualityWarning}` : '';
        store.setGenProgress(`✨ 发现 ${newIdeas.length} 个故事题材（已排除 ${excludeTitles?.length || 0} 个旧题材）${qualityWarn}`);
      } else if ((res as any)?.error) {
        store.setGenProgress(`❌ ${(res as any).error}`);
      } else {
        store.setGenProgress('⚠️ 暂时没有找到合适的题材，换个配置试试？');
      }
    } catch (err: any) {
      clearInterval(msgInterval);
      if (requestId === latestDiscoveryRequestId) store.setGenProgress(`❌ ${err.message || '生成失败，请重试'}`);
    } finally {
      ideaRequestInFlightRef.current = false;
      if (requestId === latestDiscoveryRequestId) {
        store.setGenerating(false);
        store.setGenerationDone(generationSucceeded);
      }
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
        project: 'pending', skeleton: 'pending', outline: 'pending', characters: 'pending',
        world: 'pending', orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
      });
      store.setCreatedProjectId(null);
      store.setCreatedProjectTitle(null);
      store.setCreationProgress(0);
    }
    // 如果发现结果存在且已完成，但 step 不对（从 persist 恢复），自动恢复到发现步骤
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
    const preflightState = useDiscoveryStore.getState();
    if (idea.storyType && idea.storyType !== preflightState.storyType) {
      setConfigError('题材卡的长短篇类型与当前配置不一致，请重新发现题材；项目未创建。');
      store.setStep(0);
      return;
    }
    const selectedStandards = standardsForIdea(preflightState, idea);
    if (preflightState.ideas.includes(idea)
      && preflightState.generatedSignature !== discoverySignature(preflightState)) {
      setConfigError('创作设定已更改，请按当前设定重新发现灵感后再创建作品。');
      store.setStep(0);
      return;
    }
    const explicitTarget = preflightState.targetWords.trim()
      ? Number(preflightState.targetWords)
      : null;
    // 以所选题材的规划字数为主（卡片显示值），配置字数仅作题材缺少规划时的兜底，保证项目与所选灵感一致
    const ideaTarget = parseIdeaTargetWords(idea?.recommendedTargetWords ?? idea?.estimatedWords);
    const plannedTarget = ideaTarget ?? explicitTarget;
    if (plannedTarget === null || !isFeasibleTargetWords(plannedTarget, preflightState.storyType)) {
      setConfigError(`这个题材没有可执行的动态篇幅规划。${getTargetWordsRequirement(preflightState.storyType)}请返回配置填写可执行的目标字数，再重新选择题材。`);
      store.setStep(0);
      return;
    }
    // 与 handleStartDiscovery 同一条执行标准判据：分类/视角为空就是标准未执行。
    // 这里必须在提交前复检——选完题材直接创建项目时若跳过，「分类/视角」两个维度
    // 会以空值写进创作宪法，框架与正文随后都失去这条约束（后端 422 才暴露已经太晚）。
    if (!selectedStandards.category) {
      setConfigError('请选择故事分类：分类会写入创作宪法并驱动框架与正文；跳过它等于没有这项执行标准（不是不适用）。');
      store.setStep(0);
      return;
    }
    // 与 handleStartDiscovery 同一判据：分类必须归位到所选平台的投稿分类（平台未建模分类树时不阻断）。
    const createPlacement = resolveSubmissionCategory(selectedStandards.targetPlatform, selectedStandards.category, preflightState.storyType, preflightState.targetAudience);
    if (createPlacement.status === 'unmapped') {
      setConfigError('分类「' + preflightState.selectedCategory + (preflightState.selectedSubCategory ? '/' + preflightState.selectedSubCategory : '') + '」不在' + platformDisplayName(preflightState.targetPlatform) + '的投稿分类里：' + createPlacement.reason + '。该平台可用大类：' + createPlacement.availableGroups.join('、') + '。分类是执行前提，系统不会替你自动改写——请改选该平台的投稿分类。');
      store.setStep(0);
      return;
    }
    // 第三道创建前阻断：「分类」维的体量判据。与后端创建入口（chain.controller 第三道阻断）、
    // 生成入口、质量 Gate 共用同一份 categoryWordScaleStanding —— 前端提前摆出同一句话，
    // 作者就不必等 SSE 回「项目未创建」才知道原因。
    // 不降级：不擅自改写所选题材给的目标字数，也不降低判据本身。
    const createScaleStanding = categoryWordScaleStanding({
      targetPlatform: selectedStandards.targetPlatform,
      category: selectedStandards.category,
      targetAudience: preflightState.targetAudience,
      projectType: preflightState.storyType,
      targetWords: plannedTarget,
      categoryWordScaleDeviation: preflightState.categoryWordScaleDeviation,
    });
    if (categoryWordScaleBlocked(createScaleStanding)) {
      setConfigError(categoryWordScaleMessage(createScaleStanding, platformDisplayName(selectedStandards.targetPlatform))
        + '；请在配置步调整目标总字数，或补齐「分类体量取舍依据」后再选题材。');
      store.setStep(0);
      return;
    }
    // 平台同上：必须在提交创建前复检；空值一旦写进创作宪法，框架与正文随后都失去这条约束。
    const platformProblem = platformStandardProblem(selectedStandards);
    if (platformProblem !== null) {
      setConfigError(platformProblem === 'custom_note_missing'
        ? '你选了自定义平台，但没有写这个平台的执行标准：系统没有它的节奏/回报/读者基准，标准只能来自你的说明，留空等于这项标准不存在。'
        : platformProblem === 'unsupported'
          ? '规则怪谈是题材标签，不是发布平台；请选择真实目标平台。'
          : '请选择目标平台：它决定章节字数、节奏与回报基准，会写入创作宪法并驱动框架与正文；跳过它等于没有这项执行标准。');
      store.setStep(0);
      return;
    }
    const missing = missingExecutionStandards(selectedStandards);
    const genreProblem = discoveryGenreProblem(preflightState);
    if (missing.length || genreProblem) {
      setConfigError(missing.length ? `请先选定${missing.join('、')}，项目必须沿用发现灵感时的设定。` : genreProblem);
      store.setStep(0);
      return;
    }
    setConfigError('');
    store.setStep(2);
    store.setCreating(true);
    store.setCreationErrors([]);
    store.setCreationWarnings([]);
    store.setCreatedProjectId(null);
    store.setCreatedProjectTitle(idea.title || null);
    store.setCreationProgress(0);
    store.setCreationStepStatus({
      project: 'running', skeleton: 'pending', outline: 'pending', characters: 'pending',
      world: 'pending', orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
    });

    // 清理上一次的连接
    sseRef.current?.close();

    const cleanup = () => {
      sseRef.current?.close();
      sseRef.current = null;
    };

    try {
      const currentState = useDiscoveryStore.getState();
      // 这里曾让 AI 推荐值优先合并用户所选值，结果项目卡片的基调/文风/流派比发现灵感时多出另一套。
      // 六维以用户本次配置为准；模型只负责在这些设定内构思，不得替作者增改设定。
      // 第一步：调用异步 API 创建项目
      const res = await api.post<any>('/chain/create-project-async', {
        title: idea.title,
        storyType: currentState.storyType,
        targetPlatform: standardsForIdea(currentState, idea).targetPlatform,
        customPlatformNote: currentState.customPlatformNote,
        targetWords: parseIdeaTargetWords(idea?.recommendedTargetWords ?? idea?.estimatedWords) ?? (currentState.targetWords.trim() ? Number(currentState.targetWords) : undefined),
        selectedIdea: idea,
        category: standardsForIdea(currentState, idea).category,
        targetAudience: currentState.targetAudience || undefined,
        // 分类体量取舍依据：执行标准「分类」维自己给出的合规路径，必须随创建一起落库，
        // 只留在前端等于没有这条路径（后端判据读的是创作宪法上的那一份）。
        categoryWordScaleDeviation: currentState.categoryWordScaleDeviation.trim() || undefined,
        storyTone: standardsForIdea(currentState, idea).storyTone,
        writingStyle: standardsForIdea(currentState, idea).writingStyle,
        webNovelGenre: standardsForIdea(currentState, idea).webNovelGenre,
        submissionTags: standardsForIdea(currentState, idea).submissionTags,
        plotTags: standardsForIdea(currentState, idea).plotTags,
        genreFitNote: currentState.genreFitNote,
        pov: standardsForIdea(currentState, idea).pov,
        settings: {
          structurePlanning: 'dynamic_by_story_rhythm',
        },
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
      void fetchProjects();
      store.setHasActiveCreation(true);
      store.setActiveCreationProjectId(projectId);
      store.setCreationStepStatus((prev) => ({ ...prev, project: 'done', [currentState.storyType === 'long_novel' ? 'skeleton' : 'world']: 'running' }));

      // 创建状态由页面恢复 effect 通过 SSE 单路接收并按服务器事件顺序回放。
      // 这里曾同时订阅 WebSocket 与 SSE，后果是旧事件重放覆盖新阶段，
      // 且 WebSocket 的单独断连会把仍在服务端运行的创建流程误判为失败。
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
  }, [store, fetchProjects]);

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
          <span key={label} style={{ color: step >= i ? 'var(--color-text-dim)' : 'var(--color-text-muted)' }}>
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
        {PLATFORM_OPTIONS.map((p) => (
          <button
            key={p.value}
            style={getPlatformBtnStyle(targetPlatform === p.value, PLATFORM_COLORS[p.value] || 'var(--color-text-muted)')}
            onClick={() => { store.setTargetPlatform(p.value); setConfigError(''); }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {targetPlatform === CUSTOM_PLATFORM_VALUE && (
        <div style={{ marginTop: '10px', marginBottom: '4px' }}>
          <textarea
            value={customPlatformNote}
            onChange={(e) => { store.setCustomPlatformNote(e.target.value); setConfigError(''); }}
            placeholder="写清这个平台的执行标准：章节字数、节奏、回报方式与读者预期，例如「每章 2000-3000 字，前三章必须给足钩子，按单章订阅回报写」"
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', boxSizing: 'border-box',
              backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)',
              fontFamily: 'inherit', outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ marginTop: '7px', color: customPlatformNote.trim() ? '#8d96ad' : 'var(--color-danger)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
            自定义平台没有内置基准，这段说明就是「平台」这一维的执行标准；留空会被判为未执行标准，创建与生成都会被阻断。
          </div>
        </div>
      )}

      {/* 目标总字数：填写时严格执行，留空时采用所选题材的动态规划值 */}
      <div style={s.sectionTitle}>目标总字数</div>
      <div style={{ marginBottom: '28px' }}>
        <input
          value={targetWords}
          onChange={(e) => { store.setTargetWords(e.target.value); setConfigError(''); }}
          placeholder="留空则由AI根据题材规模、剧情节奏和章节任务动态规划"
          type="number"
          min={STORY_TARGET_WORD_RANGES[storyType].min}
          max={STORY_TARGET_WORD_RANGES[storyType].max ?? undefined}
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)',
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <div style={{ marginTop: '7px', color: '#8d96ad', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
          {storyType === 'short_story'
            ? '短篇目标总字数为 8,000–35,000 字；章节字数按所选平台规则动态规划。'
            : '长篇目标总字数不少于 100,000 字；章节字数按所选平台规则动态规划。'}
        </div>
        {scaleNote && (
          <div style={{ marginTop: '7px', color: scaleBlocked ? 'var(--color-danger)' : '#8d96ad', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
            {scaleNote}
          </div>
        )}
        {scaleDeviationVisible && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', marginBottom: '6px' }}>
              分类体量取舍依据（{deviationChars}/10 字，不足 10 字不算说明）
            </div>
            <textarea
              value={categoryWordScaleDeviation}
              onChange={(e) => { store.setCategoryWordScaleDeviation(e.target.value); setConfigError(''); }}
              placeholder="写清为什么刻意偏离该分类的体量区间：这个体量服务什么读者预期、靠什么换回曝光或留存"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)',
                fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              }}
            />
          </div>
        )}
        {configError && (
          <div style={{ marginTop: '8px', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>{configError}</div>
        )}
      </div>

      {/* 故事分类（级联选择）：分类来自所选平台的投稿分类树，不是全局题材字典 */}
      <div style={s.sectionTitle}>{fieldNames.category}</div>
      <div style={{ marginBottom: '28px' }}>
        {!hasVerifiedCategoryOptions ? (
          <CategoryReferencePicker
            value={selectedCategory}
            options={categoryReferenceOptionsForProject(targetPlatform, storyType)}
            onChange={store.setSelectedCategory}
          />
        ) : <>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={selectedCategoryRef}
            onChange={(e) => { store.setSelectedCategory(e.target.value); }}
            style={{
              flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
              color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none',
            }}
          >
            <option value="" style={{ backgroundColor: 'var(--color-bg-primary)' }}>{categoryVerification?.verified === 'confirmed' ? '选择该平台分类...' : '选择题材分类...'}</option>
            {categories.map((cat) => {
              const optionId = categoryOptionId(cat);
              return (
                <option key={optionId} value={optionId} style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                  {optionId}
                </option>
              );
            })}
          </select>
          {!selectedCategoryIsFlat && (
            <select
              value={selectedSubRef}
              onChange={(e) => store.setSelectedSubCategory(e.target.value)}
              style={{
                flex: 1, padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
                color: selectedSubCategory ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none',
              }}
              disabled={!selectedCategoryRef}
            >
              <option value="" style={{ backgroundColor: 'var(--color-bg-primary)' }}>选择子类...</option>
              {categories.find((c) => categoryOptionId(c) === selectedCategoryRef)?.children.map((sub) => (
                <option key={sub} value={sub} style={{ backgroundColor: 'var(--color-bg-primary)' }}>{sub}</option>
              ))}
            </select>
          )}
        </div>
        {platformCategoryValue && categoryPlacement.status === 'unmapped' && (
          <div style={{ marginTop: '8px', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5 }}>
            「{platformCategoryValue}」没有归位到{platformDisplayName(targetPlatform)}的投稿分类：{categoryPlacement.reason}。该平台可用大类：{categoryPlacement.availableGroups.join('、')}。分类是执行前提，系统不会自动改写——请改选该平台投稿分类里的大类/子类。
          </div>
        )}
        </>}
      </div>

      {/* 目标读者（可选，写入创作宪法 targetAudience） */}
      {hasVerifiedCategoryOptions && <>
      <div style={s.sectionTitle}>目标读者（可选）</div>
      <div style={{ marginBottom: '28px' }}>
        <select
          value={targetAudience}
          onChange={(e) => store.setTargetAudience(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px', color: targetAudience ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none',
          }}
        >
          <option value="" style={{ backgroundColor: 'var(--color-bg-primary)' }}>不限定</option>
          {unionOptions(audienceOptions, targetAudience ? [targetAudience] : []).map((audience) => (
            <option key={audience} value={audience} style={{ backgroundColor: 'var(--color-bg-primary)' }}>{audience}</option>
          ))}
        </select>
      </div>
      </>}

      {/* 这里曾把创作设定全删成仅投稿分类/作品标签，导致新书六维空值。候选与书内表单同源。 */}
      <div style={s.sectionTitle}>情绪氛围（可多选）</div>
      <MultiSelectDropdown label="情绪氛围" options={unionOptions(toneOptions, selectedTones).map((item) => ({ value: item, label: item }))}
        value={selectedTones} onToggle={store.toggleTone} placeholder="选择情绪氛围" />
      <div style={s.sectionTitle}>文风（可多选）</div>
      <MultiSelectDropdown label="文风" options={unionOptions(styleOptions, selectedWritingStyles).map((item) => ({ value: item, label: item }))}
        value={selectedWritingStyles} onToggle={store.toggleWritingStyle} placeholder="选择文风" />
      <div style={s.sectionTitle}>创作流派（可多选）</div>
      <MultiSelectDropdown label="创作流派"
        options={unionOptions(creativeGenres, selectedGenres).map((genre) => ({ value: genre, label: genre }))}
        value={selectedGenres} onToggle={store.toggleGenre}
        placeholder="选择创作流派" />
      <div style={s.sectionTitle}>{fieldNames.genre || '投稿标签（如平台后台有此项）'}（可多选）</div>
      <MultiSelectDropdown label={fieldNames.genre || '投稿标签'}
        options={unionOptions(submissionOptions, selectedSubmissionTags).map((item) => ({ value: item, label: item }))}
        value={selectedSubmissionTags} onToggle={store.toggleSubmissionTag} onAdd={store.toggleSubmissionTag}
        addPlaceholder="填写投稿后台实际标签" placeholder="选择投稿标签" />
      {categoryPlacement.status === 'resolved'
        && platformCategoryDimensionBinding(targetPlatform, categoryPlacement.value, 'genre', selectedSubmissionTags.join('、'), storyType).gap
        && <textarea value={genreFitNote} onChange={(event) => store.setGenreFitNote(event.target.value)}
          placeholder="标签与分类契合依据：这些标签如何兑现该分类的读者预期" rows={2}
          style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--color-text-primary)', resize: 'vertical' }} />}
      <div style={s.sectionTitle}>情节取向（可多选）</div>
      <MultiSelectDropdown label="情节取向"
        options={unionOptions(plotOptions, selectedPlotTags).map((item) => ({ value: item, label: item }))}
        value={selectedPlotTags} onToggle={store.togglePlotTag} placeholder="选择情节取向" />
      <div style={s.sectionTitle}>叙事视角</div>
      <select value={narrativePov} onChange={(event) => store.setNarrativePov(event.target.value)}
        style={{ width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--color-text-primary)' }}>
        <option value="">选择叙事视角...</option>
        {unionOptions(povOptions, narrativePov ? [narrativePov] : []).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>

      {/* 开始按钮 */}
      <button
        style={s.startBtn}
        onClick={() => { if (isGenerating) { store.setStep(1); return; } handleStartDiscovery(); }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent)'; }}
      >
        {isGenerating ? '⏳ 返回发现进度（生成中…）' : '🚀 AI深度发现题材'}
      </button>

      {/* 自定义题材入口 */}
      <div style={{ marginTop: '16px', marginBottom: '8px' }}>
        <div
          style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          onClick={() => setShowCustom(!showCustom)}
        >
          {showCustom ? '▼' : '▶'} 或者，自己输入题材 →
        </div>
      </div>
      {showCustom && (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '12px' }}>✍️ 自定义题材</div>

          {/* 题材标题（必填） */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>题材标题 *</div>
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="例如：系统觉醒，从失业到逆袭"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 钩子 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>故事钩子</div>
            <input
              value={customHook}
              onChange={(e) => setCustomHook(e.target.value)}
              placeholder="一句话吸引读者，例如：一睁眼，我成了北洋军阀的弃子"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 故事描述 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>故事描述</div>
            <textarea
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="详细描述你的故事创意..."
              rows={3}
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
            />
          </div>

          {/* 主角设定 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>主角设定</div>
            <input
              value={customProtagonist}
              onChange={(e) => setCustomProtagonist(e.target.value)}
              placeholder="例如：现代历史系研究生，睁眼回到动荡年代"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 核心冲突 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>核心冲突</div>
            <input
              value={customConflict}
              onChange={(e) => setCustomConflict(e.target.value)}
              placeholder="例如：要在军阀混战中活下来，还要改变历史走向"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 独特卖点 */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)', marginBottom: '4px' }}>独特卖点</div>
            <input
              value={customUnique}
              onChange={(e) => setCustomUnique(e.target.value)}
              placeholder="例如：历史考据+系统金手指+群像叙事"
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* 提交按钮 */}
          <button
            disabled={!customTitle.trim()}
            style={{
              width: '100%', padding: '10px', backgroundColor: customTitle.trim() ? 'var(--color-success)' : 'rgba(255,255,255,0.04)',
              border: 'none', borderRadius: '8px', color: 'var(--color-white)', fontSize: 'var(--font-size-xs)', fontWeight: 600, fontFamily: 'inherit',
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
            onMouseEnter={(e) => { if (customTitle.trim()) e.currentTarget.style.backgroundColor = 'var(--color-success)'; }}
            onMouseLeave={(e) => { if (customTitle.trim()) e.currentTarget.style.backgroundColor = 'var(--color-success)'; }}
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
          <div style={{ ...s.genText, fontSize: 'var(--font-size-xs)', opacity: 0.5, marginTop: '4px' }}>
            每条题材都会独立生成并通过结构、吸引力与篇幅一致性检查
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
                color: 'var(--color-text-dim)',
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
                color: 'var(--color-text-muted)',
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
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            AI从不同角度生成了以下 {ideas.length} 个题材，点击卡片可查看详情
            {prevTitles.length > ideas.length && (
              <span style={{ color: 'var(--color-warning)', marginLeft: '8px' }}>
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
                color: 'var(--color-text-soft)',
                fontSize: 'var(--font-size-xs)',
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
          {ideas.map((idea, idx) => {
            const existingProject = findProjectForIdea(projects, idea);
            return <IdeaCard key={`idea-${idx}`} idea={idea} onClick={handleSelectIdea}
              existingProject={existingProject ? { id: existingProject.id, status: existingProject.status } : undefined}
              onOpenProject={(id) => openProject(id, existingProject?.title || idea.title, navigate)} />;
          })}
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
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>总进度</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)', fontWeight: 600 }}>{creationProgress}%</span>
          </div>
          <div style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${creationProgress}%`, backgroundColor: isDone ? 'var(--color-success)' : 'var(--color-accent)', borderRadius: '2px', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {(storyType === 'long_novel'
          ? [CREATION_STEPS[0], CREATION_STEPS[1], CREATION_STEPS[2], CREATION_STEPS[4], CREATION_STEPS[3], ...CREATION_STEPS.slice(5)]
          : [CREATION_STEPS[0], ...CREATION_STEPS.slice(2)]).map((cs) => {
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
                fontSize: 'var(--font-size-xs)', fontWeight: 700, flexShrink: 0,
                backgroundColor: isFailed ? 'rgba(231,76,60,0.16)' : isStepDone ? 'rgba(46,204,113,0.15)' : isRunning ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.04)',
                color: isFailed ? 'var(--color-danger)' : isStepDone ? 'var(--color-success)' : isRunning ? 'var(--color-accent)' : 'var(--color-text-muted)',
              }}>
                {isStepDone ? '✓' : isFailed ? '!' : isRunning ? (
                  <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                ) : '○'}
              </div>

              {/* 步骤名 + 进度条 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: isRunning ? 'var(--color-text-primary)' : isStepDone ? 'var(--color-text-soft)' : 'var(--color-text-muted)', fontWeight: isRunning ? 600 : 400 }}>
                    {cs.label}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: isFailed ? 'var(--color-danger)' : isStepDone ? 'var(--color-success)' : isRunning ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {isFailed ? '失败' : isStepDone ? '完成' : isRunning ? '进行中...' : '等待中'}
                  </span>
                </div>
                <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: isStepDone ? '100%' : isFailed ? '100%' : isRunning ? '60%' : '0%',
                    backgroundColor: isStepDone ? 'var(--color-success)' : isFailed ? 'var(--color-danger)' : 'var(--color-accent)',
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
            <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>AI 正在调用大模型，通常需要 2-5 分钟...</span>
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
            <div style={{ marginTop: '16px', padding: '10px', backgroundColor: 'rgba(243,156,18,0.1)', borderRadius: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', maxHeight: '120px', overflowY: 'auto' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚠️ 生成过程记录：</div>
              {creationWarnings.slice(0, 5).map((w, i) => <div key={i} style={{ marginBottom: '2px' }}>• {w}</div>)}
              {creationWarnings.length > 5 && <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)' }}>...还有 {creationWarnings.length - 5} 条警告</div>}
            </div>
          )}

          {creationErrors.length > 0 && (
            <div style={{ marginTop: '16px', padding: '10px', backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
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
                      width: '100%', padding: '12px', backgroundColor: 'var(--color-accent)',
                      border: 'none', borderRadius: '8px', color: 'var(--color-white)',
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
                      color: 'var(--color-accent)', fontSize: 'var(--font-size-xs)', fontWeight: 600,
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
                      color: 'var(--color-text-dim)', fontSize: 'var(--font-size-xs)', fontWeight: 600,
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
                  width: '100%', padding: '12px', backgroundColor: 'var(--color-accent)',
                  border: 'none', borderRadius: '8px', color: 'var(--color-white)',
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
                color: 'var(--color-text-dim)',
                fontSize: 'var(--font-size-xs)',
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
