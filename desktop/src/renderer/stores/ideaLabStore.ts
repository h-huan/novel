/**
 * ideaLabStore - 想法孵化状态管理
 *
 * 状态包括:
 * - draft: 当前草稿
 * - loading / error
 * - questions / answers
 * - refinedIdea / maturityScore / maturityReport
 *
 * 方法包括:
 * - createDraft
 * - fetchDraft
 * - generateQuestions
 * - saveAnswers
 * - refineIdea
 * - confirmIdea
 * - convertToProject
 */
import { create } from 'zustand';
import { api } from '../lib/api';

// ========== 类型定义 ==========

export interface QuestionItem {
  id: string;
  question: string;
  reason: string;
}

export interface AnswerItem {
  questionId: string;
  answer: string;
}

export interface RefinedIdea {
  titleSuggestions: string[];
  oneLineHook: string;
  protagonist: string;
  coreConflict: string;
  worldSeed: string;
  characterSeed: string;
  organizationSeed: string;
  sellingPoints: string[];
  platformFit: string;
  storyType: string;
  targetAudience: string;
  shortStoryFit: string;
  longNovelFit: string;
  recommendedType: string;
  nextStep: string;
}

export interface MaturityReport {
  strengths: string[];
  missingItems: string[];
  risks: string[];
  canConvertToProject: boolean;
  evaluatedItems: number;
  satisfiedItems: number;
}

export interface IdeaDraft {
  id: string;
  rawIdea: string;
  title: string;
  projectType: string;
  targetPlatform: string;
  customPlatformNote: string;
  targetWords: number;
  description: string;
  status: 'draft' | 'questioning' | 'answered' | 'refining' | 'refined' | 'confirmed' | 'converted';
  questions: QuestionItem[];
  answers: AnswerItem[];
  refinedIdea: RefinedIdea | null;
  maturityScore: number;
  maturityReport: MaturityReport | null;
  confirmedIdea: string;
  convertedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDraftData {
  rawIdea: string;
  projectType: string;
  targetPlatform: string;
  customPlatformNote?: string;
  targetWords?: number;
  title?: string;
  description?: string;
}

/** 想法转项目时随创建请求提交的执行标准（平台/分类/基调/文风/流派/视角/目标读者）。 */
export interface ConvertToProjectData {
  title?: string;
  confirmedIdea?: string;
  targetPlatform?: string;
  /** 目标总字数（正文总字数）：「分类」维的平台侧判据输入，必须原样透传，缺省则沿用草稿上的值。 */
  targetWords?: number;
  customPlatformNote?: string;
  category?: string;
  storyTone?: string[];
  writingStyle?: string[];
  webNovelGenre?: string[];
  pov?: string;
  targetAudience?: string;
}

// ========== Store 定义 ==========

interface IdeaLabState {
  draft: IdeaDraft | null;
  loading: boolean;
  error: string | null;
  createDraft: (data: CreateDraftData) => Promise<IdeaDraft>;
  fetchDraft: (id: string) => Promise<IdeaDraft>;
  generateQuestions: (id: string) => Promise<void>;
  saveAnswers: (id: string, answers: AnswerItem[]) => Promise<void>;
  refineIdea: (id: string) => Promise<void>;
  confirmIdea: (id: string, confirmedIdea?: string) => Promise<void>;
  convertToProject: (id: string, data?: ConvertToProjectData) => Promise<any>;
  reset: () => void;
}

export const useIdeaLabStore = create<IdeaLabState>((set, get) => ({
  draft: null,
  loading: false,
  error: null,

  /**
   * 创建想法草稿
   */
  createDraft: async (data: CreateDraftData) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<IdeaDraft>('/idea-lab/drafts', {
        rawIdea: data.rawIdea,
        projectType: data.projectType,
        targetPlatform: data.targetPlatform,
        customPlatformNote: data.customPlatformNote,
        targetWords: data.targetWords,
        title: data.title || '',
        description: data.description || '',
      });
      const draft = (res as any).data ?? res;
      set({ draft: draft as IdeaDraft, loading: false });
      return draft as IdeaDraft;
    } catch (err: any) {
      const msg = err.message || '创建想法草稿失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 获取草稿详情
   */
  fetchDraft: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<IdeaDraft>(`/idea-lab/drafts/${id}`);
      const draft = (res as any).data ?? res;
      set({ draft: draft as IdeaDraft, loading: false });
      return draft as IdeaDraft;
    } catch (err: any) {
      const msg = err.message || '获取想法草稿失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 生成追问问题
   */
  generateQuestions: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<any>(`/idea-lab/drafts/${id}/questions`);
      const result = (res as any).data ?? res;
      set((state) => ({
        loading: false,
        draft: state.draft
          ? {
              ...state.draft,
              questions: result.questions || [],
              status: 'questioning',
            }
          : null,
      }));
    } catch (err: any) {
      const msg = err.message || '生成追问失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 保存回答
   */
  saveAnswers: async (id: string, answers: AnswerItem[]) => {
    set({ loading: true, error: null });
    try {
      const res = await api.put<any>(`/idea-lab/drafts/${id}/answers`, { answers });
      const result = (res as any).data ?? res;
      set((state) => ({
        loading: false,
        draft: state.draft
          ? {
              ...state.draft,
              answers: result.answers || answers,
              status: 'answered',
            }
          : null,
      }));
    } catch (err: any) {
      const msg = err.message || '保存回答失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 完善想法
   */
  refineIdea: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<any>(`/idea-lab/drafts/${id}/refine`);
      const result = (res as any).data ?? res;
      set((state) => ({
        loading: false,
        draft: state.draft
          ? {
              ...state.draft,
              refinedIdea: result.refinedIdea || null,
              maturityScore: result.maturityScore || 0,
              maturityReport: result.maturityReport || null,
              status: 'refined',
            }
          : null,
      }));
    } catch (err: any) {
      const msg = err.message || '完善想法失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 确认想法
   */
  confirmIdea: async (id: string, confirmedIdea?: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<any>(`/idea-lab/drafts/${id}/confirm`, {
        confirmedIdea: confirmedIdea || '',
      });
      const result = (res as any).data ?? res;
      set((state) => ({
        loading: false,
        draft: state.draft
          ? {
              ...state.draft,
              confirmedIdea: result.confirmedIdea || confirmedIdea || '',
              status: 'confirmed',
            }
          : null,
      }));
    } catch (err: any) {
      const msg = err.message || '确认想法失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 转换为项目
   */
  convertToProject: async (id: string, data?: ConvertToProjectData) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post<any>(`/idea-lab/drafts/${id}/convert-to-project`, {
        title: data?.title || '',
        confirmedIdea: data?.confirmedIdea || '',
        // 执行标准必须原样透传：缺项由后端用同一份判据阻断，这里不做默认值、不做静默省略。
        targetPlatform: data?.targetPlatform,
        targetWords: data?.targetWords,
        customPlatformNote: data?.customPlatformNote,
        category: data?.category,
        storyTone: data?.storyTone,
        writingStyle: data?.writingStyle,
        webNovelGenre: data?.webNovelGenre,
        pov: data?.pov,
        targetAudience: data?.targetAudience,
      });
      const result = (res as any).data ?? res;
      set((state) => ({
        loading: false,
        draft: state.draft
          ? {
              ...state.draft,
              convertedProjectId: result.projectId || result.project?.id,
              status: 'converted',
            }
          : null,
      }));
      return result.project || result;
    } catch (err: any) {
      const msg = err.message || '创建项目失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  /**
   * 重置状态
   */
  reset: () => {
    set({ draft: null, loading: false, error: null });
  },
}));
