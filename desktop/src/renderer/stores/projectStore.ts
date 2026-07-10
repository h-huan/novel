/**
 * 项目状态管理 Store
 * 通过 REST API 管理真实项目数据
 */
import { create } from 'zustand';
import { api } from '../lib/api';
import {
  Project,
  ProjectType,
  ProjectStatus,
  CreationSource,
  TargetPlatform,
  WorkflowStage,
  IdeaStatus,
} from '@novel/shared';

const PROJECT_FLOW_STORAGE_PREFIX = 'novel:project-flow:';

interface ProjectFlowViewState {
  lastRoute: string;
}

export function projectFlowStorageKey(projectId: string): string {
  return `${PROJECT_FLOW_STORAGE_PREFIX}${projectId}`;
}

export function rememberProjectRoute(projectId: string, route: string): void {
  if (!projectId || !route.startsWith(`/project/${projectId}/`)) return;
  localStorage.setItem(projectFlowStorageKey(projectId), JSON.stringify({ lastRoute: route } satisfies ProjectFlowViewState));
}

export function clearProjectFlowState(projectId: string): void {
  if (projectId) localStorage.removeItem(projectFlowStorageKey(projectId));
  // Legacy global keys were never project-scoped and can revive an invalid page.
  ['lastRoute', 'activeStep', 'activeTab'].forEach((key) => localStorage.removeItem(key));
}

interface ProjectCreateData {
  title: string;
  type?: Project['type'];
  projectMode?: Project['type'];
  creationSource?: CreationSource;
  targetPlatform?: TargetPlatform;
  platformStyle?: string;
  targetWords?: number;
  currentWorkflowStage?: WorkflowStage;
  ideaStatus?: IdeaStatus;
  ideaSeed?: string;
  confirmedIdea?: string;
  description?: string;
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  searchQuery: string;
  typeFilter: Project['type'] | 'all';
  loading: boolean;
  error: string | null;

  fetchProjects: () => Promise<void>;
  fetchProject: (id: string) => Promise<Project | null>;
  createProject: (data: ProjectCreateData) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (filter: Project['type'] | 'all') => void;
  getFilteredProjects: () => Project[];
}

function mapServerProject(raw: any): Project {
  if (!raw) {
    console.warn('[mapServerProject] raw is null/undefined, using defaults');
    return {
      id: '',
      title: '数据异常',
      type: 'long_novel' as ProjectType,
      status: 'active' as ProjectStatus,
      description: '',
      wordCount: 0,
      chapterCount: 0,
      platforms: [],
      creationSource: 'blank' as CreationSource,
      targetPlatform: 'generic' as TargetPlatform,
      targetWords: 0,
      currentWorkflowStage: 'idea_or_inspiration' as WorkflowStage,
      ideaStatus: 'none' as IdeaStatus,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // 推导默认阶段
  const creationSource = (raw.creationSource || 'blank') as CreationSource;
  const rawType = raw.type || 'long_novel';
  const defaultStage = rawType === 'short_story' ? 'topic' : 'idea_or_inspiration';

  return {
    id: raw.id || '',
    title: raw.title || '未命名项目',
    type: raw.type || 'long_novel',
    status: raw.status || 'active',
    description: raw.description || '',
    wordCount: raw.currentWords ?? raw.wordCount ?? 0,
    chapterCount: raw.chapterCount ?? 0,
    platforms: Array.isArray(raw.platforms) ? raw.platforms : [],
    creationSource,
    targetPlatform: (raw.targetPlatform || raw.platformStyle || 'generic') as TargetPlatform,
    targetWords: raw.targetWords ?? raw.target_words ?? 0,
    currentWorkflowStage: (raw.currentWorkflowStage || defaultStage) as WorkflowStage,
    ideaStatus: (raw.ideaStatus || 'none') as IdeaStatus,
    ideaSeed: raw.ideaSeed || undefined,
    confirmedIdea: raw.confirmedIdea || undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  searchQuery: '',
  typeFilter: 'all',
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.get<{ data: any[]; total: number }>('/projects');
      // api.ts 返回 ApiResponse<T> = { data: T }，T 在此为 { data: any[], total: number }
      // 所以 res.data 是 { data: any[], total: number }，实际数组在 res.data.data（或直接就是 res.data 如果后端没包裹）
      const rawList = (res as any).data?.data ?? (res as any).data ?? res ?? [];
      const list = Array.isArray(rawList) ? rawList : [];
      const projects = list.map(mapServerProject);
      set({ projects, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message || '获取项目列表失败' });
    }
  },

  fetchProject: async (id: string) => {
    try {
      const res = await api.get<any>(`/projects/${id}`);
      // API 返回原始 JSON，没有 data 包裹
      const raw = (res as any).data ?? res;
      const p = mapServerProject(raw);
      set((state) => ({
        projects: state.projects.some((x) => x.id === p.id)
          ? state.projects.map((x) => (x.id === p.id ? p : x))
          : [p, ...state.projects],
        currentProject: p,
      }));
      return p;
    } catch {
      return null;
    }
  },

  createProject: async (data: ProjectCreateData) => {
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = {
        title: data.title,
        type: data.type || data.projectMode || 'long_novel',
        platformStyle: data.platformStyle || data.targetPlatform || 'generic',
      };
      if (data.projectMode) body.projectMode = data.projectMode;
      if (data.creationSource) body.creationSource = data.creationSource;
      if (data.targetPlatform) body.targetPlatform = data.targetPlatform;
      if (data.targetWords !== undefined) body.targetWords = data.targetWords;
      if (data.currentWorkflowStage) body.currentWorkflowStage = data.currentWorkflowStage;
      if (data.ideaStatus) body.ideaStatus = data.ideaStatus;
      if (data.ideaSeed) body.ideaSeed = data.ideaSeed;
      if (data.confirmedIdea) body.confirmedIdea = data.confirmedIdea;
      if (data.description) body.description = data.description;

      const res = await api.post<any>('/projects', body);
      const raw = (res as any).data ?? res;
      const p = mapServerProject(raw);
      set((state) => ({
        projects: [p, ...state.projects],
        currentProject: p,
        loading: false,
      }));
      return p;
    } catch (err: any) {
      set({ loading: false, error: err.message || '创建项目失败' });
      throw err;
    }
  },

  deleteProject: async (id: string) => {
    try {
      await api.delete(`/projects/${id}`);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject,
      }));
    } catch (err: any) {
      set({ error: err.message || '删除失败' });
    }
  },

  selectProject: async (id: string | null) => {
    if (id === null) {
      set({ currentProject: null });
      return;
    }
    const existing = get().projects.find((p) => p.id === id);
    if (existing) {
      set({ currentProject: existing });
    } else {
      await get().fetchProject(id);
    }
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setTypeFilter: (filter: Project['type'] | 'all') => set({ typeFilter: filter }),

  getFilteredProjects: () => {
    const { projects, searchQuery, typeFilter } = get();
    return projects.filter((project) => {
      const matchSearch =
        !searchQuery ||
        project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (project.description &&
          project.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchType = typeFilter === 'all' || project.type === typeFilter;
      return matchSearch && matchType;
    });
  },
}));
