/**
 * 组织/势力状态管理 Store
 * 通过 REST API 管理真实组织数据，支持层级树状结构
 */
import { create } from 'zustand';
import type { Organization, OrganizationTreeNode, OrganizationType } from '@novel/shared';
import { api } from '../lib/api';

interface OrganizationState {
  /** 扁平列表 */
  organizations: Organization[];
  /** 树状结构 */
  tree: OrganizationTreeNode[];
  /** 当前选中的组织 */
  currentOrganization: Organization | null;
  loading: boolean;

  /** 获取组织列表 */
  fetchOrganizations: (projectId: string) => Promise<void>;
  /** 获取树状结构 */
  fetchTree: (projectId: string) => Promise<void>;
  /** 按父级获取 */
  fetchByParent: (projectId: string, parentId: string) => Promise<Organization[]>;
  /** 创建组织 */
  createOrganization: (data: {
    projectId: string;
    name: string;
    type?: OrganizationType;
    description?: string;
    parentId?: string | null;
  }) => Promise<Organization | undefined>;
  /** 更新组织 */
  updateOrganization: (id: string, projectId: string, data: {
    name?: string;
    type?: OrganizationType;
    description?: string;
    parentId?: string | null;
  }) => Promise<void>;
  /** 删除组织 */
  deleteOrganization: (id: string, projectId: string) => Promise<void>;
  /** 选中组织 */
  selectOrganization: (id: string) => void;
}

function mapServerOrganization(raw: any): Organization {
  return {
    id: raw.id,
    projectId: raw.projectId,
    name: raw.name,
    type: raw.type ?? 'organization',
    description: raw.description ?? '',
    parentId: raw.parentId ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function apiPayload<T = any>(res: any): T {
  return (res?.data?.data ?? res?.data ?? res ?? []) as T;
}

function mapServerTree(raw: any): OrganizationTreeNode {
  return {
    ...mapServerOrganization(raw),
    children: (raw.children || []).map(mapServerTree),
  };
}

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  organizations: [],
  tree: [],
  currentOrganization: null,
  loading: false,

  fetchOrganizations: async (projectId: string) => {
    set({ loading: true });
    try {
      const res = await api.get<any>(`/projects/${projectId}/organizations`);
      const list = apiPayload<any[]>(res);
      const organizations = Array.isArray(list) ? list.map(mapServerOrganization) : [];
      set({ organizations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchTree: async (projectId: string) => {
    set({ loading: true });
    try {
      const res = await api.get<any>(`/projects/${projectId}/organizations/tree`);
      const rawTree = apiPayload<any[]>(res);
      const tree = Array.isArray(rawTree) ? rawTree.map(mapServerTree) : [];
      set({ tree, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchByParent: async (projectId: string, parentId: string) => {
    try {
      const res = await api.get<any>(`/projects/${projectId}/organizations/by-parent/${parentId}`);
      const list = apiPayload<any[]>(res);
      return Array.isArray(list) ? list.map(mapServerOrganization) : [];
    } catch {
      return [];
    }
  },

  createOrganization: async (data) => {
    try {
      const res = await api.post<any>(`/projects/${data.projectId}/organizations`, {
        name: data.name,
        type: data.type ?? 'organization',
        description: data.description ?? '',
        parentId: data.parentId ?? null,
      });
      const org = mapServerOrganization(apiPayload(res));
      set((state) => ({
        organizations: [...state.organizations, org],
      }));
      get().fetchTree(data.projectId);
      return org;
    } catch (err) {
      console.error('创建组织失败:', err);
    }
  },

  updateOrganization: async (id, projectId, data) => {
    try {
      const res = await api.put<any>(`/projects/${projectId}/organizations/${id}`, data);
      const updated = mapServerOrganization(apiPayload(res));
      set((state) => ({
        organizations: state.organizations.map((o) => (o.id === id ? updated : o)),
        currentOrganization: state.currentOrganization?.id === id ? updated : state.currentOrganization,
      }));
      get().fetchTree(projectId);
    } catch (err) {
      console.error('更新组织失败:', err);
    }
  },

  deleteOrganization: async (id, projectId) => {
    try {
      await api.delete(`/projects/${projectId}/organizations/${id}`);
      set((state) => ({
        organizations: state.organizations.filter((o) => o.id !== id),
        currentOrganization: state.currentOrganization?.id === id ? null : state.currentOrganization,
      }));
      get().fetchTree(projectId);
    } catch (err) {
      console.error('删除组织失败:', err);
    }
  },

  selectOrganization: (id: string) => {
    const org = get().organizations.find((o) => o.id === id) || null;
    set({ currentOrganization: org });
  },
}));
