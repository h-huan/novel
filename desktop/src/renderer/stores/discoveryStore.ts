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

interface CreationStepStatus {
  project: 'pending' | 'running' | 'done' | 'failed';
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
  platform: string;
  selectedTones: string[];
  targetWords: string;
  selectedCategory: string;
  selectedSubCategory: string;

  // Step 2: 发现
  isGenerating: boolean;
  genProgress: string;
  ideas: DiscoveryIdea[];
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
  setPlatform: (platform: string) => void;
  setSelectedTones: (tones: string[]) => void;
  toggleTone: (tag: string) => void;
  setTargetWords: (words: string) => void;
  setSelectedCategory: (category: string) => void;
  setSelectedSubCategory: (sub: string) => void;

  setGenerating: (isGenerating: boolean) => void;
  setGenProgress: (progress: string) => void;
  setIdeas: (ideas: DiscoveryIdea[]) => void;
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
  world: 'pending', orgs: 'pending', foreshadowing: 'pending', timeline: 'pending', done: 'pending',
};

const INITIAL_STATE = {
  step: 0,
  storyType: 'short_story' as const,
  platform: 'fanqie',
  selectedTones: [] as string[],
  targetWords: '',
  selectedCategory: '',
  selectedSubCategory: '',

  isGenerating: false,
  genProgress: '',
  ideas: [] as DiscoveryIdea[],
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
      setStoryType: (storyType) => set({ storyType }),
      setPlatform: (platform) => set({ platform }),
      setSelectedTones: (selectedTones) => set({ selectedTones }),
      toggleTone: (tag) => set((s) => ({
        selectedTones: s.selectedTones.includes(tag)
          ? s.selectedTones.filter((t) => t !== tag)
          : [...s.selectedTones, tag],
      })),
      setTargetWords: (targetWords) => set({ targetWords }),
      setSelectedCategory: (selectedCategory) => set({ selectedCategory, selectedSubCategory: '' }),
      setSelectedSubCategory: (selectedSubCategory) => set({ selectedSubCategory }),

      setGenerating: (isGenerating) => set({ isGenerating }),
      setGenProgress: (genProgress) => set({ genProgress }),
      setIdeas: (ideas) => set({ ideas }),
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
        isGenerating: false, genProgress: '', ideas: [], generationDone: false,
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
        platform: state.platform,
        selectedTones: state.selectedTones,
        targetWords: state.targetWords,
        selectedCategory: state.selectedCategory,
        selectedSubCategory: state.selectedSubCategory,
        // === 发现结果（可跨会话保留，用户可回顾）===
      }),
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
