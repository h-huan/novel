/**
 * 章节状态管理 Store
 * 通过 REST API 管理真实章节数据
 */
import { create } from 'zustand';
import { api } from '../lib/api';
import type { Chapter, ChapterStatus } from '@novel/shared';

interface CreateChapterDto {
  title: string;
  volumeIndex: number;
  chapterIndex: number;
  projectId: string;
  outlineId?: string;
}

interface UpdateChapterDto {
  title?: string;
  content?: string;
  status?: ChapterStatus;
}

interface ChapterState {
  chapters: Chapter[];
  currentChapter: Chapter | null;
  loading: boolean;

  fetchChapters: (projectId: string, forceRefresh?: boolean) => Promise<void>;
  createChapter: (data: CreateChapterDto) => Promise<Chapter | null>;
  updateChapter: (id: string, data: UpdateChapterDto) => Promise<void>;
  lockChapter: (projectId: string, id: string) => Promise<void>;
  unlockChapter: (projectId: string, id: string) => Promise<void>;
  selectChapter: (projectId: string, id: string) => Promise<void>;
  setCurrentChapterContent: (content: string) => void;
}

function mapServerChapter(raw: any): Chapter {
  if (!raw) {
    console.warn('[mapServerChapter] raw is null/undefined, using defaults');
    return {
      id: '',
      projectId: '',
      outlineId: '',
      volumeIndex: 1,
      chapterIndex: 1,
      title: '数据异常',
      content: '',
      wordCount: 0,
      status: 'draft',
      tianLong8Steps: { goal: '', trigger: '', action: '', obstacle: '', misjudge: '', reversal: '', cost: '', hook: '' },
      modelConfig: { writerModel: 'gpt-4', temperature: 0.8, cost: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  return {
    id: raw.id || '',
    projectId: raw.projectId || '',
    outlineId: raw.outlineId || '',
    volumeIndex: raw.volumeIndex ?? 1,
    chapterIndex: raw.chapterIndex ?? 1,
    title: raw.title || '未命名章节',
    content: raw.content || '',
    wordCount: raw.wordCount ?? 0,
    status: raw.status || 'draft',
    tianLong8Steps: raw.tianLong8Steps || { goal: '', trigger: '', action: '', obstacle: '', misjudge: '', reversal: '', cost: '', hook: '' },
    modelConfig: raw.modelConfig || { writerModel: 'gpt-4', temperature: 0.8, cost: 0 },
    lockedAt: raw.lockedAt ? new Date(raw.lockedAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
  };
}

export const useChapterStore = create<ChapterState>((set, get) => ({
  chapters: [],
  currentChapter: null,
  loading: false,

  fetchChapters: async (projectId: string, forceRefresh = false) => {
    // 缓存检查：同一项目且已有数据则跳过，除非强制刷新
    if (!forceRefresh && get().chapters.length > 0) {
      const firstChapter = get().chapters[0];
      if (firstChapter && firstChapter.projectId === projectId) return;
    }
    set({ loading: true });
    try {
      const res = await api.get<any>(`/projects/${projectId}/chapters`);
      const list = res.data?.data ?? res.data ?? [];
      const chapters = Array.isArray(list) ? list.map(mapServerChapter) : [];
      set({ chapters, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createChapter: async (data: CreateChapterDto) => {
    try {
      const res = await api.post<any>(`/projects/${data.projectId}/chapters`, {
        title: data.title,
        volumeIndex: data.volumeIndex,
        chapterIndex: data.chapterIndex,
        outlineId: data.outlineId,
      });
      const ch = mapServerChapter(res.data);
      set((state) => ({
        chapters: [...state.chapters, ch],
        currentChapter: ch,
      }));
      return ch;
    } catch {
      return null;
    }
  },

  updateChapter: async (id: string, data: UpdateChapterDto) => {
    const chapter = get().chapters.find((c) => c.id === id);
    if (!chapter) return;
    try {
      const res = await api.put<any>(`/projects/${chapter.projectId}/chapters/${id}`, data);
      const updated = mapServerChapter(res.data);
      set((state) => ({
        chapters: state.chapters.map((c) => (c.id === id ? updated : c)),
        currentChapter: state.currentChapter?.id === id ? updated : state.currentChapter,
      }));
    } catch {
      // silent fail — content is saved locally by WritingPage auto-save
    }
  },

  lockChapter: async (projectId: string, id: string) => {
    try {
      await api.post(`/projects/${projectId}/chapters/${id}/lock`);
      set((state) => ({
        chapters: state.chapters.map((c) =>
          c.id === id ? { ...c, status: 'locked' as ChapterStatus, lockedAt: new Date() } : c),
        currentChapter: state.currentChapter?.id === id
          ? { ...state.currentChapter, status: 'locked' as ChapterStatus, lockedAt: new Date() } : state.currentChapter,
      }));
    } catch {}
  },

  unlockChapter: async (projectId: string, id: string) => {
    try {
      await api.post(`/projects/${projectId}/chapters/${id}/unlock`);
      set((state) => ({
        chapters: state.chapters.map((c) =>
          c.id === id ? { ...c, status: 'draft' as ChapterStatus, lockedAt: undefined } : c),
        currentChapter: state.currentChapter?.id === id
          ? { ...state.currentChapter, status: 'draft' as ChapterStatus, lockedAt: undefined } : state.currentChapter,
      }));
    } catch {}
  },

  selectChapter: async (projectId: string, id: string) => {
    // 先从列表缓存中获取基本信息
    const cached = get().chapters.find((ch) => ch.id === id) || null;
    if (cached) {
      // 如果已有 content（非空），直接使用缓存
      if (cached.content && cached.content.length > 0) {
        set({ currentChapter: cached });
        return;
      }
    }
    // content 为空或不在缓存中 → 单独请求完整章节数据
    try {
      const res = await api.get<any>(`/projects/${projectId}/chapters/${id}`);
      const full = mapServerChapter(res.data?.data ?? res.data);
      // 更新 chapters 数组中的对应条目
      set((state) => ({
        chapters: state.chapters.map((c) => (c.id === id ? full : c)),
        currentChapter: full,
      }));
    } catch (e) {
      // 请求失败时至少使用列表缓存的基本信息
      console.warn(`[selectChapter] 获取章节详情失败: ${e}`);
      set({ currentChapter: cached });
    }
  },

  setCurrentChapterContent: (content: string) => {
    const ch = get().currentChapter;
    if (!ch) return;
    const wordCount = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    set({
      currentChapter: { ...ch, content, wordCount, updatedAt: new Date() },
      // 编辑期间不同步 chapters 数组，避免每次击键 .map() 全量数据
    });
  },
}));
