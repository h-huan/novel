/**
 * 伏笔状态管理 Store
 * 管理伏笔列表、筛选、CRUD操作
 */

import { create } from 'zustand';
import type { Foreshadowing, ForeshadowingStatus, ForeshadowingImportance, ForeshadowingType } from '@novel/shared';
import { api } from '../lib/api';

interface CreateForeshadowingDto {
  projectId: string;
  content: string;
  type: ForeshadowingType;
  importance: ForeshadowingImportance;
  buriedChapterIndex: number;
  plannedRecoveryChapterIndex: number;
}

interface UpdateForeshadowingDto {
  content?: string;
  status?: ForeshadowingStatus;
  importance?: ForeshadowingImportance;
  type?: ForeshadowingType;
}

interface ForeshadowingFilters {
  status: ForeshadowingStatus | 'all';
  importance: ForeshadowingImportance | 'all';
  type: ForeshadowingType | 'all';
}

interface ForeshadowingState {
  /** 伏笔列表 */
  foreshadowings: Foreshadowing[];
  /** 筛选条件 */
  filters: ForeshadowingFilters;
  /** 当前选中伏笔 */
  selectedForeshadowing: Foreshadowing | null;
  /** 当前项目ID */
  currentProjectId: string | null;

  /** 获取伏笔列表 */
  fetchForeshadowings: (projectId: string, forceRefresh?: boolean) => Promise<void>;
  /** 创建伏笔 */
  createForeshadowing: (data: CreateForeshadowingDto) => Promise<void>;
  /** 更新伏笔 */
  updateForeshadowing: (id: string, data: UpdateForeshadowingDto) => Promise<void>;
  /** 删除伏笔 */
  deleteForeshadowing: (id: string) => Promise<void>;
  /** 回收伏笔 */
  recoverForeshadowing: (id: string, chapterIndex: number) => Promise<void>;
  /** 作废伏笔 */
  cancelForeshadowing: (id: string) => Promise<void>;
  /** 设置筛选条件 */
  setFilters: (filters: Partial<ForeshadowingFilters>) => void;
  /** 重置筛选 */
  resetFilters: () => void;
  /** 获取筛选后的伏笔列表 */
  getFilteredForeshadowings: () => Foreshadowing[];
  /** 计算统计 */
  getStats: () => { total: number; buried: number; active: number; reminder: number; pending: number; recovered: number; cancelled: number; recoveryRate: number };
}

const DEFAULT_FILTERS: ForeshadowingFilters = {
  status: 'all',
  importance: 'all',
  type: 'all',
};

export const useForeshadowingStore = create<ForeshadowingState>((set, get) => ({
  foreshadowings: [],
  filters: { ...DEFAULT_FILTERS },
  selectedForeshadowing: null,
  currentProjectId: null,

  fetchForeshadowings: async (projectId: string, forceRefresh = false) => {
    // 缓存检查：同一项目且已有数据则跳过，除非强制刷新
    if (!forceRefresh && get().currentProjectId === projectId && get().foreshadowings.length > 0) return;
    try {
      const res = await api.get<Foreshadowing[]>(`/projects/${projectId}/foreshadowings`);
      const list = (res as any).data ?? res ?? [];
      const foreshadowings = Array.isArray(list) ? list as Foreshadowing[] : [];
      set({ foreshadowings, currentProjectId: projectId });
    } catch (err) {
      console.error('获取伏笔列表失败:', err);
    }
  },

  createForeshadowing: async (data: CreateForeshadowingDto) => {
    try {
      const res = await api.post<Foreshadowing>(`/projects/${data.projectId}/foreshadowings`, data);
      const newItem = (res as any).data ?? res;
      set((state) => ({
        foreshadowings: [...state.foreshadowings, newItem as Foreshadowing],
      }));
    } catch (err) {
      console.error('创建伏笔失败:', err);
    }
  },

  updateForeshadowing: async (id: string, data: UpdateForeshadowingDto) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      const res = await api.put<Foreshadowing>(`/projects/${currentProjectId}/foreshadowings/${id}`, data);
      const updated = (res as any).data ?? res;
      set((state) => ({
        foreshadowings: state.foreshadowings.map((f) =>
          f.id === id ? updated as Foreshadowing : f,
        ),
        selectedForeshadowing:
          state.selectedForeshadowing?.id === id
            ? res.data
            : state.selectedForeshadowing,
      }));
    } catch (err) {
      console.error('更新伏笔失败:', err);
    }
  },

  deleteForeshadowing: async (id: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      await api.delete(`/projects/${currentProjectId}/foreshadowings/${id}`);
      set((state) => ({
        foreshadowings: state.foreshadowings.filter((f) => f.id !== id),
        selectedForeshadowing: state.selectedForeshadowing?.id === id ? null : state.selectedForeshadowing,
      }));
    } catch (err) {
      console.error('删除伏笔失败:', err);
    }
  },

  recoverForeshadowing: async (id: string, chapterIndex: number) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      const res = await api.put<Foreshadowing>(`/projects/${currentProjectId}/foreshadowings/${id}/recover`, { chapterIndex });
      const updated = (res as any).data ?? res;
      set((state) => ({
        foreshadowings: state.foreshadowings.map((f) =>
          f.id === id ? updated as Foreshadowing : f,
        ),
      }));
    } catch (err) {
      console.error('回收伏笔失败:', err);
    }
  },

  cancelForeshadowing: async (id: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      const res = await api.put<Foreshadowing>(`/projects/${currentProjectId}/foreshadowings/${id}/cancel`);
      const updated = (res as any).data ?? res;
      set((state) => ({
        foreshadowings: state.foreshadowings.map((f) =>
          f.id === id ? updated as Foreshadowing : f,
        ),
      }));
    } catch (err) {
      console.error('作废伏笔失败:', err);
    }
  },

  setFilters: (filters: Partial<ForeshadowingFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...filters },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...DEFAULT_FILTERS } });
  },

  getFilteredForeshadowings: () => {
    const { foreshadowings, filters } = get();
    return foreshadowings.filter((f) => {
      if (filters.status !== 'all' && f.status !== filters.status) return false;
      if (filters.importance !== 'all' && f.importance !== filters.importance) return false;
      if (filters.type !== 'all' && f.type !== filters.type) return false;
      return true;
    });
  },

  getStats: () => {
    const { foreshadowings } = get();
    const total = foreshadowings.length;
    const buried = foreshadowings.filter((f) => f.status === 'buried').length;
    const active = foreshadowings.filter((f) => f.status === 'active').length;
    const reminder = foreshadowings.filter((f) => f.status === 'reminder').length;
    const pending = foreshadowings.filter((f) => f.status === 'pending').length;
    const recovered = foreshadowings.filter((f) => f.status === 'recovered').length;
    const cancelled = foreshadowings.filter((f) => f.status === 'cancelled').length;
    const recoveredOrCancelled = recovered + cancelled;
    return {
      total,
      buried,
      active,
      reminder,
      pending,
      recovered,
      cancelled,
      recoveryRate: total > 0 ? (recoveredOrCancelled / total) * 100 : 0,
    };
  },
}));
