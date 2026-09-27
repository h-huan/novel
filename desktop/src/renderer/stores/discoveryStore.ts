/**
 * 灵感发现状态管理 Store
 * 保存灵感发现的完整状态，使得切换页面回来能恢复之前的状态
 * 包括：配置、发现结果、创建进度、SSE 连接状态
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DiscoveryIdea {
  title: string;
  hook?: string;
  description?: string;
  protagonist?: string;
  conflict?: string;
  uniqueSelling?: string;
  angle?: string;
  styleTags?: string[];
  characters?: string[];
  storyCore?: string;
  estimatedWords?: number | string;
  plannedChapters?: number;
  scopeReason?: string;
  scopeBreakdown?: Array<{ arc: string; chapters: number; reason: string }>;
  alternateTitles?: string[];
}

interface ExcludeDetail {
  title: string;
  hook?: string;
  description?: string;
}

export interface CreationStepStatus {
  project: 'pending' | 'running' | 'done' | 'failed';
  skeleton: 'pending' | 'running' | 'done' | 'failed';
  outline: 'pending' | 'running' | 'done' | 'failed';
  characters: 'pending' | 'running' | 'done' | 'failed';
  world: 'pending' | 'running' | 'done' | 'failed';
  orgs: 'pending' | 'running' | 'done' | 'failed';
  foreshadowing: 'pending' | 'running' | 'done' | 'failed';
  timeline: 'pending' | 'running' | 'done' | 'failed';
  done: 'pending' | 'running' | 'done' | 'failed';
}

interface DiscoveryState {
  // Step 1: 配置
  step: number;
  storyType: 'short_story' | 'long_novel';
  /** 目标平台 = 执行标准里的「平台」这一维。字段名与 ExecutionStandardsValue.targetPlatform 一致，
   *  这样前端唯一的平台判据 platformStandardProblem(state) 可以直接吃整个 store，不必再加一层适配。 */
  targetPlatform: string;
  /** 自定义平台说明：targetPlatform === 'custom' 时它就是「平台」这一维的执行值本身；为空即未执行标准，创建与生成都会被阻断。 */
  customPlatformNote: string;
  selectedTones: string[];
  selectedWritingStyles: string[];
  selectedGenres: string[];
  selectedSubmissionTags: string[];
  selectedPlotTags: string[];
  genreFitNote: string;
  targetWords: string;
  selectedCategory: string;
  selectedSubCategory: string;
  /** 叙事视角：写入创作宪法 pov，决定正文人称与信息范围；空值就是这项执行标准未执行（不是不适用） */
  narrativePov: string;
  /** 目标读者：写入创作宪法 targetAudience；空值表示不限定 */
  targetAudience: string;
  /**
   * 分类体量取舍依据：目标总字数刻意偏离该平台分类头部实测区间时必填。
   *
   * 它是执行标准「分类」维自己给出的合规路径（标准原文「确有取舍必须写在项目卡片上」），
   * 与目标总字数同属一个维度，所以必须跨会话保留 —— 少了它，区间外的体量只能被硬阻断，
   * 那条合规路径就只是一句文案承诺。
   */
  categoryWordScaleDeviation: string;

  // Step 2: 发现
  isGenerating: boolean;
  genProgress: string;
  ideas: DiscoveryIdea[];
  /** 本批灵感生成时的六维与篇幅配置；选择题材前校验，防止改了设定仍创建旧结果。 */
  generatedSignature: string | null;
  generationDone: boolean;
  prevTitles: string[];
  excludeDetails: ExcludeDetail[];

  // Step 3: 创建
  isCreating: boolean;
  creationProgress: number;
  creationErrors: string[];
  creationWarnings: string[];
  createdProjectId: string | null;
  /** 已创建项目的标题（用于打开项目时显示） */
  createdProjectTitle: string | null;
  creationStepStatus: CreationStepStatus;

  // SSE 连接追踪（用于跨页面恢复）
  /** 是否有一个正在进行的 SSE 创建流程 */
  hasActiveCreation: boolean;
  /** 正在创建的 projectId（用于重新连接 SSE） */
  activeCreationProjectId: string | null;

  // Actions
  setStep: (step: number) => void;
  setStoryType: (type: 'short_story' | 'long_novel') => void;
  setTargetPlatform: (targetPlatform: string) => void;
  setCustomPlatformNote: (note: string) => void;
  setSelectedTones: (tones: string[]) => void;
  toggleTone: (tag: string) => void;
  toggleWritingStyle: (style: string) => void;
  toggleGenre: (genre: string) => void;
  toggleSubmissionTag: (tag: string) => void;
  togglePlotTag: (tag: string) => void;
  setGenreFitNote: (note: string) => void;
  setTargetWords: (words: string) => void;
  setSelectedCategory: (category: string) => void;
  setSelectedSubCategory: (sub: string) => void;
  setNarrativePov: (pov: string) => void;
  setTargetAudience: (audience: string) => void;
  setCategoryWordScaleDeviation: (value: string) => void;

  setGenerating: (isGenerating: boolean) => void;
  setGenProgress: (progress: string) => void;
  setIdeas: (ideas: DiscoveryIdea[]) => void;
  setGeneratedSignature: (signature: string | null) => void;
  setGenerationDone: (done: boolean) => void;
  addPrevTitles: (titles: string[]) => void;
  addExcludeDetails: (details: ExcludeDetail[]) => void;

  setCreating: (isCreating: boolean) => void;
  setCreationProgress: (progress: number) => void;
  setCreationErrors: (errors: string[]) => void;
  setCreationWarnings: (warnings: string[]) => void;
  setCreatedProjectId: (id: string | null) => void;
  setCreatedProjectTitle: (title: string | null) => void;
  setCreationStepStatus: (status: Partial<CreationStepStatus> | ((prev: CreationStepStatus) => CreationStepStatus)) => void;

  setHasActiveCreation: (active: boolean) => void;
  setActiveCreationProjectId: (id: string | null) => void;

  /** 完全重置 */
  reset: () => void;
  /** 重置发现/创建状态，但保留配置 */
  resetDiscovery: () => void;
}

