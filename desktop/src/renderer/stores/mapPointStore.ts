/**
 * 地图地点状态管理 Store
 * 通过 REST API 管理真实地点数据，支持层级树状结构
 */
import { create } from 'zustand';
import type { MapPoint, MapPointTreeNode, MapLevel, MapPointType } from '@novel/shared';
import { api } from '../lib/api';

interface MapPointState {
  /** 扁平列表 */
  mapPoints: MapPoint[];
  /** 树状结构 */
  tree: MapPointTreeNode[];
  /** 当前选中的地点 */
  currentMapPoint: MapPoint | null;
  loading: boolean;

  /** 获取地点列表 */
  fetchMapPoints: (projectId: string) => Promise<void>;
  /** 获取树状结构 */
  fetchTree: (projectId: string) => Promise<void>;
  /** 按层级获取 */
  fetchByLevel: (projectId: string, level: MapLevel) => Promise<MapPoint[]>;
  /** 创建地点 */
  createMapPoint: (data: {
    projectId: string;
    name: string;
    type?: MapPointType;
    description?: string;
    parentId?: string | null;
    level?: MapLevel;
    coordinates?: string;
    linkedChapterIds?: string[];
    linkedCharacterIds?: string[];
  }) => Promise<MapPoint | undefined>;
  /** 更新地点 */
  updateMapPoint: (id: string, projectId: string, data: {
    name?: string;
    type?: MapPointType;
    description?: string;
    parentId?: string | null;
    level?: MapLevel;
    coordinates?: string;
    linkedChapterIds?: string[];
    linkedCharacterIds?: string[];
  }) => Promise<void>;
  /** 删除地点 */
  deleteMapPoint: (id: string, projectId: string) => Promise<void>;
  /** 选中地点 */
  selectMapPoint: (id: string) => void;
}

function mapServerMapPoint(raw: any): MapPoint {
  return {
    id: raw.id,
    projectId: raw.projectId,
    name: raw.name,
    type: raw.type ?? '',
    description: raw.description ?? '',
    parentId: raw.parentId ?? null,
    level: raw.level ?? 'location',
    coordinates: raw.coordinates ?? '',
    linkedChapterIds: raw.linkedChapterIds ?? [],
    linkedCharacterIds: raw.linkedCharacterIds ?? [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function apiPayload<T = any>(res: any): T {
  return (res?.data?.data ?? res?.data ?? res ?? []) as T;
}

function mapServerTree(raw: any): MapPointTreeNode {
  return {
    ...mapServerMapPoint(raw),
    children: (raw.children || []).map(mapServerTree),
  };
}

export const useMapPointStore = create<MapPointState>((set, get) => ({
  mapPoints: [],
  tree: [],
  currentMapPoint: null,
  loading: false,

  fetchMapPoints: async (projectId: string) => {
    set({ loading: true });
    try {
      const res = await api.get<any>(`/projects/${projectId}/map-points`);
      const list = apiPayload<any[]>(res);
      const mapPoints = Array.isArray(list) ? list.map(mapServerMapPoint) : [];
      set({ mapPoints, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchTree: async (projectId: string) => {
    set({ loading: true });
    try {
      const res = await api.get<any>(`/projects/${projectId}/map-points/tree`);
      const rawTree = apiPayload<any[]>(res);
      const tree = Array.isArray(rawTree) ? rawTree.map(mapServerTree) : [];
      set({ tree, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchByLevel: async (projectId: string, level: MapLevel) => {
    try {
      const res = await api.get<any>(`/projects/${projectId}/map-points/by-level/${level}`);
      const list = apiPayload<any[]>(res);
      return Array.isArray(list) ? list.map(mapServerMapPoint) : [];
    } catch {
      return [];
    }
  },

  createMapPoint: async (data) => {
    try {
      const res = await api.post<any>(`/projects/${data.projectId}/map-points`, {
        name: data.name,
        type: data.type ?? '',
        description: data.description ?? '',
        parentId: data.parentId ?? null,
        level: data.level ?? 'location',
        coordinates: data.coordinates ?? '',
        linkedChapterIds: data.linkedChapterIds ?? [],
        linkedCharacterIds: data.linkedCharacterIds ?? [],
      });
      const mp = mapServerMapPoint(apiPayload(res));
      set((state) => ({
        mapPoints: [...state.mapPoints, mp],
      }));
      get().fetchTree(data.projectId);
      return mp;
    } catch (err) {
      console.error('创建地点失败:', err);
    }
  },

  updateMapPoint: async (id, projectId, data) => {
    try {
      const res = await api.put<any>(`/projects/${projectId}/map-points/${id}`, data);
      const updated = mapServerMapPoint(apiPayload(res));
      set((state) => ({
        mapPoints: state.mapPoints.map((m) => (m.id === id ? updated : m)),
        currentMapPoint: state.currentMapPoint?.id === id ? updated : state.currentMapPoint,
      }));
      get().fetchTree(projectId);
    } catch (err) {
      console.error('更新地点失败:', err);
    }
  },

  deleteMapPoint: async (id, projectId) => {
    try {
      await api.delete(`/projects/${projectId}/map-points/${id}`);
      set((state) => ({
        mapPoints: state.mapPoints.filter((m) => m.id !== id),
        currentMapPoint: state.currentMapPoint?.id === id ? null : state.currentMapPoint,
      }));
      get().fetchTree(projectId);
    } catch (err) {
      console.error('删除地点失败:', err);
    }
  },

  selectMapPoint: (id: string) => {
    const mp = get().mapPoints.find((m) => m.id === id) || null;
    set({ currentMapPoint: mp });
  },
}));
