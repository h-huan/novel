/**
 * 章节状态管理 Store
 * 通过 REST API 管理真实章节数据
 */
import { create } from 'zustand';
import { countNarrativeWords } from '../lib/wordCount';
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
  /** 手动重跑本章七维质检（自动质检失败/想刷新时用），成功后本地同步为 ok 状态 */
  rerunAutoQuality: (projectId: string, id: string) => Promise<void>;
  /** 用任一 /writing-quality/analyze 返回体统一回写本章质检状态（编辑器/质量页/AI面板多入口共用，避免顶栏停在旧分数） */
  applyQualityAnalyzeResult: (id: string, payload: any) => void;
  /** 以后端章节行为权威，仅同步质检三字段（不覆盖正在编辑的正文）；挂载/切章/从其它页返回时兜底调用 */
  syncChapterQuality: (projectId: string, id: string) => Promise<void>;
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
      modelConfig: { writerModel: 'gpt-4', temperature: 0.8, cost: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  const content = narrativeContent(raw.content);
  // 以后端 toResponse 的 wordCount（同一口径）为权威，缺失时本地按同口径兜底
  const wordCount = Number.isFinite(Number(raw.wordCount)) ? Number(raw.wordCount) : countNarrativeWords(content);
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
    modelConfig: raw.modelConfig || { writerModel: 'gpt-4', temperature: 0.8, cost: 0 },
    lockedAt: raw.lockedAt ? new Date(raw.lockedAt) : undefined,
    autoQualityStatus: raw.autoQualityStatus || undefined,
    autoQualityMessage: raw.autoQualityMessage || undefined,
    autoQualityAt: raw.autoQualityAt || undefined,
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

  rerunAutoQuality: async (projectId: string, id: string) => {
    const res = await api.post<any>(`/projects/${projectId}/writing-quality/analyze`, { chapterId: id, scope: 'chapter' });
    const payload = unwrapApiPayload<any>(res);
    get().applyQualityAnalyzeResult(id, payload);
  },

  // 统一回写：任何入口（编辑器重跑 / 质量诊断页 / AI 续写面板内 analyze）拿到结果后都走这里，
  // 保证 chapters 列表与当前章节的质检状态同时更新，杜绝「后端已 78、顶栏还停在 77」。
  applyQualityAnalyzeResult: (id: string, payload: any) => {
    const report = payload?.report;
    // 状态以后端同口径结论为准（≥90且无高危=ok，否则 needs_rewrite）；后端缺字段时用分数现场推导，绝不无条件乐观置 ok。
    const score = Number(report?.overallScore);
    const highCount = Number(report?.highIssueCount || 0);
    const derived: Chapter['autoQualityStatus'] = Number.isFinite(score)
      ? (score >= 90 && highCount === 0 ? 'ok' : 'needs_rewrite')
      : 'needs_rewrite';
    const patch: Partial<Chapter> = {
      autoQualityStatus: (payload?.autoQualityStatus as Chapter['autoQualityStatus']) || derived,
      autoQualityMessage: payload?.autoQualityMessage
        || (report
          ? `自动质检完成：综合分 ${report.overallScore}，待改问题 ${report.openIssueCount ?? 0} 个`
          : '自动质检完成'),
      autoQualityAt: new Date().toISOString(),
    };
    set((state) => ({
      chapters: state.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      currentChapter: state.currentChapter?.id === id ? { ...state.currentChapter, ...patch } : state.currentChapter,
    }));
  },

  // 兜底同步：质检可能从质量诊断页、AI 面板或后端自动流程触发，编辑器不一定经过 applyQualityAnalyzeResult。
  // 挂载/切章/返回编辑器时拉一次后端章节行，只覆盖质检三字段，绝不碰 content（避免冲掉未保存正文）。
  syncChapterQuality: async (projectId: string, id: string) => {
    try {
      const res = await api.get<any>(`/projects/${projectId}/chapters`);
      const payload = unwrapApiPayload<unknown>(res);
      const rows = Array.isArray(payload) ? payload : [];
      const raw = rows.find((r: any) => r && r.id === id);
      // 只有后端确实带了质检状态才覆盖；字段缺失时保留现有值，绝不把状态条/评分清空（接口字段不全也不能导致「不显示」）
      if (!raw || !raw.autoQualityStatus) return;
      const patch: Partial<Chapter> = {
        autoQualityStatus: raw.autoQualityStatus,
        autoQualityMessage: raw.autoQualityMessage || undefined,
        autoQualityAt: raw.autoQualityAt || undefined,
      };
      set((state) => ({
        chapters: state.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        currentChapter: state.currentChapter?.id === id ? { ...state.currentChapter, ...patch } : state.currentChapter,
      }));
    } catch {
      // 兜底同步失败不打断编辑，下一次切章/动作仍会再试
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
      await api.post(`/projects/${projectId}/chapters/${id}/lock`, {});
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
      await api.post(`/projects/${projectId}/chapters/${id}/unlock`, {});
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
    const wordCount = countNarrativeWords(content);
    set({
      currentChapter: { ...ch, content, wordCount, updatedAt: new Date() },
      // 编辑期间不同步 chapters 数组，避免每次击键 .map() 全量数据
    });
  },
}));
