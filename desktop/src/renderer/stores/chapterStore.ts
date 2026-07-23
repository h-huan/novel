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
  submitForReview: (projectId: string, id: string) => Promise<void>;
  lockChapter: (projectId: string, id: string) => Promise<void>;
  directLockChapter: (projectId: string, id: string) => Promise<void>;
  unlockChapter: (projectId: string, id: string) => Promise<void>;
  rejectReview: (projectId: string, id: string) => Promise<void>;
  selectChapter: (projectId: string, id: string) => Promise<void>;
  setCurrentChapterContent: (content: string) => void;
}

/**
 * Controllers in this project return a mix of raw resources and `{ data }`
 * envelopes. The fetch client intentionally preserves the response body, so
 * chapter loading must unwrap both forms instead of treating a raw array as
 * an empty result.
 */
function unwrapApiPayload<T>(response: unknown): T {
  if (response && typeof response === 'object' && !Array.isArray(response) && 'data' in response) {
    return (response as { data: T }).data;
  }
  return response as T;
}

/** Do not render a generation transport envelope as the author's manuscript. */
function narrativeContent(value: unknown): string {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source.startsWith('{')) return source;
  try {
    const parsed = JSON.parse(source) as Record<string, unknown>;
    for (const key of ['fullText', 'full_text', 'content', 'text', 'chapterContent']) {
      const candidate = parsed[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  } catch {
    // A leading brace can still be intentional prose; preserve it verbatim.
  }
  return source;
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
  const content = narrativeContent(raw.content);
  const wordCount = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  return {
    id: raw.id || '',
    projectId: raw.projectId || '',
    outlineId: raw.outlineId || '',
    volumeIndex: raw.volumeIndex ?? 1,
    chapterIndex: raw.chapterIndex ?? 1,
    title: raw.title || '未命名章节',
    content,
    wordCount: content === String(raw.content || '').trim() ? (raw.wordCount ?? wordCount) : wordCount,
    targetWords: raw.targetWords == null ? undefined : Number(raw.targetWords),
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
      const payload = unwrapApiPayload<unknown>(res);
      const list = Array.isArray(payload) ? payload : [];
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
      const ch = mapServerChapter(unwrapApiPayload(res));
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
    if (!chapter) throw new Error('未找到要更新的章节，请先重新选择章节');
    try {
      const res = await api.put<any>(`/projects/${chapter.projectId}/chapters/${id}`, data);
      const updated = mapServerChapter(unwrapApiPayload(res));
      set((state) => ({
        chapters: state.chapters.map((c) => (c.id === id ? updated : c)),
        currentChapter: state.currentChapter?.id === id ? updated : state.currentChapter,
      }));
    } catch (error) {
      throw error;
      // silent fail — content is saved locally by WritingPage auto-save
    }
  },

  submitForReview: async (projectId: string, id: string) => {
    const res = await api.post<any>(`/projects/${projectId}/writing-quality/submit-review`, { chapterId: id, scope: 'chapter' });
    const payload = unwrapApiPayload<any>(res);
    const updated = mapServerChapter(payload?.chapter);
    set((state) => ({
      chapters: state.chapters.map((chapter) => chapter.id === id ? updated : chapter),
      currentChapter: state.currentChapter?.id === id ? updated : state.currentChapter,
    }));
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
    } catch (error) {
      throw error;
    }
  },

  directLockChapter: async (projectId: string, id: string) => {
    const res = await api.post<any>(`/projects/${projectId}/chapters/${id}/direct-lock`);
    const updated = mapServerChapter(unwrapApiPayload(res));
    set((state) => ({
      chapters: state.chapters.map((chapter) => chapter.id === id ? updated : chapter),
      currentChapter: state.currentChapter?.id === id ? updated : state.currentChapter,
    }));
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
    } catch (error) {
      throw error;
    }
  },

  rejectReview: async (projectId: string, id: string) => {
    const res = await api.post<any>(`/projects/${projectId}/chapters/${id}/reject-review`);
    const updated = mapServerChapter(unwrapApiPayload(res));
    set((state) => ({
      chapters: state.chapters.map((chapter) => chapter.id === id ? updated : chapter),
      currentChapter: state.currentChapter?.id === id ? updated : state.currentChapter,
    }));
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
      const full = mapServerChapter(unwrapApiPayload(res));
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
