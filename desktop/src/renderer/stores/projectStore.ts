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
  TargetPlatform,
  WorkflowStage,
} from '@novel/shared';
import type { ExecutionStandardsPayload } from '../lib/executionStandards';

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

/**
 * 创建 / 更新项目共用的执行标准字段清单。
 *
 * 为什么写成 Record<keyof ExecutionStandardsPayload, true> 而不是手写数组：
 * 手写清单漏一项只是运行期少发一个字段，编译不报错 —— 创建入口就曾因此把
 * categoryWordScaleDeviation 整个漏掉：作者在卡片上填了「分类体量取舍依据」，界面显示已填，
 * 请求里却没有这个字段，生成侧仍按 out_of_range 阻断，反复打回。
 * 用 Record 后，执行标准加字段而这里没跟上会直接编译失败。
 */
const EXECUTION_STANDARDS_FIELDS: Record<keyof ExecutionStandardsPayload, true> = {
  targetPlatform: true,
  customPlatformNote: true,
  targetWords: true,
  category: true,
  storyTone: true,
  writingStyle: true,
  webNovelGenre: true,
  submissionTags: true,
  plotTags: true,
  genreFitNote: true,
  pov: true,
  targetAudience: true,
  categoryWordScaleDeviation: true,
};

/**
 * 只挑执行标准字段提交，undefined 不发。
 *
 * 空字符串 / 空数组照发：两侧判据（后端 isPlatformStandardPresent、前端 missingExecutionStandards）
 * 都把空值判为「该维未执行」，所以既不必在前端偷偷换成默认值，也不能靠「不提交」
 * 把库里的旧值留在原处冒充已执行。
 */
function pickExecutionStandards(data: Partial<ExecutionStandardsPayload>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  (Object.keys(EXECUTION_STANDARDS_FIELDS) as Array<keyof ExecutionStandardsPayload>).forEach((field) => {
    const value = data[field];
    if (value !== undefined) picked[field] = value;
  });
  return picked;
}

/** 创建项目载荷：项目自身字段 + 执行标准（直接复用 ExecutionStandardsPayload，不另建一份字段表）。 */
interface ProjectCreateData extends Partial<ExecutionStandardsPayload> {
  title: string;
  type?: Project['type'];
  currentWorkflowStage?: WorkflowStage;
  description?: string;
  settings?: Record<string, unknown>;
  chapterWordRange?: { min: number; max: number };
}

/** 更新项目卡片执行标准（平台/分类/基调/文风/流派/视角/目标读者）+ 标题/类型/简介。 */
interface ProjectUpdateData extends Partial<ExecutionStandardsPayload> {
  title?: string;
  type?: Project['type'];
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
  updateProject: (id: string, data: ProjectUpdateData) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  deleteProjects: (ids: string[]) => Promise<{ deleted: string[]; failed: Array<{ id: string; message: string }> }>;
  selectProject: (id: string | null) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setTypeFilter: (filter: Project['type'] | 'all') => void;
  getFilteredProjects: () => Project[];
}

export function mapServerProject(raw: any): Project {
  if (!raw) {
    throw new Error('项目接口返回了空数据');
  }

  const constitution = raw.creativeConstitution;
  if (!constitution || constitution.schemaVersion !== 1) {
    throw new Error(`项目 ${raw.id || '(未知)'} 缺少有效创作宪法`);
  }

  // 推导默认阶段
  const defaultStage = constitution.projectType === 'short_story' ? 'topic' : 'world_setting';

  return {
    id: raw.id || '',
    title: raw.title || '未命名项目',
    type: constitution.projectType,
    status: raw.status || 'active',
    description: raw.description || '',
    wordCount: raw.currentWords ?? raw.wordCount ?? 0,
    chapterCount: raw.chapterCount ?? 0,
    platforms: Array.isArray(raw.platforms) ? raw.platforms : [],
    targetPlatform: constitution.targetPlatform as TargetPlatform,
    targetWords: constitution.targetWords,
    settings: typeof raw.settings === 'string' ? (() => { try { return JSON.parse(raw.settings); } catch { return {}; } })() : (raw.settings || {}),
    creativeConstitution: constitution,
    currentWorkflowStage: (raw.currentWorkflowStage || defaultStage) as WorkflowStage,
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
        type: data.type || 'long_novel',
      };
      // 执行标准十项走同一份清单提交（六维 + 平台说明 + 目标总字数 + 分类体量取舍依据）：
      // 旧写法逐字段 if，新增字段漏一行就静默少发，界面显示「已填」而生成侧仍按缺失阻断。
      Object.assign(body, pickExecutionStandards(data));
      if (data.currentWorkflowStage) body.currentWorkflowStage = data.currentWorkflowStage;
      if (data.description) body.description = data.description;
      if (data.settings) body.settings = data.settings;
      if (data.chapterWordRange !== undefined) body.chapterWordRange = data.chapterWordRange;

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

  updateProject: async (id: string, data: ProjectUpdateData) => {
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = {};
      // 显式提交空字符串 / 空数组：空标准必须如实落库为「未设置」，
      // 不允许靠“不提交”把旧值留在库里冒充已执行。
      Object.entries(data).forEach(([key, value]) => { if (value !== undefined) body[key] = value; });
      const res = await api.put<any>(`/projects/${id}`, body);
      const raw = (res as any).data ?? res;
      const p = mapServerProject(raw);
      set((state) => ({
        projects: state.projects.map((item) => (item.id === id ? p : item)),
        currentProject: state.currentProject?.id === id ? p : state.currentProject,
        loading: false,
      }));
      return p;
    } catch (err: any) {
      set({ loading: false, error: err.message || '更新项目失败' });
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

  deleteProjects: async (ids: string[]) => {
    const uniqueIds = [...new Set(ids.map(id => String(id).trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return { deleted: [], failed: [] };
    set({ loading: true, error: null });
    const outcomes = await Promise.allSettled(uniqueIds.map(id => api.delete(`/projects/${id}`)));
    const deleted: string[] = [];
    const failed: Array<{ id: string; message: string }> = [];
    outcomes.forEach((outcome, index) => {
      const id = uniqueIds[index];
      if (outcome.status === 'fulfilled') deleted.push(id);
      else failed.push({ id, message: outcome.reason?.message || '删除失败' });
    });
    set((state) => ({
      projects: state.projects.filter(project => !deleted.includes(project.id)),
      currentProject: state.currentProject && deleted.includes(state.currentProject.id) ? null : state.currentProject,
      loading: false,
      error: failed.length > 0 ? `${failed.length} 个项目删除失败` : null,
    }));
    return { deleted, failed };
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