const INITIAL_STEP_STATUS: CreationStepStatus = {
  project: 'pending', outline: 'pending', characters: 'pending',
  skeleton: 'pending', world: 'pending', orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
};

const INITIAL_STATE = {
  step: 0,
  storyType: 'short_story' as const,
  // 不预设平台：平台是执行前提，不能由系统替用户先选好一个（那等于用一个默认值冒充标准）。
  targetPlatform: '',
  customPlatformNote: '',
  selectedTones: [] as string[],
  selectedWritingStyles: [] as string[],
  selectedGenres: [] as string[],
  selectedSubmissionTags: [] as string[],
  selectedPlotTags: [] as string[],
  genreFitNote: '',
  targetWords: '',
  selectedCategory: '',
  selectedSubCategory: '',
  narrativePov: '',
  targetAudience: '',
  categoryWordScaleDeviation: '',

  isGenerating: false,
  genProgress: '',
  ideas: [] as DiscoveryIdea[],
  generatedSignature: null as string | null,
  generationDone: false,
  prevTitles: [] as string[],
  excludeDetails: [] as ExcludeDetail[],

  isCreating: false,
  creationProgress: 0,
  creationErrors: [] as string[],
  creationWarnings: [] as string[],
  createdProjectId: null as string | null,
  createdProjectTitle: null as string | null,
  creationStepStatus: { ...INITIAL_STEP_STATUS },

  hasActiveCreation: false,
  activeCreationProjectId: null as string | null,
};

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setStep: (step) => set({ step }),
      // 这里曾只清空分类、不清空发现结果，后果是切到短篇后旧长篇题材卡仍显示为当前结果。
      setStoryType: (storyType) => set((state) => state.storyType === storyType ? state : {
        storyType, selectedCategory: '', selectedSubCategory: '', selectedSubmissionTags: [], genreFitNote: '', targetAudience: '',
        ideas: [], generatedSignature: null, generationDone: false, prevTitles: [], excludeDetails: [],
      }),
      // 这里曾把作者基调/文风也当作平台投稿标签一并清空，切平台就丢掉创作意图。
      // 只清空平台分类和与分类绑定的流派/作品标签；情节与创作手法保留供作者复核。
      setTargetPlatform: (targetPlatform) => set((state) => state.targetPlatform === targetPlatform ? state : ({
        targetPlatform, selectedCategory: '', selectedSubCategory: '', targetAudience: '',
        selectedSubmissionTags: [], genreFitNote: '',
        ideas: [], generatedSignature: null, generationDone: false, prevTitles: [], excludeDetails: [],
      })),
      setCustomPlatformNote: (customPlatformNote) => set({ customPlatformNote }),
      setSelectedTones: (selectedTones) => set({ selectedTones }),
      toggleTone: (tag) => set((s) => ({
        selectedTones: s.selectedTones.includes(tag)
          ? s.selectedTones.filter((t) => t !== tag)
          : [...s.selectedTones, tag],
      })),
      toggleWritingStyle: (style) => set((s) => ({
        selectedWritingStyles: s.selectedWritingStyles.includes(style)
          ? s.selectedWritingStyles.filter((item) => item !== style)
          : [...s.selectedWritingStyles, style],
      })),
      toggleGenre: (genre) => set((s) => ({
        selectedGenres: s.selectedGenres.includes(genre)
          ? s.selectedGenres.filter((item) => item !== genre)
          : [...s.selectedGenres, genre],
      })),
      toggleSubmissionTag: (tag) => set((s) => ({
        selectedSubmissionTags: s.selectedSubmissionTags.includes(tag)
          ? s.selectedSubmissionTags.filter((item) => item !== tag)
          : [...s.selectedSubmissionTags, tag],
      })),
      togglePlotTag: (tag) => set((s) => ({
        selectedPlotTags: s.selectedPlotTags.includes(tag)
          ? s.selectedPlotTags.filter((item) => item !== tag)
          : [...s.selectedPlotTags, tag],
      })),
      setGenreFitNote: (genreFitNote) => set({ genreFitNote }),
      setTargetWords: (targetWords) => set({ targetWords }),
      setSelectedCategory: (selectedCategory) => set({ selectedCategory, selectedSubCategory: '', selectedSubmissionTags: [], genreFitNote: '' }),
      setSelectedSubCategory: (selectedSubCategory) => set({ selectedSubCategory, selectedSubmissionTags: [], genreFitNote: '' }),
      setNarrativePov: (narrativePov) => set({ narrativePov }),
      setTargetAudience: (targetAudience) => set({ targetAudience }),
      setCategoryWordScaleDeviation: (categoryWordScaleDeviation) => set({ categoryWordScaleDeviation }),

      setGenerating: (isGenerating) => set({ isGenerating }),
      setGenProgress: (genProgress) => set({ genProgress }),
      setIdeas: (ideas) => set({ ideas }),
      setGeneratedSignature: (generatedSignature) => set({ generatedSignature }),
      setGenerationDone: (generationDone) => set({ generationDone }),
      addPrevTitles: (titles) => set((s) => ({ prevTitles: [...s.prevTitles, ...titles] })),
      addExcludeDetails: (details) => set((s) => ({ excludeDetails: [...s.excludeDetails, ...details] })),

      setCreating: (isCreating) => set({ isCreating }),
      setCreationProgress: (creationProgress) => set({ creationProgress }),
      setCreationErrors: (creationErrors) => set({ creationErrors }),
      setCreationWarnings: (creationWarnings) => set({ creationWarnings }),
      setCreatedProjectId: (createdProjectId) => set({ createdProjectId }),
      setCreatedProjectTitle: (createdProjectTitle) => set({ createdProjectTitle }),
      setCreationStepStatus: (status) => set((s) => ({
        creationStepStatus: typeof status === 'function'
          ? status(s.creationStepStatus)
          : { ...s.creationStepStatus, ...status },
      })),

      setHasActiveCreation: (hasActiveCreation) => set({ hasActiveCreation }),
      setActiveCreationProjectId: (activeCreationProjectId) => set({ activeCreationProjectId }),

      reset: () => set({ ...INITIAL_STATE, creationStepStatus: { ...INITIAL_STEP_STATUS } }),
      resetDiscovery: () => set({
        isGenerating: false, genProgress: '', ideas: [], generatedSignature: null, generationDone: false,
        prevTitles: [], excludeDetails: [],
      }),
    }),
    {
      name: 'discovery-store',
      // 只持久化用户配置和发现结果（跨会话有意义的）
      // ❌ 不持久化以下瞬时状态：
      //   - step（向导位置，刷新后应重新判断）
      //   - isGenerating / genProgress（生成中状态）
      //   - 创建流程全部状态（isCreating、progress、stepStatus、errors、warnings、projectId）
      //   - SSE 连接追踪（页面刷新后连接已断）
      partialize: (state) => ({
        // === 用户配置（可跨会话保留）===
        storyType: state.storyType,
        targetPlatform: state.targetPlatform,
        selectedTones: state.selectedTones,
        selectedWritingStyles: state.selectedWritingStyles,
        selectedGenres: state.selectedGenres,
        selectedSubmissionTags: state.selectedSubmissionTags,
        selectedPlotTags: state.selectedPlotTags,
        genreFitNote: state.genreFitNote,
        targetWords: state.targetWords,
        selectedCategory: state.selectedCategory,
        selectedSubCategory: state.selectedSubCategory,
        narrativePov: state.narrativePov,
        targetAudience: state.targetAudience,
        customPlatformNote: state.customPlatformNote,
        categoryWordScaleDeviation: state.categoryWordScaleDeviation,
        // === 发现结果（可跨会话保留，用户可回顾）===
      }),
      version: 3,
      migrate: (persisted, version) => {
        const old = persisted as Partial<DiscoveryState>;
        // v2 的 selectedGenres 曾同时承载番茄作品标签和创作流派，不能迁入新流派字段。
        // 仅在番茄长篇可识别为旧投稿标签时迁入新字段；其余值要求作者重选，防风格串位。
        if (version === 2) return {
          storyType: old.storyType === 'long_novel' ? 'long_novel' as const : 'short_story' as const,
          targetPlatform: old.targetPlatform || '',
          selectedTones: old.selectedTones || [],
          selectedWritingStyles: old.selectedWritingStyles || [],
          selectedGenres: [],
          selectedSubmissionTags: old.targetPlatform === 'fanqie' && old.storyType === 'long_novel' ? old.selectedGenres || [] : [],
          selectedPlotTags: old.selectedPlotTags || [],
          genreFitNote: old.genreFitNote || '',
          targetWords: old.targetWords || '',
          selectedCategory: old.selectedCategory || '',
          selectedSubCategory: old.selectedSubCategory || '',
          narrativePov: old.narrativePov || '',
          targetAudience: old.targetAudience || '',
          customPlatformNote: old.customPlatformNote || '',
          categoryWordScaleDeviation: old.categoryWordScaleDeviation || '',
        };
        // 旧版 selectedTones 同时包含基调/文风/流派，无法无损判别；要求作者重新明确三维。
        return {
          storyType: old.storyType === 'long_novel' ? 'long_novel' as const : 'short_story' as const,
          targetPlatform: old.targetPlatform || '',
          selectedTones: [], selectedWritingStyles: [], selectedGenres: [],
          selectedSubmissionTags: [],
          selectedPlotTags: [],
          genreFitNote: '',
          targetWords: old.targetWords || '',
          selectedCategory: old.selectedCategory || '',
          selectedSubCategory: old.selectedSubCategory || '',
          narrativePov: old.narrativePov || '',
          targetAudience: old.targetAudience || '',
          customPlatformNote: old.customPlatformNote || '',
          categoryWordScaleDeviation: old.categoryWordScaleDeviation || '',
        };
      },
      // 清理旧版 localStorage 中残留的瞬时状态（partialize 不再写这些字段，
      // 但旧存储中仍有，zustand hydration 时会读回来造成 UI 污染）
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // 检测是否有脏数据（任何创建流程的非默认值）
        const hasDirtyCreation = (
          state.isCreating ||
          state.creationProgress > 0 ||
          state.creationErrors.length > 0 ||
          state.creationWarnings.length > 0 ||
          state.createdProjectId !== null ||
          state.step > 0 ||
          state.creationStepStatus.done === 'done'
        );
        const hasOldDiscoveryResults = state.ideas.length > 0 || state.generationDone || state.prevTitles.length > 0 || state.excludeDetails.length > 0;
        if (hasDirtyCreation || hasOldDiscoveryResults) {
          console.log('[discovery-store] 检测到旧版残留数据，清理中...');
          // 只重置瞬时状态，保留用户配置和发现结果
          state.isGenerating = false;
          state.genProgress = '';
          state.isCreating = false;
          state.creationProgress = 0;
          state.creationErrors = [];
          state.creationWarnings = [];
          state.createdProjectId = null;
          state.createdProjectTitle = null;
          state.step = 0;
          state.ideas = [];
          state.generationDone = false;
          state.prevTitles = [];
          state.excludeDetails = [];
          state.creationStepStatus = { ...INITIAL_STEP_STATUS };
          state.hasActiveCreation = false;
          state.activeCreationProjectId = null;
        }
      },
    },
  ),
);
