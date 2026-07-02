/**
 * 大纲状态管理 Store
 * 树形大纲（parentId结构），支持展开/折叠/拖拽排序
 */

import { create } from 'zustand';
import type { OutlineNode, OutlineLevel } from '@novel/shared';
import { api } from '../lib/api';

interface CreateOutlineDto {
  projectId: string;
  level: OutlineLevel;
  parentId?: string;
  title: string;
  content?: string;
  order: number;
}

interface UpdateOutlineDto {
  title?: string;
  content?: string;
  order?: number;
  parentId?: string;
}

interface OutlineState {
  /** 大纲节点列表（扁平结构） */
  nodes: OutlineNode[];
  /** 当前选中节点 */
  selectedNode: OutlineNode | null;
  /** 展开状态映射 */
  expandedMap: Record<string, boolean>;
  /** 加载状态 */
  loading: boolean;
  /** 当前项目ID */
  currentProjectId: string | null;

  /** 获取大纲 */
  fetchOutline: (projectId: string) => Promise<void>;
  /** 创建节点 */
  createNode: (data: CreateOutlineDto) => Promise<void>;
  /** 更新节点 */
  updateNode: (id: string, data: UpdateOutlineDto) => Promise<void>;
  /** 删除节点 */
  deleteNode: (id: string) => Promise<void>;
  /** 选中节点 */
  selectNode: (id: string | null) => void;
  /** 展开/折叠 */
  toggleExpand: (id: string) => void;
  /** 展开全部 */
  expandAll: () => void;
  /** 折叠全部 */
  collapseAll: () => void;
  /** 移动节点（拖拽排序） */
  moveNode: (id: string, targetParentId: string, targetOrder: number) => Promise<void>;
  /** 获取子节点 */
  getChildren: (parentId: string) => OutlineNode[];
  /** 获取树形结构 */
  getTree: () => OutlineNode[];
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: [],
  selectedNode: null,
  expandedMap: {},
  loading: false,
  currentProjectId: null,

  fetchOutline: async (projectId: string, forceRefresh = false) => {
    // 缓存检查：同一项目且已有数据则跳过，除非强制刷新
    if (!forceRefresh && get().currentProjectId === projectId && get().nodes.length > 0) return;
    set({ loading: true });
    try {
      const res = await api.get<OutlineNode[]>(`/projects/${projectId}/outlines`);
      const list = (res as any).data ?? res ?? [];
      const nodes = Array.isArray(list) ? list as OutlineNode[] : [];
      set({ nodes, currentProjectId: projectId });
    } catch (err) {
      console.error('获取大纲失败:', err);
    } finally {
      set({ loading: false });
    }
  },

  createNode: async (data: CreateOutlineDto) => {
    try {
      const res = await api.post<OutlineNode>(`/projects/${data.projectId}/outlines`, data);
      const node = (res as any).data ?? res;
      set((state) => ({
        nodes: [...state.nodes, node as OutlineNode],
        selectedNode: node as OutlineNode,
      }));
    } catch (err) {
      console.error('创建大纲节点失败:', err);
    }
  },

  updateNode: async (id: string, data: UpdateOutlineDto) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      const res = await api.put<OutlineNode>(`/projects/${currentProjectId}/outlines/${id}`, data);
      const updated = (res as any).data ?? res;
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? updated as OutlineNode : n,
        ),
        selectedNode:
          state.selectedNode?.id === id
            ? updated as OutlineNode
            : state.selectedNode,
      }));
    } catch (err) {
      console.error('更新大纲节点失败:', err);
    }
  },

  deleteNode: async (id: string) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    // 删除节点及其所有子节点
    const deleteRecursive = (nodeId: string): string[] => {
      const children = get().nodes.filter((n) => n.parentId === nodeId);
      return [nodeId, ...children.flatMap((c) => deleteRecursive(c.id))];
    };
    const idsToDelete = deleteRecursive(id);
    try {
      await api.delete(`/projects/${currentProjectId}/outlines/${id}`);
      set((state) => ({
        nodes: state.nodes.filter((n) => !idsToDelete.includes(n.id)),
        selectedNode: state.selectedNode && idsToDelete.includes(state.selectedNode.id) ? null : state.selectedNode,
      }));
    } catch (err) {
      console.error('删除大纲节点失败:', err);
    }
  },

  selectNode: (id: string | null) => {
    if (id === null) {
      set({ selectedNode: null });
      return;
    }
    const node = get().nodes.find((n) => n.id === id) || null;
    set({ selectedNode: node });
  },

  toggleExpand: (id: string) => {
    set((state) => ({
      expandedMap: {
        ...state.expandedMap,
        [id]: !state.expandedMap[id],
      },
    }));
  },

  expandAll: () => {
    const expandedMap: Record<string, boolean> = {};
    get().nodes.forEach((n) => {
      if (get().nodes.some((c) => c.parentId === n.id)) {
        expandedMap[n.id] = true;
      }
    });
    set({ expandedMap });
  },

  collapseAll: () => {
    set({ expandedMap: {} });
  },

  moveNode: async (id: string, targetParentId: string, targetOrder: number) => {
    const { currentProjectId } = get();
    if (!currentProjectId) return;
    try {
      await api.put(`/projects/${currentProjectId}/outlines/${id}/move`, { targetParentId, targetOrder });
      // Refresh the outline after moving
      const res = await api.get<OutlineNode[]>(`/projects/${currentProjectId}/outlines`);
      const list = (res as any).data ?? res ?? [];
      const nodes = Array.isArray(list) ? list as OutlineNode[] : [];
      set({ nodes });
    } catch (err) {
      console.error('移动大纲节点失败:', err);
    }
  },

  getChildren: (parentId: string) => {
    return get().nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  },

  getTree: () => {
    const { nodes } = get();
    const rootNodes = nodes
      .filter((n) => !n.parentId)
      .sort((a, b) => a.order - b.order);

    const buildTree = (parentNodes: OutlineNode[]): OutlineNode[] => {
      return parentNodes.map((node) => ({
        ...node,
        children: buildTree(
          nodes
            .filter((n) => n.parentId === node.id)
            .sort((a, b) => a.order - b.order),
        ),
      }));
    };

    return buildTree(rootNodes);
  },
}));
