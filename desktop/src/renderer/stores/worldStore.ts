/**
 * 世界观状态管理 Store
 * 多维设定（地理/势力/时代/约束），支持Tab切换
 */

import { create } from 'zustand';
import type { WorldSetting, GeographySetting, FactionSetting, PowerSystem, Constraint } from '@novel/shared';
import { api } from '../lib/api';

interface UpdateWorldDto {
  name?: string;
  era?: string;
}

/** 世界观Tab类型 */
export type WorldTab = 'geography' | 'factions' | 'power' | 'economy' | 'society' | 'constraints' | 'overview';

interface WorldState {
  /** 世界观数据 */
  world: WorldSetting | null;
  /** 当前Tab */
  activeTab: WorldTab;
  /** 当前项目ID */
  currentProjectId: string | null;
  /** 当前世界观ID */
  currentWorldId: string | null;

  /** 获取世界观 */
  fetchWorld: (projectId: string) => Promise<void>;
  /** 更新世界观基本信息 */
  updateWorld: (data: UpdateWorldDto) => Promise<void>;
  /** 设置Tab */
  setActiveTab: (tab: WorldTab) => void;

  /** 地理 - 新增 */
  addGeography: (data: Omit<GeographySetting, 'id'>) => Promise<void>;
  /** 地理 - 删除 */
  removeGeography: (id: string) => Promise<void>;
  /** 地理 - 更新 */
  updateGeography: (id: string, data: Partial<GeographySetting>) => Promise<void>;

  /** 势力 - 新增 */
  addFaction: (data: Omit<FactionSetting, 'id'>) => Promise<void>;
  /** 势力 - 删除 */
  removeFaction: (id: string) => Promise<void>;
  /** 势力 - 更新 */
  updateFaction: (id: string, data: Partial<FactionSetting>) => Promise<void>;

  /** 力量体系 - 新增 */
  addPowerSystem: (data: Omit<PowerSystem, 'id'>) => Promise<void>;
  /** 力量体系 - 删除 */
  removePowerSystem: (id: string) => Promise<void>;

  /** 约束 - 新增 */
  addConstraint: (data: Omit<Constraint, 'id'>) => Promise<void>;
  /** 约束 - 删除 */
  removeConstraint: (id: string) => Promise<void>;
}

export const useWorldStore = create<WorldState>((set, get) => ({
  world: null,
  activeTab: 'overview',
  currentProjectId: null,
  currentWorldId: null,

  fetchWorld: async (projectId: string) => {
    try {
      const res = await api.get<WorldSetting>(`/projects/${projectId}/world-settings`);
      const world = (res as any).data ?? res;
      set({ world, currentProjectId: projectId, currentWorldId: world?.id });
    } catch (err) {
      console.error('获取世界观失败:', err);
    }
  },

  updateWorld: async (data: UpdateWorldDto) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.put<WorldSetting>(`/projects/${currentProjectId}/world-settings/${currentWorldId}`, data);
      set({ world: (res as any).data ?? res });
    } catch (err) {
      console.error('更新世界观失败:', err);
    }
  },

  setActiveTab: (tab: WorldTab) => {
    set({ activeTab: tab });
  },

  addGeography: async (data: Omit<GeographySetting, 'id'>) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.post<GeographySetting>(`/projects/${currentProjectId}/world-settings/${currentWorldId}/geography`, data);
      const item = (res as any).data ?? res;
      set((state) => ({
        world: state.world
          ? { ...state.world, geography: [...state.world.geography, item], updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('添加地理设定失败:', err);
    }
  },

  removeGeography: async (id: string) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      await api.delete(`/projects/${currentProjectId}/world-settings/${currentWorldId}/geography/${id}`);
      set((state) => ({
        world: state.world
          ? { ...state.world, geography: state.world.geography.filter((g) => g.id !== id), updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('删除地理设定失败:', err);
    }
  },

  updateGeography: async (id: string, data: Partial<GeographySetting>) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.put<GeographySetting>(`/projects/${currentProjectId}/world-settings/${currentWorldId}/geography/${id}`, data);
      const updated = (res as any).data ?? res;
      set((state) => ({
        world: state.world
          ? {
              ...state.world,
              geography: state.world.geography.map((g) => (g.id === id ? updated : g)),
              updatedAt: new Date(),
            }
          : state.world,
      }));
    } catch (err) {
      console.error('更新地理设定失败:', err);
    }
  },

  addFaction: async (data: Omit<FactionSetting, 'id'>) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.post<FactionSetting>(`/projects/${currentProjectId}/world-settings/${currentWorldId}/factions`, data);
      const item = (res as any).data ?? res;
      set((state) => ({
        world: state.world
          ? { ...state.world, factions: [...state.world.factions, item], updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('添加势力失败:', err);
    }
  },

  removeFaction: async (id: string) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      await api.delete(`/projects/${currentProjectId}/world-settings/${currentWorldId}/factions/${id}`);
      set((state) => ({
        world: state.world
          ? { ...state.world, factions: state.world.factions.filter((f) => f.id !== id), updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('删除势力失败:', err);
    }
  },

  updateFaction: async (id: string, data: Partial<FactionSetting>) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.put<FactionSetting>(`/projects/${currentProjectId}/world-settings/${currentWorldId}/factions/${id}`, data);
      const updated = (res as any).data ?? res;
      set((state) => ({
        world: state.world
          ? {
              ...state.world,
              factions: state.world.factions.map((f) => (f.id === id ? updated : f)),
              updatedAt: new Date(),
            }
          : state.world,
      }));
    } catch (err) {
      console.error('更新势力失败:', err);
    }
  },

  addPowerSystem: async (data: Omit<PowerSystem, 'id'>) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.post<PowerSystem>(`/projects/${currentProjectId}/world-settings/${currentWorldId}/power-systems`, data);
      const item = (res as any).data ?? res;
      set((state) => ({
        world: state.world
          ? { ...state.world, powerSystems: [...state.world.powerSystems, item], updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('添加力量体系失败:', err);
    }
  },

  removePowerSystem: async (id: string) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      await api.delete(`/projects/${currentProjectId}/world-settings/${currentWorldId}/power-systems/${id}`);
      set((state) => ({
        world: state.world
          ? { ...state.world, powerSystems: state.world.powerSystems.filter((p) => p.id !== id), updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('删除力量体系失败:', err);
    }
  },

  addConstraint: async (data: Omit<Constraint, 'id'>) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      const res = await api.post<Constraint>(`/projects/${currentProjectId}/world-settings/${currentWorldId}/constraints`, data);
      const item = (res as any).data ?? res;
      set((state) => ({
        world: state.world
          ? { ...state.world, constraints: [...state.world.constraints, item], updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('添加约束失败:', err);
    }
  },

  removeConstraint: async (id: string) => {
    const { currentProjectId, currentWorldId } = get();
    if (!currentProjectId || !currentWorldId) return;
    try {
      await api.delete(`/projects/${currentProjectId}/world-settings/${currentWorldId}/constraints/${id}`);
      set((state) => ({
        world: state.world
          ? { ...state.world, constraints: state.world.constraints.filter((c) => c.id !== id), updatedAt: new Date() }
          : state.world,
      }));
    } catch (err) {
      console.error('删除约束失败:', err);
    }
  },
}));
