/**
 * 灵感状态管理 Store
 * 管理灵感列表、搜索、CRUD操作
 */

import { create } from 'zustand';
import type { InspirationType } from '@novel/shared';
import type { CreateInspirationDto as ServerCreateInspirationDto } from '@novel/shared';
import { api } from '../lib/api';

/** 灵感来源类型（用于前端UI过滤） */
export type InspirationSource = 'sudden' | 'dream' | 'reading' | 'observation' | 'conversation' | 'other';

/** 本地创建灵感DTO（映射到服务端字段） */
interface CreateInspirationLocalDto {
  title: string;
  content?: string;
  source?: InspirationSource;
  tags?: string[];
}

/** 本地更新灵感DTO */
interface UpdateInspirationLocalDto {
  title?: string;
  content?: string;
  tags?: string[];
  status?: 'active' | 'converted' | 'archived';
}

interface InspirationState {
  /** 灵感列表 */
  inspirations: InspirationType[];
  /** 搜索关键词 */
  searchQuery: string;
  /** 来源过滤（前端本地过滤，使用platform字段） */
  sourceFilter: InspirationSource | 'all';
  /** 使用状态过滤（映射到status字段: active未使用, converted已使用） */
  usedFilter: boolean | 'all';
  /** 当前选中的灵感 */
  selectedInspiration: InspirationType | null;

  /** 获取灵感列表 */
  fetchInspirations: () => Promise<void>;
  /** 搜索灵感 */
  searchInspirations: (query: string) => void;
  /** 创建灵感 */
  createInspiration: (data: CreateInspirationLocalDto) => Promise<void>;
  /** 更新灵感 */
  updateInspiration: (id: string, data: UpdateInspirationLocalDto) => Promise<void>;
  /** 删除灵感 */
  deleteInspiration: (id: string) => Promise<void>;
  /** 标记为已使用 */
  markAsUsed: (id: string) => Promise<void>;
  /** 设置来源过滤 */
  setSourceFilter: (source: InspirationSource | 'all') => void;
  /** 设置使用状态过滤 */
  setUsedFilter: (used: boolean | 'all') => void;
  /** 获取过滤后的灵感列表 */
  getFilteredInspirations: () => InspirationType[];
}

export const useInspirationStore = create<InspirationState>((set, get) => ({
  inspirations: [],
  searchQuery: '',
  sourceFilter: 'all',
  usedFilter: 'all',
  selectedInspiration: null,

  fetchInspirations: async () => {
    try {
      const res = await api.get<InspirationType[]>('/inspirations');
      const list = (res as any).data ?? res ?? [];
      set({ inspirations: Array.isArray(list) ? list : [] });
    } catch (err) {
      console.error('获取灵感列表失败:', err);
    }
  },

  searchInspirations: (query: string) => {
    set({ searchQuery: query });
  },

  createInspiration: async (data: CreateInspirationLocalDto) => {
    try {
      const body: ServerCreateInspirationDto = {
        title: data.title,
        description: data.content,
        tags: data.tags,
        platform: data.source || 'other',
      };
      const res = await api.post<InspirationType>('/inspirations', body);
      const item = (res as any).data ?? res;
      set((state) => ({
        inspirations: [item as InspirationType, ...state.inspirations],
      }));
    } catch (err) {
      console.error('创建灵感失败:', err);
    }
  },

  updateInspiration: async (id: string, data: UpdateInspirationLocalDto) => {
    try {
      const body: Record<string, unknown> = {};
      if (data.title !== undefined) body.title = data.title;
      if (data.content !== undefined) body.description = data.content;
      if (data.tags !== undefined) body.tags = data.tags;
      if (data.status !== undefined) body.status = data.status;
      const res = await api.put<InspirationType>(`/inspirations/${id}`, body);
      const updated = (res as any).data ?? res;
      set((state) => ({
        inspirations: state.inspirations.map((i) =>
          i.id === id ? updated as InspirationType : i,
        ),
        selectedInspiration:
          state.selectedInspiration?.id === id
            ? updated as InspirationType
            : state.selectedInspiration,
      }));
    } catch (err) {
      console.error('更新灵感失败:', err);
    }
  },

  deleteInspiration: async (id: string) => {
    try {
      await api.delete(`/inspirations/${id}`);
      set((state) => ({
        inspirations: state.inspirations.filter((i) => i.id !== id),
        selectedInspiration: state.selectedInspiration?.id === id ? null : state.selectedInspiration,
      }));
    } catch (err) {
      console.error('删除灵感失败:', err);
    }
  },

  markAsUsed: async (id: string) => {
    try {
      const res = await api.put<InspirationType>(`/inspirations/${id}`, { status: 'converted' });
      const updated = (res as any).data ?? res;
      set((state) => ({
        inspirations: state.inspirations.map((i) =>
          i.id === id ? updated as InspirationType : i,
        ),
      }));
    } catch (err) {
      console.error('标记灵感已使用失败:', err);
    }
  },

  setSourceFilter: (source: InspirationSource | 'all') => {
    set({ sourceFilter: source });
  },

  setUsedFilter: (used: boolean | 'all') => {
    set({ usedFilter: used });
  },

  getFilteredInspirations: () => {
    const { inspirations, searchQuery, sourceFilter, usedFilter } = get();
    return inspirations.filter((insp) => {
      // 来源过滤：映射 source 到 platform 字段
      if (sourceFilter !== 'all') {
        const sourceMap: Record<string, string> = {
          sudden: '突发灵感',
          dream: '梦境灵感',
          reading: '阅读笔记',
          observation: '观察所得',
          conversation: '交流讨论',
          other: '其他',
        };
        if (insp.platform !== sourceMap[sourceFilter]) return false;
      }
      // 使用状态过滤：映射 used 到 status 字段
      if (usedFilter !== 'all') {
        if (usedFilter === true && insp.status !== 'converted') return false;
        if (usedFilter === false && insp.status === 'converted') return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          insp.title.toLowerCase().includes(q) ||
          insp.hook.toLowerCase().includes(q) ||
          insp.description.toLowerCase().includes(q) ||
          insp.tags.some((tag) => tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  },
}));
