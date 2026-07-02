/**
 * 素材库状态管理 Store
 */
import { create } from 'zustand';
import { api } from '../lib/api';

export interface MaterialItem {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: 'reference' | 'inspiration' | 'image' | 'link' | 'note';
  tags: string[];
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MaterialState {
  materials: MaterialItem[];
  searchQuery: string;
  filterType: MaterialItem['type'] | 'all';

  fetchMaterials: (projectId: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setFilterType: (t: MaterialItem['type'] | 'all') => void;
  addMaterial: (item: Omit<MaterialItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;
  getFiltered: () => MaterialItem[];
}

export const useMaterialStore = create<MaterialState>((set, get) => ({
  materials: [],
  searchQuery: '',
  filterType: 'all',

  fetchMaterials: async (projectId: string) => {
    try {
      const res = await api.get<MaterialItem[]>(`/projects/${projectId}/materials`);
      const list = (res as any).data ?? res ?? [];
      set({ materials: Array.isArray(list) ? list : [] });
    } catch (err) {
      console.error('获取素材列表失败:', err);
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterType: (t) => set({ filterType: t }),

  addMaterial: async (item) => {
    try {
      const res = await api.post<MaterialItem>(`/projects/${item.projectId}/materials`, item);
      const newItem = (res as any).data ?? res;
      set((s) => ({
        materials: [...s.materials, newItem],
      }));
    } catch (err) {
      console.error('添加素材失败:', err);
    }
  },

  deleteMaterial: async (id) => {
    const { materials } = get();
    const item = materials.find((m) => m.id === id);
    if (!item) return;
    try {
      await api.delete(`/projects/${item.projectId}/materials/${id}`);
      set((s) => ({ materials: s.materials.filter((m) => m.id !== id) }));
    } catch (err) {
      console.error('删除素材失败:', err);
    }
  },

  getFiltered: () => {
    const { materials, searchQuery, filterType } = get();
    return materials.filter((m) => {
      if (filterType !== 'all' && m.type !== filterType) return false;
      if (searchQuery && !m.title.includes(searchQuery) && !m.tags.some((t) => t.includes(searchQuery)))
        return false;
      return true;
    });
  },
}));
